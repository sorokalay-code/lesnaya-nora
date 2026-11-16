import type { Soundscape } from '../Audio';
import type { AttackCue, AttackSource } from './AttackCue';

interface Context {
  sound: Pick<Soundscape, 'attack'>;
  listener: () => { x: number; y: number; z: number };
  facing: () => { x: number; z: number };
  combatAllowed: () => boolean;
  elapsed: () => number;
}

/** Подписывает животных на пространственные звуки атак; дальние события и плотные очереди не озвучиваются. */
export class AttackSounds {
  private readonly sources = new Set<AttackSource>();
  private nextAt = -Infinity;

  constructor(private readonly context: Context) {}

  bind(sources: AttackSource[]): void {
    this.dispose();
    for (const source of sources) this.add(source);
  }

  add(source: AttackSource): void {
    if (this.sources.has(source)) return;
    this.sources.add(source);
    source.setAttackListener((event) => this.emit(event));
  }

  remove(source: AttackSource): void {
    if (this.sources.delete(source)) source.setAttackListener();
  }

  emit(event: AttackCue): void {
    if (!this.context.combatAllowed()) return;
    const listener = this.context.listener(),
      time = this.context.elapsed();
    const dx = event.x - listener.x,
      dz = event.z - listener.z;
    const distance = Math.hypot(dx, event.y - listener.y, dz);
    if (distance >= 24 || time < this.nextAt) return;
    const facing = this.context.facing();
    const pan = Math.max(
      -0.85,
      Math.min(0.85, (-facing.z * dx + facing.x * dz) / Math.max(1, distance)),
    );
    const volume = Math.max(0.05, (1 - distance / 24) ** 1.4);
    this.nextAt = time + 0.07;
    this.context.sound.attack(event.kind, event.phase, volume, pan);
  }

  dispose(): void {
    for (const source of this.sources) source.setAttackListener();
    this.sources.clear();
    this.nextAt = -Infinity;
  }
}
