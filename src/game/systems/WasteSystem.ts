import type * as THREE from 'three';
import { type SaveData, type WasteData } from '../types';
import { WasteVisuals } from './WasteVisuals';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Хранит нечистоты три игровых дня, позволяет убирать их и возвращает питательные вещества почве. */
export class WasteSystem {
  static readonly lifetime = 3 * 1440;
  private readonly visuals: WasteVisuals;
  private nextVisual = 0;
  private elapsed = 0;
  private nextId = 1;
  private nextExpiry = Infinity;

  constructor(
    scene: THREE.Scene,
    private readonly save: SaveData,
    private readonly groundY: (w: WasteData) => number = (w) => w.y,
    private readonly fertilize: (w: WasteData) => void = () => {},
  ) {
    this.visuals = new WasteVisuals(scene);
    this.expire();
    for (const waste of save.waste) {
      waste.y = this.groundY(waste);
      this.nextId = Math.max(this.nextId, waste.id + 1);
    }
  }

  spawn(kind: WasteData['kind'], x: number, y: number, z: number, size = 1): WasteData {
    const waste: WasteData = { id: this.nextId++, kind, x, y, z, size, age: this.save.clock };
    waste.y = this.groundY(waste);
    this.save.waste.push(waste);
    this.nextExpiry = Math.min(this.nextExpiry, waste.age + WasteSystem.lifetime);
    this.nextVisual = 0;
    return waste;
  }

  nearby(x: number, y: number, z: number, radius = 2.6): WasteData[] {
    return this.save.waste.filter(
      (waste) => Math.hypot(x - waste.x, y - waste.y, z - waste.z) < radius,
    );
  }

  cleanNear(x: number, y: number, z: number): number {
    const ids = new Set(this.nearby(x, y, z).map((waste) => waste.id));
    if (!ids.size) return 0;
    this.save.waste = this.save.waste.filter((waste) => !ids.has(waste.id));
    this.nextVisual = 0;
    return ids.size;
  }

  private expire(): void {
    this.nextExpiry = Infinity;
    this.save.waste = this.save.waste.filter((waste) => {
      if (this.save.clock - waste.age < WasteSystem.lifetime) {
        this.nextExpiry = Math.min(this.nextExpiry, waste.age + WasteSystem.lifetime);
        return true;
      }
      this.fertilize(waste);
      return false;
    });
  }

  update(dt: number, px: number, py: number, pz: number): void {
    this.elapsed += dt;
    if (this.save.clock >= this.nextExpiry) this.expire();
    for (const waste of this.save.waste) {
      if (Math.hypot(px - waste.x, pz - waste.z) < 0.7 && Math.abs(py - waste.y) < 1.2)
        this.save.player.dirtiness = clamp(
          this.save.player.dirtiness + dt * (waste.kind === 'pellets' ? 0.16 : 0.6),
          0,
          100,
        );
    }
    if (this.elapsed >= this.nextVisual) {
      this.nextVisual = this.elapsed + 0.35;
      this.visuals.update(this.save.waste, { x: px, y: py, z: pz });
    }
  }
}
