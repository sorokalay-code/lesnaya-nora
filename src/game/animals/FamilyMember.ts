import * as THREE from 'three';
import { animateRabbit } from '../Models';
import { Random } from '../Random';
import type { Genes, PartnerTraits } from '../types';
import { Rabbit } from './Rabbit';
import type { GroundHeight } from './types';
import { Genealogy } from '../genetics/Genealogy';
import { GeneticTraits } from '../genetics/GeneticTraits';
import { AnimalRestraint } from './AnimalRestraint';
import { FEMALE_RABBIT_NAMES, MALE_RABBIT_NAMES } from './RabbitFactory';
/** Член чужой семьи выбирает собственные цели рядом с домом, не привязываясь к орбите родителя. */
export class FamilyMember extends Rabbit {
  readonly data: PartnerTraits;
  private readonly homeX: number;
  private readonly homeZ: number;
  private targetX: number;
  private targetZ: number;
  private nextTarget = 0;
  private resting = false;

  constructor(
    parent: PartnerTraits,
    genes: Genes,
    private readonly index: number,
    readonly young: boolean,
    private readonly rng = new Random(parent.id * 97 + index * 31 + 1),
    worldSize = 110,
  ) {
    super(
      { x: parent.x, z: parent.z },
      genes,
      young,
      { health: 100 },
      index % 2 ? 'male' : 'female',
    );
    this.useWorldBounds(worldSize);
    const homeLimit = (worldSize * 90) / 110;
    const angle = parent.id * 1.7 + index * 2.4,
      radius = 4 + index * 2.1;
    this.homeX =
      this.x =
      this.targetX =
        THREE.MathUtils.clamp(parent.x + Math.cos(angle) * radius, -homeLimit, homeLimit);
    this.homeZ =
      this.z =
      this.targetZ =
        THREE.MathUtils.clamp(parent.z + Math.sin(angle) * radius, -homeLimit, homeLimit);
    const sex = index % 2 ? 'male' : 'female';
    const names = sex === 'female' ? FEMALE_RABBIT_NAMES : MALE_RABBIT_NAMES;
    this.data = {
      id: 100000 + parent.id * 100 + index,
      sex,
      name: names[(parent.id + index) % names.length],
      x: this.x,
      z: this.z,
      genes,
      preference: 'bond',
      temperament: parent.temperament,
      trust: 5,
      familySize: 0,
      lineage: Genealogy.child('family:' + parent.id + ':' + index, [
        { name: parent.name, lineage: parent.lineage ?? Genealogy.founder('wild:' + parent.id) },
      ]),
    };
  }

  moveTo(x: number, z: number, y: number): void {
    this.x = x;
    this.z = z;
    this.rig.root.position.set(x, y, z);
    this.rig.root.userData.baseY = y;
  }

  update(time: number, dt: number, groundAt: GroundHeight): void {
    if (AnimalRestraint.active(this.root)) {
      animateRabbit(this.rig, time, false, false, dt);
      return;
    }
    if (time >= this.nextTarget || Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 0.4) {
      this.nextTarget = time + this.rng.range(5, 13);
      this.resting = this.rng.chance(0.18);
      const angle = this.rng.range(0, Math.PI * 2),
        distance = this.rng.range(2, 8);
      this.targetX = THREE.MathUtils.clamp(this.homeX + Math.cos(angle) * distance, -94, 94);
      this.targetZ = THREE.MathUtils.clamp(this.homeZ + Math.sin(angle) * distance, -94, 94);
    }

    const dx = this.targetX - this.x,
      dz = this.targetZ - this.z,
      distance = Math.hypot(dx, dz),
      moving = !this.resting && distance > 0.3 && GeneticTraits.mobility(this.data.genes) > 0;
    if (moving) {
      const step = Math.min(
        distance,
        dt * (this.index % 2 ? 1.1 : 1.45) * GeneticTraits.mobility(this.data.genes),
      );
      this.x += (dx / distance) * step;
      this.z += (dz / distance) * step;
      this.rig.root.rotation.y = Math.atan2(-dx, -dz);
    }

    this.rig.root.position.x = this.x;
    this.rig.root.position.z = this.z;
    this.rig.root.userData.baseY = groundAt(this.x, this.z);
    animateRabbit(this.rig, time + this.index * 2, moving, false, dt);
  }
}
