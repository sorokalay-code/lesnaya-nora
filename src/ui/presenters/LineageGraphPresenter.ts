import type { Lineage } from '../../game/genetics/types';
import type { SaveData } from '../../game/types';

export type LineageGraphStatus =
  'current' | 'former-player' | 'living-family' | 'deceased' | 'partner' | 'ancestor';

export type LineageGraphNode = {
  id: string;
  name: string;
  generation: number;
  status: LineageGraphStatus;
  focused: boolean;
};

export interface LineageGraphEdge {
  id: string;
  source: string;
  target: string;
  distance: number;
}

export interface LineageGraphView {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
}

interface LineageRecord {
  id: string;
  name: string;
  generation: number;
  status: LineageGraphStatus;
  priority: number;
  lineage?: Lineage;
}

const STATUS_PRIORITY: Record<LineageGraphStatus, number> = {
  ancestor: 0,
  deceased: 1,
  'living-family': 2,
  partner: 3,
  'former-player': 4,
  current: 5,
};

/** Собирает сохранённые записи семьи в граф только той родословной, которую просматривают. */
export class LineageGraphPresenter {
  static build(save: SaveData, focusId = save.player.lineage?.id): LineageGraphView {
    if (!focusId) return { nodes: [], edges: [] };

    const records = new Map<string, LineageRecord>();
    const addRecord = (name: string, lineage: Lineage | undefined, status: LineageGraphStatus) => {
      if (!lineage) return;
      const priority = STATUS_PRIORITY[status];
      const existing = records.get(lineage.id);
      if (existing && existing.priority >= priority) {
        if (!existing.lineage) existing.lineage = lineage;
        return;
      }

      records.set(lineage.id, {
        id: lineage.id,
        name,
        generation: lineage.generation,
        status,
        priority,
        lineage,
      });
    };

    addRecord(save.player.name ?? 'Ты', save.player.lineage, 'current');
    for (const kit of save.kits) {
      const status: LineageGraphStatus = kit.wasPlayer
        ? 'former-player'
        : kit.alive
          ? 'living-family'
          : 'deceased';
      addRecord(kit.name, kit.lineage, status);
    }
    for (const partner of save.partners) addRecord(partner.name, partner.lineage, 'partner');

    for (const record of [...records.values()]) {
      for (const ancestor of record.lineage?.ancestors ?? []) {
        const existing = records.get(ancestor.id);
        if (existing) continue;
        records.set(ancestor.id, {
          id: ancestor.id,
          name: ancestor.name,
          generation: ancestor.generation,
          status: 'ancestor',
          priority: STATUS_PRIORITY.ancestor,
        });
      }
    }

    const knownLineages = [...records.values()].flatMap((record) =>
      record.lineage ? [record.lineage] : [],
    );
    const directEdges = new Map<string, LineageGraphEdge>();
    for (const lineage of knownLineages) {
      for (const ancestor of lineage.ancestors) {
        if (ancestor.distance !== 1 || ancestor.id === lineage.id) continue;
        const edge = this.edge(ancestor.id, lineage.id, 1);
        directEdges.set(edge.id, edge);
      }
    }

    const edges = new Map(directEdges);
    const directAdjacency = this.adjacency(directEdges.values());
    for (const lineage of knownLineages) {
      for (const ancestor of lineage.ancestors) {
        if (
          ancestor.distance <= 1 ||
          ancestor.id === lineage.id ||
          this.hasPath(ancestor.id, lineage.id, directAdjacency)
        )
          continue;
        const edge = this.edge(ancestor.id, lineage.id, ancestor.distance);
        edges.set(edge.id, edge);
      }
    }

    if (!records.has(focusId)) return { nodes: [], edges: [] };
    const connectedIds = this.connectedComponent(focusId, edges.values());
    return {
      nodes: [...records.values()]
        .filter((record) => connectedIds.has(record.id))
        .map(({ id, name, generation, status }) => ({
          id,
          name,
          generation,
          status,
          focused: id === focusId,
        })),
      edges: [...edges.values()].filter(
        (edge) => connectedIds.has(edge.source) && connectedIds.has(edge.target),
      ),
    };
  }

  private static edge(source: string, target: string, distance: number): LineageGraphEdge {
    return { id: `${source}->${target}`, source, target, distance };
  }

  private static adjacency(edges: Iterable<LineageGraphEdge>): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();
    for (const { source, target } of edges) {
      const targets = adjacency.get(source) ?? new Set<string>();
      targets.add(target);
      adjacency.set(source, targets);
    }
    return adjacency;
  }

  private static hasPath(
    source: string,
    target: string,
    adjacency: Map<string, Set<string>>,
  ): boolean {
    const pending = [source];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(adjacency.get(current) ?? []));
    }
    return false;
  }

  private static connectedComponent(start: string, edges: Iterable<LineageGraphEdge>): Set<string> {
    const adjacency = new Map<string, Set<string>>();
    for (const { source, target } of edges) {
      const sources = adjacency.get(source) ?? new Set<string>();
      const targets = adjacency.get(target) ?? new Set<string>();
      sources.add(target);
      targets.add(source);
      adjacency.set(source, sources);
      adjacency.set(target, targets);
    }

    const connected = new Set<string>();
    const pending = [start];
    while (pending.length) {
      const current = pending.pop()!;
      if (connected.has(current)) continue;
      connected.add(current);
      pending.push(...(adjacency.get(current) ?? []));
    }
    return connected;
  }
}
