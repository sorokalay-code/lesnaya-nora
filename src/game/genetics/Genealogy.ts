import type { Lineage, Ancestor } from './types';

/** Строит ограниченный список реальных предков, считает поколение и близкое родство без дерева-дубликата. */
export class Genealogy {
  static founder(id: string): Lineage {
    return { id, generation: 1, ancestors: [] };
  }

  static child(id: string, parents: { name: string; lineage: Lineage }[]): Lineage {
    const ancestors = new Map<string, Ancestor>();
    for (const parent of parents) {
      ancestors.set(parent.lineage.id, {
        id: parent.lineage.id,
        name: parent.name,
        generation: parent.lineage.generation,
        distance: 1,
      });
      for (const ancestor of parent.lineage.ancestors) {
        const distance = ancestor.distance + 1;
        if (distance > 5 || (ancestors.get(ancestor.id)?.distance ?? Infinity) <= distance)
          continue;
        ancestors.set(ancestor.id, { ...ancestor, distance });
      }
    }
    return {
      id,
      generation: 1 + Math.max(0, ...parents.map((parent) => parent.lineage.generation)),
      ancestors: [...ancestors.values()].sort((a, b) => a.distance - b.distance).slice(0, 32),
    };
  }

  static related(a?: Lineage, b?: Lineage): boolean {
    if (!a || !b) return false;
    const ids = new Set([
      a.id,
      ...a.ancestors.filter((item) => item.distance <= 3).map((item) => item.id),
    ]);
    return [b.id, ...b.ancestors.filter((item) => item.distance <= 3).map((item) => item.id)].some(
      (id) => ids.has(id),
    );
  }
}
