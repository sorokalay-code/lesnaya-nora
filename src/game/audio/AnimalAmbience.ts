import type { Object3D } from 'three';
import { Random } from '../Random';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { AnimalVoiceListener, AnimalVoiceKind } from './AnimalVoice';
import type { AnimalVoiceSources, VoiceActor } from './AnimalVoiceSources';

interface Context {
  sources: Pick<AnimalVoiceSources, 'all'>;
  listener: () => { x: number; y: number; z: number };
  facing: () => { x: number; z: number };
  sheltered: (point: { x: number; y: number; z: number }) => boolean;
  sound: AnimalVoiceListener;
  rng: Random;
}
const INTERVALS: Record<AnimalVoiceKind, number> = {
  weasel: 32,
  rabbit: 24,
  squirrel: 15,
  hedgehog: 22,
  beaver: 30,
  deer: 28,
  moose: 42,
  boar: 28,
  fox: 32,
  dog: 30,
  wolf: 45,
  lynx: 38,
  bear: 42,
  hawk: 30,
  snake: 45,
};

/** Редко озвучивает реальных соседей с личными паузами, учётом времени суток, расстояния и подземного положения. */
export class AnimalAmbience {
  private readonly cooldowns = new WeakMap<Object3D, number>();
  private nextAt = 3;

  constructor(private readonly context: Context) {}

  update(time: number, night: boolean): void {
    if (time < this.nextAt) return;
    this.nextAt = time + 1;
    const player = this.context.listener();
    const sheltered = this.context.sheltered(player);
    let chosen: VoiceActor | undefined;
    let score = -Infinity;
    for (const source of this.context.sources.all()) {
      if (AnimalRestraint.active(source.root)) continue;
      if (source.root.userData.conversing || time < (this.cooldowns.get(source.root) ?? 0))
        continue;
      const position = source.root.position;
      const distance = Math.hypot(
        position.x - player.x,
        position.y - player.y,
        position.z - player.z,
      );
      if (distance > 30 || this.context.sheltered(position) !== sheltered) continue;
      if (night && (source.kind === 'hawk' || source.kind === 'squirrel')) continue;
      if (!night && source.kind === 'wolf' && this.context.rng.chance(0.85)) continue;
      const weight = this.context.rng.next() * 12 - distance * 0.25;
      if (weight > score) {
        chosen = source;
        score = weight;
      }
    }
    if (!chosen) return;
    const dx = chosen.root.position.x - player.x,
      dz = chosen.root.position.z - player.z;
    const distance = Math.hypot(dx, chosen.root.position.y - player.y, dz);
    const facing = this.context.facing();
    const volume = Math.max(0.025, (1 - distance / 30) ** 1.6) * (sheltered ? 0.65 : 1);
    const pan = Math.max(
      -0.85,
      Math.min(0.85, (-facing.z * dx + facing.x * dz) / Math.max(1, distance)),
    );
    this.context.sound({ kind: chosen.kind, activity: chosen.activity, volume, pan });
    this.cooldowns.set(
      chosen.root,
      time + INTERVALS[chosen.kind] * this.context.rng.range(0.8, 1.4),
    );
    this.nextAt = time + this.context.rng.range(2.8, 5.5);
  }
}
