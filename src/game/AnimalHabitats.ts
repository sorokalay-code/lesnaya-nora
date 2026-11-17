import { PREDATOR_HABITATS, WILDLIFE_HABITATS, type HabitatProfile } from './HabitatProfiles';
import { hash2, Random } from './Random';
import type { WildlifeKind } from './animals/types';
import type { PredatorKind } from './types';
import type { World } from './World';
import { playableWorldLimit } from './WorldConfig';
import { isNightAt } from './session/WorldCalendar';

export interface HabitatPoint {
  x: number;
  z: number;
}

export interface Habitat extends HabitatPoint {
  readonly key: number;
  readonly radius: number;
  readonly profile: HabitatProfile;
}

export interface TerritoryIntent {
  home: Habitat;
  destination: HabitatPoint;
  hunting: boolean;
  resting: boolean;
}

const SITE_SAMPLES = 145;
const WOLF_DEN_SEPARATION = 39;
const HUNT_LENGTH = 210;

/** Выбирает участки по зерну и рельефу. Маршруты не зависят от порядка кадров или загрузки мира. */
export class AnimalHabitats {
  private readonly sites = new Map<string, Habitat>();
  private readonly destinations = new WeakMap<Habitat, { phase: string; point: HabitatPoint }>();
  private readonly dens: Habitat[] = [];
  private wolfRoutes: readonly TerritoryIntent[] = [];
  private readonly scale: number;
  private readonly limit: number;

  constructor(
    private readonly world: Pick<World, 'biomeAt' | 'heightAt' | 'waterSources'> &
      Partial<Pick<World, 'waterAt' | 'nearWater'>>,
    private readonly seed: number,
    size: number,
  ) {
    this.scale = size / 110;
    this.limit = Math.min(playableWorldLimit(size), 97 * this.scale) - 2;
  }

  predator(kind: PredatorKind, slot: number): Habitat | undefined {
    const profile = PREDATOR_HABITATS[kind];
    if (!profile) return;
    if (kind === 'wolf') {
      for (let i = this.dens.length; i <= slot; i++) {
        const den = this.site(kind, i, profile, (x, z) =>
          this.dens.reduce((cost, other) => {
            const d = Math.hypot(x - other.x, z - other.z);
            return cost + Math.max(0, 1 - d / (WOLF_DEN_SEPARATION * this.scale)) * 85;
          }, 0),
        );
        if (!den) return;
        this.dens.push(den);
      }
      return this.dens[slot];
    }

    return this.site(kind, slot, profile, (x, z) =>
      kind === 'fox' || kind === 'lynx' ? this.denPressure(this.dens, x, z) * 0.55 : 0,
    );
  }

  wildlife(kind: WildlifeKind, slot: number): Habitat | undefined {
    const profile = WILDLIFE_HABITATS[kind];
    if (profile.mode === 'water') return;
    const group = profile.mode === 'roaming' && kind !== 'roe-deer' ? Math.floor(slot / 3) : slot;
    return this.site(kind, group, profile, (x, z) => this.denPressure(this.dens, x, z));
  }

  setWolfRoutes(routes: readonly TerritoryIntent[]): void {
    this.wolfRoutes = routes;
  }

  riskAt(x: number, z: number): number {
    let risk = 0;
    for (const { home, destination, hunting } of this.wolfRoutes) {
      const fromDen = Math.hypot(x - home.x, z - home.z);
      const denRisk = Math.max(0, 1 - fromDen / home.radius) * 3;
      const fromHunt = Math.hypot(x - destination.x, z - destination.z);
      const huntRisk = hunting ? Math.max(0, 1 - fromHunt / (home.radius * 0.48)) * 3 : 0;
      risk = Math.max(risk, denRisk, huntRisk);
    }
    return risk;
  }

  wolfHunting(home: Habitat, clock: number): boolean {
    const minute = (clock + (home.key % 65)) % 1440;
    return (
      (minute >= 330 && minute < 330 + HUNT_LENGTH) ||
      (minute >= 1080 && minute < 1080 + HUNT_LENGTH)
    );
  }

  intent(home: Habitat, clock: number, wolf = false): TerritoryIntent {
    const hunting = !wolf || this.wolfHunting(home, clock);
    const resting = wolf ? !hunting : this.resting(home, clock);
    const bedding = home.profile.activeDuring === 'twilight' && resting;
    const factor = resting
      ? bedding
        ? 0.65
        : 0.16
      : wolf
        ? 0.95
        : home.profile.mode === 'roaming'
          ? 1
          : home.profile.mode === 'burrow'
            ? 0.73
            : 0.85;
    const duration = wolf ? (hunting ? 105 : 65) : home.profile.mode === 'roaming' ? 215 : 58;
    // Лёжка сохраняется до смены периода отдыха, кормовые места обновляются чаще.
    const phase = bedding
      ? Math.floor((clock + 180) / 720)
      : Math.floor((clock + (home.key % duration)) / duration);
    const tag = `${Number(resting)}:${phase}`;
    let previous = this.destinations.get(home);
    if (previous?.phase !== tag) {
      const rng = new Random(home.key ^ phase ^ (hunting ? 3875 : 9027));
      const point = this.pickDestination(home, factor, rng, wolf, hunting, bedding);
      previous = { phase: tag, point };
      this.destinations.set(home, previous);
    }
    return { home, destination: previous.point, hunting, resting };
  }

  private resting(home: Habitat, clock: number): boolean {
    const activity = home.profile.activeDuring;
    const minute = clock % 1440;
    if (activity === 'twilight')
      return minute < 240 || minute >= 1380 || (minute >= 600 && minute < 960);
    if (activity === 'brief-outings') return (clock + (home.key % 240)) % 240 >= 42;
    if (activity === 'day') return isNightAt(clock);
    return activity === 'night' && !isNightAt(clock);
  }

  nearHome(home: HabitatPoint, member: number): HabitatPoint {
    const angle = member * 2.399963;
    const radius = 2.4 + (member % 3) * 1.3;
    const x = home.x + Math.cos(angle) * radius;
    const z = home.z + Math.sin(angle) * radius;
    return this.dry(x, z) ? { x, z } : home;
  }

  private site(
    kind: string,
    slot: number,
    profile: HabitatProfile,
    pressure: (x: number, z: number) => number,
  ): Habitat | undefined {
    const id = `${kind}:${slot}`;
    const saved = this.sites.get(id);
    if (saved) return saved;
    const kindSeed = [...kind].reduce(
      (sum, character) => Math.imul(sum, 31) + character.charCodeAt(0),
      0,
    );
    const key = Math.floor(hash2(kindSeed, slot, this.seed) * 0xffffffff);
    const rng = new Random(key);
    const shore = profile.mode === 'shore' && this.world.waterSources.length > 0;
    let best: Habitat | undefined;
    let bestScore = Infinity;
    for (let sample = 0; sample < SITE_SAMPLES; sample++) {
      let x: number;
      let z: number;
      if (shore) {
        const water = rng.pick(this.world.waterSources);
        const angle = rng.range(0, Math.PI * 2);
        const distance = rng.range(2, 12);
        x = water.x + Math.sin(angle) * distance;
        z = water.z + Math.cos(angle) * distance;
      } else {
        x = rng.range(-this.limit, this.limit);
        z = rng.range(-this.limit, this.limit);
      }
      if (Math.hypot(x, z) < 12 * this.scale || !this.dry(x, z)) continue;
      const biome = this.world.biomeAt(x, z);
      const slope = this.slopeAt(x, z);
      if (slope > 0.85) continue;
      const score =
        (profile.biomes.includes(biome) ? 0 : biome === 'garden' ? 35 : 20) +
        (shore && this.world.nearWater?.(x, z, 5) === false ? 32 : 0) +
        slope * 21 +
        pressure(x, z) +
        rng.range(0, 11);
      if (score >= bestScore) continue;
      bestScore = score;
      best = { x, z, key, profile, radius: profile.radius * Math.sqrt(this.scale) };
    }
    if (best) this.sites.set(id, best);
    return best;
  }

  private pickDestination(
    home: Habitat,
    factor: number,
    rng: Random,
    wolf: boolean,
    hunting: boolean,
    bedding: boolean,
  ): HabitatPoint {
    let best: HabitatPoint = home;
    let bestScore = Infinity;
    for (let i = 0; i < 13; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = home.radius * factor * rng.range(wolf && hunting ? 0.55 : 0.28, 1);
      const x = home.x + Math.cos(angle) * distance;
      const z = home.z + Math.sin(angle) * distance;
      if (!this.dry(x, z)) continue;
      const slope = this.slopeAt(x, z);
      if (slope > 0.85) continue;
      const biome = this.world.biomeAt(x, z);
      if (biome === 'garden' && !home.profile.biomes.includes(biome)) continue;
      const wet = home.profile.mode === 'shore' && this.world.waterSources.length > 0;
      const preferred =
        wolf && hunting
          ? biome === 'meadow'
          : bedding
            ? biome === 'forest'
            : home.profile.biomes.includes(biome);
      const score =
        (preferred ? 0 : 8) +
        (wet && this.world.nearWater?.(x, z, 5) === false ? 40 : 0) +
        (wolf ? 0 : this.riskAt(x, z) * 4) +
        slope * 12 +
        rng.range(0, 6);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    return best;
  }

  private dry(x: number, z: number): boolean {
    return (
      Math.abs(x) < this.limit &&
      Math.abs(z) < this.limit &&
      (this.world.waterAt?.(x, z)?.depth ?? 0) < 0.09
    );
  }

  private slopeAt(x: number, z: number): number {
    const height = this.world.heightAt(x, z);
    return (
      Math.max(
        Math.abs(this.world.heightAt(x + 2, z) - height),
        Math.abs(this.world.heightAt(x - 2, z) - height),
        Math.abs(this.world.heightAt(x, z + 2) - height),
        Math.abs(this.world.heightAt(x, z - 2) - height),
      ) / 2
    );
  }

  private denPressure(dens: readonly Habitat[], x: number, z: number): number {
    let pressure = 0;
    for (const den of dens) {
      const distance = Math.hypot(x - den.x, z - den.z);
      pressure = Math.max(pressure, Math.max(0, 1 - distance / den.radius) * 24);
    }
    return pressure;
  }
}
