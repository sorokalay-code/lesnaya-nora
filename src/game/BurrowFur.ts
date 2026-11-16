import type { Excavation } from './Excavation';
import type { DigNode, SaveData } from './types';

export interface FurPatch extends DigNode {
  amount: number;
}

export const MAX_BURROW_FUR = 6;
const HEAT_RADIUS = 3.5;
const key = ({ x, y, z }: DigNode) => `${x}:${y}:${z}`;
const distance = (a: DigNode, b: DigNode) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Хранит пух на полу ходов и считает тепло только по соединённым участкам. */
export class BurrowFur {
  private readonly patches: Map<string, FurPatch>;
  private samples = new WeakMap<DigNode, { point: DigNode; revision: number; amount: number }>();

  constructor(
    private readonly save: SaveData,
    private readonly earth: Pick<Excavation, 'burrowAt' | 'isSheltered' | 'revision'>,
  ) {
    this.patches = new Map((save.burrowFur ?? []).map((patch) => [key(patch), patch]));
  }

  spread(): FurPatch | 'outside' | 'full' | 'empty' {
    const point = this.save.player;
    const location = this.earth.burrowAt(point);
    if (!location || !this.earth.isSheltered(point.x, point.y, point.z)) return 'outside';
    const floor = location.network.floors[location.node];
    if (!this.earth.isSheltered(floor.x, floor.y, floor.z)) return 'outside';
    const patch = this.patches.get(key(floor)) ?? { ...floor, amount: 0 };
    if (patch.amount >= MAX_BURROW_FUR) return 'full';
    if (this.save.materials.fur < 1) return 'empty';

    if (patch.amount === 0) {
      this.patches.set(key(patch), patch);
      (this.save.burrowFur ??= []).push(patch);
    }
    this.save.materials.fur--;
    patch.amount++;
    this.samples = new WeakMap();
    return patch;
  }

  heatAt(point: DigNode): number {
    if (!this.patches.size || !this.earth.isSheltered(point.x, point.y, point.z)) return 0;
    const sample = this.samples.get(point);
    if (sample?.revision === this.earth.revision && distance(point, sample.point) < 0.28)
      return sample.amount;

    const location = this.earth.burrowAt(point);
    let amount = 0;
    if (location) {
      for (const patch of this.patches.values()) {
        if (distance(point, patch) > HEAT_RADIUS) continue;
        const source = this.earth.burrowAt(patch);
        if (!source || source.network !== location.network) continue;
        if (location.network.distanceBetween(location, source) <= HEAT_RADIUS)
          amount += patch.amount;
      }
    }

    amount = Math.min(MAX_BURROW_FUR, amount);
    this.samples.set(point, {
      point: { x: point.x, y: point.y, z: point.z },
      revision: this.earth.revision,
      amount,
    });
    return amount;
  }
}
