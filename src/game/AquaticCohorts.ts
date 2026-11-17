import {
  Color,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type Scene,
} from 'three';
import type { AquaticHabitat, AquaticHabitats } from './AquaticHabitats';
import type { HabitatPoint } from './AnimalHabitats';
import { hash2 } from './Random';
import type { DigNode, SaveData } from './types';
import type { WaterTerrain } from './WaterNavigation';

export type SpawningKind = 'fish' | 'frog' | 'pike';
export type CohortStage = 'eggs' | 'fry' | 'tadpoles' | 'metamorphosis' | 'settling';
export interface WaterCohort extends HabitatPoint {
  kind: SpawningKind;
  waterBody: string;
  laidAt: number;
  nextSpawnAt: number;
  remaining: number;
}

const DAY = 1440;
const COHORT_SIZE = 6;
const VISIBILITY_RANGE = 39;
const stages = {
  fish: { hatch: 380, metamorphosis: Infinity, settle: 2 * DAY, size: COHORT_SIZE },
  frog: { hatch: 360, metamorphosis: DAY, settle: 2 * DAY, size: COHORT_SIZE },
  pike: { hatch: 480, metamorphosis: Infinity, settle: 3 * DAY, size: 3 },
} as const;

export function waterCohortStage(record: WaterCohort, clock: number): CohortStage {
  const age = clock - record.laidAt;
  const phase = stages[record.kind];
  if (age >= phase.settle) return 'settling';
  if (age < phase.hatch) return 'eggs';
  if (record.kind !== 'frog') return 'fry';
  return age >= phase.metamorphosis ? 'metamorphosis' : 'tadpoles';
}

interface Context {
  save: SaveData;
  habitats: AquaticHabitats;
  terrain: WaterTerrain;
  cover?: (x: number, z: number) => boolean;
  scene: Scene;
  kinds: readonly SpawningKind[];
  enabled: (kind: SpawningKind) => boolean;
  adults: (kind: SpawningKind, body: string) => number;
  settle: (kind: SpawningKind, site: AquaticHabitat, at: DigNode) => boolean;
}

/** Хранит икру и группы молодняка по водоёмам, выпускает взрослых в свободные места. */
export class AquaticCohorts {
  private readonly records = new Map<string, WaterCohort>();
  private readonly visible = new Map<WaterCohort, { stage: CohortStage; group: Group }>();
  private geometry?: SphereGeometry;
  private material?: MeshStandardMaterial;
  private readonly transform = new Object3D();
  private readonly color = new Color();

  constructor(private readonly context: Context) {
    for (const record of context.save.waterCohorts ?? [])
      if (context.kinds.includes(record.kind))
        this.records.set(this.key(record.kind, record.waterBody), record);
  }

  dispose(): void {
    for (const record of this.visible.keys()) this.hide(record);
    this.geometry?.dispose();
    this.material?.dispose();
  }

  update(clock: number, spring: boolean, player: HabitatPoint): void {
    const { habitats, enabled, adults } = this.context;
    for (const kind of this.context.kinds) {
      if (!enabled(kind)) continue;
      for (const site of habitats.forKind(kind)) {
        const key = this.key(kind, site.body.id);
        const record = this.records.get(key);
        if (record?.remaining) {
          this.advance(record, site, clock, player);
          continue;
        }
        if (!spring || clock < (record?.nextSpawnAt ?? 0) || adults(kind, site.body.id) < 2)
          continue;

        const point = this.spawnSite(kind, site, clock);
        if (!point) continue;
        const cohort = {
          kind,
          waterBody: site.body.id,
          x: point.x,
          z: point.z,
          laidAt: clock,
          nextSpawnAt: clock + 7 * DAY,
          remaining: stages[kind].size,
        };
        const saved = (this.context.save.waterCohorts ??= []);
        if (record) saved.splice(saved.indexOf(record), 1, cohort);
        else saved.push(cohort);
        this.records.set(key, cohort);
        this.advance(cohort, site, clock, player);
      }
    }
  }

  private advance(
    record: WaterCohort,
    site: AquaticHabitat,
    clock: number,
    player: HabitatPoint,
  ): void {
    const stage = waterCohortStage(record, clock);
    if (stage === 'settling') {
      this.hide(record);
      const at =
        record.kind === 'frog'
          ? this.context.habitats.closest(
              site.banks.map((bank) => bank.dry),
              record,
            )
          : this.context.habitats.closest(site[record.kind], record);
      if (at) {
        while (record.remaining > 0 && this.context.settle(record.kind, site, at))
          record.remaining--;
      }
      // Группа рассеивается, если в этом водоёме за сутки так и не освободилось место.
      if (!at || clock >= record.laidAt + stages[record.kind].settle + DAY) record.remaining = 0;
      return;
    }
    if (Math.hypot(record.x - player.x, record.z - player.z) > VISIBILITY_RANGE) {
      this.hide(record);
      return;
    }
    this.draw(record, site, stage, clock);
  }

  private spawnSite(kind: SpawningKind, site: AquaticHabitat, clock: number): DigNode | undefined {
    const { habitats } = this.context;
    const phase = Math.floor(clock / DAY);
    if (kind === 'fish')
      return habitats.pick(site.shallows, 17, phase) ?? habitats.pick(site.fish, 17, phase);
    if (kind === 'pike' && this.context.cover) {
      const sheltered = site.shallows.filter((point) => this.context.cover?.(point.x, point.z));
      const edge = habitats.pick(sheltered, 43, phase);
      if (edge) return edge;
    }
    return habitats.pick(site.shallows, kind === 'frog' ? 31 : 43, phase);
  }

  private draw(record: WaterCohort, site: AquaticHabitat, stage: CohortStage, clock: number): void {
    let visual = this.visible.get(record);
    if (!visual || visual.stage !== stage) {
      this.hide(record);
      this.geometry ??= new SphereGeometry(1, 8, 5);
      this.material ??= new MeshStandardMaterial({ roughness: 0.55 });
      const group = new Group();
      group.name = `water-cohort-${record.kind}-${stage}`;
      group.add(
        new InstancedMesh(
          this.geometry,
          this.material,
          stage === 'eggs' ? COHORT_SIZE : COHORT_SIZE * 2,
        ),
      );
      this.context.scene.add(group);
      visual = { stage, group };
      this.visible.set(record, visual);
    }
    const mesh = visual.group.children[0];
    if (!(mesh instanceof InstancedMesh)) return;
    const eggs = stage === 'eggs';
    mesh.count = record.remaining * (eggs ? 1 : 2);
    const shore =
      stage === 'metamorphosis'
        ? this.context.habitats.closest(
            site.banks.map((bank) => bank.shallows),
            record,
          )
        : undefined;
    const progress = shore ? Math.min(1, (clock - record.laidAt - DAY) / DAY) : 0;
    const anchorX = record.x + ((shore?.x ?? record.x) - record.x) * progress;
    const anchorZ = record.z + ((shore?.z ?? record.z) - record.z) * progress;
    const { terrain } = this.context;
    for (let index = 0; index < record.remaining; index++) {
      const angle = index * 2.399963 + (stage === 'eggs' ? 0 : clock * 0.035);
      const spread = stage === 'eggs' ? 0.22 : 0.55;
      let x = anchorX + Math.cos(angle) * (0.1 + hash2(index, 2, 7) * spread);
      let z = anchorZ + Math.sin(angle) * (0.1 + hash2(index, 3, 7) * spread);
      let water = terrain.waterAt(x, z);
      if (water?.body.id !== site.body.id) {
        x = record.x;
        z = record.z;
        water = terrain.waterAt(x, z);
      }
      const y = Math.max(terrain.heightAt(x, z) + 0.025, (water?.level ?? 0) - 0.1);
      this.transform.position.set(x, y, z);
      this.transform.rotation.y = -angle;
      if (eggs) {
        this.transform.scale.setScalar(record.kind === 'frog' ? 0.053 : 0.035);
        this.color.set(record.kind === 'frog' ? 0x3b3833 : 0xdec57a);
      } else {
        this.transform.scale.set(0.043, 0.029, stage === 'fry' ? 0.084 : 0.055);
        this.color.set(
          stage === 'metamorphosis' ? 0x748247 : stage === 'tadpoles' ? 0x3b4636 : 0xbfbc91,
        );
      }
      this.transform.updateMatrix();
      const body = index * (eggs ? 1 : 2);
      mesh.setMatrixAt(body, this.transform.matrix);
      mesh.setColorAt(body, this.color);
      if (!eggs) {
        this.transform.position.x -= Math.sin(angle) * 0.09;
        this.transform.position.z += Math.cos(angle) * 0.09;
        this.transform.scale.set(0.016, 0.019, stage === 'metamorphosis' ? 0.035 : 0.07);
        this.transform.updateMatrix();
        mesh.setMatrixAt(body + 1, this.transform.matrix);
        mesh.setColorAt(body + 1, this.color.multiplyScalar(0.85));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  private hide(record: WaterCohort): void {
    const visual = this.visible.get(record);
    if (!visual) return;
    for (const child of visual.group.children) if (child instanceof InstancedMesh) child.dispose();
    visual.group.removeFromParent();
    this.visible.delete(record);
  }

  private key(kind: SpawningKind, body: string): string {
    return `${kind}:${body}`;
  }
}
