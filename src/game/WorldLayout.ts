import { defaultMapGeneration, type MapGeneration } from './MapGeneration';
import { hash2, Random, smoothNoise } from './Random';
import type { Biome } from './types';
import type { BiomePreference } from './WorldConfig';
import type { WaterDefinition } from './WaterMap';

const RANDOM_PLACEMENT_ATTEMPTS = 80;
const PLACEMENT_GRID_SIDE = 19;
/** Запас учитывает полуширину реки при 500% воды и промежутки между её опорными точками. */
const RIVER_PLACEMENT_CLEARANCE = 15;

export interface LandscapeRegion {
  x: number;
  z: number;
  radius: number;
  biome: Biome;
  label: string;
}

/** Единый план карты для биомов, рельефа, воды, ориентиров и огородных построек. */
export class WorldLayout {
  readonly settings: MapGeneration;
  readonly regions: readonly LandscapeRegion[];
  readonly water: readonly WaterDefinition[];
  readonly gardens: readonly LandscapeRegion[];
  readonly swamps: readonly LandscapeRegion[];

  constructor(
    private readonly seed: number,
    settings?: MapGeneration,
  ) {
    // Отсутствие новых полей сохраняет географию уже существующих историй v4.
    this.settings = settings ?? { ...defaultMapGeneration(), layout: 'classic' };
    const rng = new Random(Math.floor(hash2(seed, seed, 9187) * 0xffffffff));
    const occupied: LandscapeRegion[] = [
      { x: 0, z: 0, radius: 12, biome: 'meadow', label: 'Родная поляна' },
    ];
    const river = this.makeRiver(rng);
    const protectedRegions = [
      occupied[0],
      ...(river?.points ?? []).map(({ x, z }) => ({
        x,
        z,
        radius: RIVER_PLACEMENT_CLEARANCE,
        biome: 'meadow' as const,
        label: '',
      })),
    ];
    const place = (
      biome: Biome,
      radius: number,
      label: string,
      x: number,
      z: number,
      randomize = this.settings.layout === 'generated',
    ) => {
      if (randomize) {
        // Ограниченный поиск гарантирует завершение даже при максимальном числе областей.
        // Поляна, русло и огороды защищены жёстко; остальные области могут сближаться.
        // После случайных попыток проверяем сетку, чтобы плотная карта не зависела от удачи.
        let best = -Infinity;
        const clearanceRadius = biome === 'garden' ? radius * Math.SQRT2 : radius;
        const totalAttempts = RANDOM_PLACEMENT_ATTEMPTS + PLACEMENT_GRID_SIDE ** 2;
        for (let attempt = 0; attempt < totalAttempts; attempt++) {
          const gridIndex = attempt - RANDOM_PLACEMENT_ATTEMPTS;
          const px =
            gridIndex < 0 ? rng.range(-82, 82) : -81 + (gridIndex % PLACEMENT_GRID_SIDE) * 9;
          const pz =
            gridIndex < 0
              ? rng.range(-82, 82)
              : -81 + Math.floor(gridIndex / PLACEMENT_GRID_SIDE) * 9;
          if (
            protectedRegions.some(
              (region) =>
                Math.hypot(px - region.x, pz - region.z) < region.radius + clearanceRadius + 3,
            )
          )
            continue;
          const clearance = Math.min(
            ...occupied.map(
              (region) =>
                Math.hypot(px - region.x, pz - region.z) - region.radius - clearanceRadius,
            ),
          );
          if (clearance > best) {
            x = px;
            z = pz;
            best = clearance;
          }
          if (clearance > 4) break;
        }
      }
      const region = { x, z, radius, biome, label };
      occupied.push(region);
      if (biome === 'garden') protectedRegions.push({ ...region, radius: radius * Math.SQRT2 });
      return region;
    };
    const gardenLabels = ['Дачный огород', 'Старый огород'];
    this.gardens = Array.from({ length: this.settings.gardens }, (_, index) =>
      place(
        'garden',
        index === 0 ? 16 : 13,
        gardenLabels[index] ?? `Огород ${index + 1}`,
        index % 2 === 0 ? 34 : -35,
        31 - index * 2,
        this.settings.layout === 'generated' || index >= 2,
      ),
    );
    this.swamps = Array.from({ length: this.settings.swamps }, (_, index) =>
      place(
        'swamp',
        20,
        index === 0 ? 'Тихая топь' : `Топь ${index + 1}`,
        -31 + index * 38,
        -25,
        this.settings.layout === 'generated' || index >= 1,
      ),
    );
    if (this.settings.layout === 'classic') place('forest', 14, 'Сосновая чаща', 27, -34);
    this.regions = occupied.slice();
    const water: WaterDefinition[] = [];
    const classicPonds = [
      { x: 9, z: -7, radius: 4.4, depth: 2.2, id: 'meadow-pond' },
      { x: -28, z: -25, radius: 6, depth: 2.6, id: 'swamp-pond' },
      { x: -39, z: -18, radius: 3.5, depth: 1.7, id: 'small-pond' },
    ];
    for (let index = 0; index < this.settings.ponds; index++) {
      const classic = classicPonds[index % classicPonds.length];
      const site =
        this.settings.layout === 'classic' && index < 3
          ? classic
          : place('meadow', 15, '', classic.x, classic.z, true);
      water.push({
        id: index < 3 ? classic.id : `pond-${index}`,
        kind: 'pond',
        points: [{ x: site.x, z: site.z }],
        radius: classic.radius,
        depth: index < 3 ? classic.depth : 2.2,
      });
    }
    if (river) water.push(river);
    this.water = water;
  }

  private makeRiver(rng: Random): WaterDefinition | undefined {
    if (!this.settings.river) return;
    // Новая река идёт по одной стороне, а её коридор резервируется до размещения огородов.
    const side = rng.chance(0.5) ? 1 : -1;
    const points =
      this.settings.layout === 'classic'
        ? [
            { x: -48, z: -88 },
            { x: -40, z: -70 },
            { x: -44, z: -53 },
            { x: -35, z: -38 },
            { x: -28, z: -25 },
          ]
        : Array.from({ length: 7 }, (_, index) => ({
            x: side * rng.range(48, 72),
            z: -90 + index * 30,
          }));
    return { id: 'forest-river', kind: 'river', points, radius: 3.4, depth: 2.1 };
  }

  biomeAt(x: number, z: number, preference: BiomePreference): Biome {
    if (Math.hypot(x, z) < 12) return 'meadow';
    for (const garden of this.gardens)
      if (Math.hypot(x - garden.x, z - garden.z) < garden.radius - 1) return 'garden';
    for (const swamp of this.swamps)
      if (
        Math.hypot(x - swamp.x, z - swamp.z) < swamp.radius - 1 &&
        smoothNoise(x / 12, z / 12, this.seed + 78) > 0.25
      )
        return 'swamp';
    const noise =
      smoothNoise(
        x / (19 * this.settings.biomeScale),
        z / (19 * this.settings.biomeScale),
        this.seed,
      ) *
        0.7 +
      smoothNoise(
        x / (8 * this.settings.biomeScale),
        z / (8 * this.settings.biomeScale),
        this.seed + 19,
      ) *
        0.3;
    if (preference !== 'mixed') return noise > 0.3 ? preference : 'meadow';
    return noise > 1 - this.settings.forestCover ? 'forest' : 'meadow';
  }
}
