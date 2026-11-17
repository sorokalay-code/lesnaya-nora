import type { Habitat, HabitatPoint } from './AnimalHabitats';
import { WILDLIFE_HABITATS } from './HabitatProfiles';
import { hash2 } from './Random';
import type { DigNode } from './types';
import type { WaterBody, WaterSample } from './WaterMap';
import type { World } from './World';
import { playableWorldLimit } from './WorldConfig';

export type AquaticKind = 'beaver' | 'duck' | 'fish' | 'frog' | 'pike';
export const FISH_MIN_DEPTH = 0.39;
export const PIKE_MIN_DEPTH = 0.65;
const SHALLOW_DEPTH = 0.08;
const SPAWN_MAX_DEPTH = 0.62;
const MAX_SITE_POINTS = 64;
const SEARCH_HEADINGS = 12;
const BODY_GROUP = { beaver: 2, duck: 2, fish: 4, frog: 3, pike: 2 } as const;

export interface Bank {
  dry: DigNode;
  shallows: DigNode;
  swimming?: DigNode;
  angle: number;
}

export interface AquaticHabitat {
  body: WaterBody;
  banks: readonly Bank[];
  shallows: readonly DigNode[];
  fish: readonly DigNode[];
  pike: readonly DigNode[];
}

type Terrain = Pick<World, 'heightAt' | 'waterAt' | 'size' | 'biomeAt'>;

export function inWaterPath(
  waterAt: (x: number, z: number) => WaterSample | undefined,
  from: HabitatPoint,
  to: HabitatPoint,
  body: string,
  depth: number,
): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.28));
  for (let step = 1; step <= count; step++) {
    const fraction = step / count;
    const water = waterAt(from.x + (to.x - from.x) * fraction, from.z + (to.z - from.z) * fraction);
    if (!water || water.body.id !== body || water.depth < depth) return false;
  }
  return true;
}

/** Индексирует доступные берега, мелководья и зоны плавания по фактической глубине карты. */
export class AquaticHabitats {
  readonly waters: readonly AquaticHabitat[];
  private readonly byBody = new Map<string, AquaticHabitat>();
  private readonly eligible = new Map<AquaticKind, readonly AquaticHabitat[]>();
  private readonly limit: number;

  constructor(
    private readonly world: Terrain,
    bodies: readonly WaterBody[],
    private readonly seed: number,
  ) {
    this.limit = Math.min(playableWorldLimit(world.size), (world.size * 97) / 110) - 0.4;
    this.waters = bodies.map((body) => this.survey(body));
    for (const survey of this.waters) this.byBody.set(survey.body.id, survey);
  }

  get(id: string): AquaticHabitat | undefined {
    return this.byBody.get(id);
  }

  forKind(kind: AquaticKind): readonly AquaticHabitat[] {
    const previous = this.eligible.get(kind);
    if (previous) return previous;
    const suitable = this.waters.filter((site) => {
      if (kind === 'fish' || kind === 'pike') return site[kind].length > 0;
      if (kind === 'frog') return site.banks.length > 0 && site.shallows.length > 0;
      return site.banks.length > 0 && (kind === 'duck' || site.fish.length > 0);
    });
    const ordered =
      kind === 'frog'
        ? suitable.sort((a, b) => Number(b.body.kind === 'bog') - Number(a.body.kind === 'bog'))
        : suitable;
    this.eligible.set(kind, ordered);
    return ordered;
  }

  forSlot(kind: AquaticKind, slot: number, savedBody?: string): AquaticHabitat | undefined {
    const candidates = this.forKind(kind);
    const existing = savedBody ? this.byBody.get(savedBody) : undefined;
    if (existing && candidates.includes(existing)) return existing;
    return candidates[Math.floor(slot / BODY_GROUP[kind]) % candidates.length];
  }

  bank(site: AquaticHabitat, slot: number): Bank {
    return site.banks[(Math.floor(slot / BODY_GROUP.beaver) * 7 + (slot % 2)) % site.banks.length];
  }

  shoreHome(kind: 'beaver' | 'duck', slot: number, body?: string): Habitat | undefined {
    const site = this.forSlot(kind, slot, body);
    if (!site) return;
    const { dry } = this.bank(site, slot);
    const profile = WILDLIFE_HABITATS[kind];
    return {
      x: dry.x,
      z: dry.z,
      key: Math.floor(hash2(slot, kind.length, this.seed) * 0x7fffffff),
      radius: profile.radius,
      profile,
      waterBody: site.body.id,
    };
  }

  closest<T extends HabitatPoint>(points: readonly T[], to: HabitatPoint): T | undefined {
    let best: T | undefined;
    let distance = Infinity;
    for (const point of points) {
      const candidate = (point.x - to.x) ** 2 + (point.z - to.z) ** 2;
      if (candidate >= distance) continue;
      best = point;
      distance = candidate;
    }
    return best;
  }

  pick<T>(points: readonly T[], seed: number, phase = 0): T | undefined {
    return points[Math.floor(hash2(seed, phase, this.seed) * points.length)];
  }

  private survey(body: WaterBody): AquaticHabitat {
    const banks: Bank[] = [];
    const shallows: DigNode[] = [];
    const fish: DigNode[] = [];
    const pike: DigNode[] = [];
    const add = (points: DigNode[], point: DigNode) => {
      if (
        points.length < MAX_SITE_POINTS &&
        !points.some(({ x, z }) => Math.hypot(x - point.x, z - point.z) < 1.45)
      )
        points.push(point);
    };
    const probe = (x: number, z: number) => {
      if (!this.playable(x, z)) return undefined;
      const water = this.world.waterAt(x, z);
      if (!water || water.body.id !== body.id || water.depth < SHALLOW_DEPTH) return undefined;
      const point = { x, z, y: water.level };
      if (water.depth <= SPAWN_MAX_DEPTH) add(shallows, point);
      if (water.depth >= FISH_MIN_DEPTH) add(fish, point);
      if ((body.kind === 'river' || body.kind === 'lake') && water.depth > PIKE_MIN_DEPTH)
        add(pike, point);
      return point;
    };
    for (const center of this.spread(body.points, 12)) {
      probe(center.x, center.z);
      for (let heading = 0; heading < SEARCH_HEADINGS; heading++) {
        const angle = (heading * 2 * Math.PI) / SEARCH_HEADINGS;
        const dx = Math.sin(angle),
          dz = Math.cos(angle);
        const max = body.outline
          ? this.limit * 1.8
          : Math.max(3, body.radius + (body.bankWidth ?? 0) + 5);
        // Для большого озера край дополнительно проверяется прямо по контуру.
        const stride = body.outline ? Math.max(1.5, max / 38) : Math.max(0.45, body.radius / 18);
        let previous: DigNode | undefined;
        for (let distance = stride; distance <= max; distance += stride) {
          const x = center.x + dx * distance,
            z = center.z + dz * distance;
          const wet = probe(x, z);
          if (previous && !wet) {
            this.scanBank(banks, body.id, previous, dx, dz, stride * 3 + 5, probe);
            break;
          }
          previous = wet;
        }
      }
    }
    if (body.outline) {
      for (const edge of this.spread(body.outline, 20)) {
        for (let heading = 0; heading < SEARCH_HEADINGS; heading += 2) {
          const angle = (heading * 2 * Math.PI) / SEARCH_HEADINGS;
          const dx = Math.sin(angle),
            dz = Math.cos(angle);
          const wet = probe(edge.x - dx * 3, edge.z - dz * 3);
          if (wet) this.scanBank(banks, body.id, wet, dx, dz, 10, probe);
        }
      }
    }
    return { body, banks, shallows, fish, pike };
  }

  private scanBank(
    banks: Bank[],
    body: string,
    wet: DigNode,
    dx: number,
    dz: number,
    range: number,
    probe: (x: number, z: number) => DigNode | undefined,
  ): void {
    if (banks.length >= MAX_SITE_POINTS) return;
    let shallows = wet;
    for (let offset = 0.25; offset <= range; offset += 0.35) {
      const x = wet.x + dx * offset,
        z = wet.z + dz * offset;
      const water = this.world.waterAt(x, z);
      if (water) {
        if (water.body.id !== body) return;
        if (water.depth >= SHALLOW_DEPTH && water.depth <= SPAWN_MAX_DEPTH) {
          shallows = { x, z, y: water.level };
          probe(x, z);
        }
        continue;
      }
      const y = this.world.heightAt(x, z);
      if (
        !this.playable(x, z) ||
        this.world.biomeAt(x, z) === 'garden' ||
        Math.hypot(x - shallows.x, z - shallows.z) > 3.2 ||
        Math.abs(y - shallows.y) > 0.65 ||
        banks.some(({ dry }) => Math.hypot(dry.x - x, dry.z - z) < 2.3)
      )
        return;
      let swimming: DigNode | undefined;
      for (let inward = 0.4; inward <= 3.8; inward += 0.35) {
        const px = x - dx * inward;
        const pz = z - dz * inward;
        const pool = this.world.waterAt(px, pz);
        if (pool?.body.id !== body || pool.depth < FISH_MIN_DEPTH) continue;
        swimming = { x: px, z: pz, y: pool.level };
        break;
      }
      banks.push({ dry: { x, z, y }, shallows, swimming, angle: Math.atan2(dx, dz) });
      return;
    }
  }

  private spread<T>(points: readonly T[], limit: number): T[] {
    const count = Math.min(limit, points.length);
    return Array.from(
      { length: count },
      (_, index) => points[Math.floor((index * points.length) / count)],
    );
  }

  private playable(x: number, z: number): boolean {
    return Math.max(Math.abs(x), Math.abs(z)) < this.limit;
  }
}
