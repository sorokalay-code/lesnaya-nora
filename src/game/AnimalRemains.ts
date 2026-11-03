import type * as THREE from 'three';
import type { AppearanceTraits } from './AnimalAppearance';
import { ModelAssets } from './ModelAssets';
import { RemainsVisuals } from './RemainsVisuals';
import { HALF_DAY_MINUTES, remainsStage, type RemainsKind } from './RemainsData';
import type { Genes, SaveData } from './types';

export interface RemainsSubject {
  kind: RemainsKind;
  root: THREE.Group;
  genes?: Genes;
  appearance?: AppearanceTraits;
}

/** Сохраняет смерти и меняет стадии останков по игровым часам, независимо от кадров и сна. */
export class AnimalRemains {
  private nextUpdate = 0;
  private readonly visuals = new RemainsVisuals();
  private readonly seen = new WeakSet<THREE.Group>();
  private readonly rendered = new Map<number, { root: THREE.Group; stage: 'body' | 'skeleton' }>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly save: SaveData,
    private readonly floorAt: (x: number, z: number, y: number) => number = (_x, _z, y) => y,
  ) {
    this.update();
  }

  record(subject: RemainsSubject): void {
    if (this.seen.has(subject.root)) return;
    this.seen.add(subject.root);
    const identity: unknown = subject.root.userData.remainsIdentity;
    if (typeof identity === 'string') {
      const dead = (this.save.deadPopulation ??= []);
      if (!dead.includes(identity)) dead.push(identity);
    }
    if (this.save.worldConfig?.leaveRemains === false) return;
    const { root } = subject;
    const records = (this.save.remains ??= []);
    const id = this.save.nextRemainsId ?? 1;
    this.save.nextRemainsId = id + 1;
    records.push({
      id,
      kind: subject.kind,
      diedAt: this.save.clock,
      x: root.position.x,
      y: this.floorAt(root.position.x, root.position.z, root.position.y),
      z: root.position.z,
      heading: root.rotation.y,
      scale: { x: root.scale.x, y: root.scale.y, z: root.scale.z },
      genes: subject.genes ? structuredClone(subject.genes) : undefined,
      appearance: subject.appearance ? { ...subject.appearance } : undefined,
    });
    this.update(true);
  }

  update(force = false): void {
    if (!force && this.save.clock < this.nextUpdate) return;
    this.nextUpdate = this.save.clock + 1;
    const records = this.save.remains ?? [];
    this.save.remains = records.filter(
      (data) =>
        this.save.worldConfig?.leaveRemains !== false &&
        remainsStage(this.save.clock, data.diedAt) !== 'gone',
    );
    const active = new Set(this.save.remains.map((data) => data.id));
    for (const [id, visual] of this.rendered) if (!active.has(id)) this.remove(id, visual);
    for (const data of this.save.remains) {
      const stage = remainsStage(this.save.clock, data.diedAt);
      if (stage === 'gone') continue;
      this.nextUpdate = Math.min(
        this.nextUpdate,
        data.diedAt + HALF_DAY_MINUTES * (stage === 'body' ? 1 : 2),
      );
      const existing = this.rendered.get(data.id);
      if (existing?.stage !== stage) {
        if (existing) this.remove(data.id, existing);
        const root = stage === 'body' ? this.visuals.body(data) : this.visuals.skeleton(data);
        root.position.set(data.x, data.y, data.z);
        root.rotation.y = data.heading;
        this.scene.add(root);
        this.rendered.set(data.id, { root, stage });
      }
      const visual = this.rendered.get(data.id)!;
      visual.root.visible =
        Math.hypot(data.x - this.save.player.x, data.z - this.save.player.z) < 76;
    }
  }

  private remove(id: number, visual: { root: THREE.Group; stage: 'body' | 'skeleton' }): void {
    visual.root.removeFromParent();
    if (visual.stage === 'body') ModelAssets.shared.release(visual.root);
    this.rendered.delete(id);
  }

  dispose(): void {
    for (const [id, visual] of this.rendered) this.remove(id, visual);
    this.visuals.dispose();
  }
}
