import { TUNNEL_FLOOR_DEPTH } from './CaveMesher';
import type { DigNode } from './types';

const MERGED_MOUTH_DISTANCE = 4;
const MAX_CACHED_ROUTES = 16;
const distance = (a: DigNode, b: DigNode) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface BurrowLocation {
  network: BurrowNetwork;
  node: number;
  offset: number;
}

/** Анализирует одну связную нору; длины путей и устья кэшируются до следующего изменения раскопа. */
export class BurrowNetwork {
  readonly floors: readonly DigNode[];
  readonly passages: readonly (readonly [number, number])[];
  readonly exits: readonly (readonly number[])[];
  private readonly indices: Map<DigNode, number>;
  private readonly neighbors: { node: number; length: number }[][];
  private readonly distances = new Map<number, readonly number[]>();
  private surfaceDistances?: readonly number[];

  constructor(
    nodes: readonly DigNode[],
    edges: readonly (readonly [DigNode, DigNode])[],
    openings: readonly DigNode[],
  ) {
    this.indices = new Map(nodes.map((node, index) => [node, index]));
    this.floors = nodes.map((node) => ({ ...node, y: node.y - TUNNEL_FLOOR_DEPTH }));
    this.neighbors = nodes.map(() => []);
    const passages: [number, number][] = [];
    for (const [from, to] of edges) {
      const a = this.indices.get(from);
      const b = this.indices.get(to);
      if (a === undefined || b === undefined) continue;
      const length = distance(from, to);
      this.neighbors[a].push({ node: b, length });
      this.neighbors[b].push({ node: a, length });
      passages.push([a, b]);
    }
    this.passages = passages;
    this.exits = this.groupOpenings(openings);
  }

  locate(node: DigNode, position: DigNode): BurrowLocation | undefined {
    const index = this.indices.get(node);
    if (index === undefined) return;
    return { network: this, node: index, offset: distance(this.floors[index], position) };
  }

  hasOpening(opening: DigNode): boolean {
    const index = this.indices.get(opening);
    return index !== undefined && this.exits.some((exit) => exit.includes(index));
  }

  distanceFromOpening(opening: DigNode, location: BurrowLocation): number {
    const index = this.indices.get(opening);
    if (index === undefined || location.network !== this) return Infinity;
    return this.distancesFrom(index)[location.node] + location.offset;
  }

  distanceToSurface(location: BurrowLocation): number {
    if (location.network !== this) return Infinity;
    // Один многоточечный поиск вместо отдельной таблицы для каждого отверстия траншеи.
    this.surfaceDistances ??= this.measure(this.exits.flat());
    return this.surfaceDistances[location.node] + location.offset;
  }

  distanceBetween(from: BurrowLocation, to: BurrowLocation): number {
    if (from.network !== this || to.network !== this) return Infinity;
    return this.distancesFrom(from.node)[to.node] + from.offset + to.offset;
  }

  private groupOpenings(openings: readonly DigNode[]): number[][] {
    const remaining = new Set(openings.filter((node) => this.indices.has(node)));
    const groups: number[][] = [];
    for (const start of remaining) {
      const queue = [start];
      remaining.delete(start);
      for (let head = 0; head < queue.length; head++) {
        for (const candidate of remaining) {
          // Пересекающиеся поверхностные отверстия составляют одно устье, даже если
          // раскопаны с разных сторон. Удлинение открытой траншеи не создаёт запасной выход.
          if (distance(queue[head], candidate) > MERGED_MOUTH_DISTANCE) continue;
          queue.push(candidate);
          remaining.delete(candidate);
        }
      }
      groups.push(queue.map((node) => this.indices.get(node)!));
    }
    return groups;
  }

  private distancesFrom(start: number): readonly number[] {
    const cached = this.distances.get(start);
    if (cached) return cached;
    const distances = this.measure([start]);
    if (this.distances.size >= MAX_CACHED_ROUTES) {
      const oldest = this.distances.keys().next().value;
      if (oldest !== undefined) this.distances.delete(oldest);
    }
    this.distances.set(start, distances);
    return distances;
  }

  private measure(starts: readonly number[]): readonly number[] {
    const distances = this.floors.map(() => Infinity);
    const queue = [...starts];
    const queued = new Set(queue);
    for (const start of starts) distances[start] = 0;
    // Релаксация учитывает длину диагоналей и уклон, в отличие от подсчёта числа камер.
    // Результат нужен при осмотре и нападении, а не в кадровом цикле навигации.
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      queued.delete(node);
      for (const edge of this.neighbors[node]) {
        const length = distances[node] + edge.length;
        if (length >= distances[edge.node]) continue;
        distances[edge.node] = length;
        if (queued.has(edge.node)) continue;
        queued.add(edge.node);
        queue.push(edge.node);
      }
    }
    return distances;
  }
}
