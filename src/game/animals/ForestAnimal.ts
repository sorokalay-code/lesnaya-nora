import * as THREE from 'three';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import { Random } from '../Random';
import { Animal } from './Animal';
import { AnimalRestraint } from './AnimalRestraint';
import type { WildlifeSocial } from '../types';
import type { GroundHeight, WildlifeKind, WildlifeProfile } from './types';
import {
  AnimalAppearance,
  type AppearanceOptions,
  type AppearanceTraits,
} from '../AnimalAppearance';
/** Общий цикл мирных животных: питание, прогулки, бегство и ответная защита. */
export abstract class ForestAnimal extends Animal<WildlifeKind> {
  readonly appearance: AppearanceTraits;
  readonly model: ModelInstance;
  readonly defense: number;
  socialId = 0;
  social: WildlifeSocial = { trust: 0 };
  protected legs: THREE.Object3D[] = [];
  private readonly speed: number;
  private readonly range: number;
  private targetX: number;
  private targetZ: number;
  private nextTarget = 0;
  private fleeingUntil = 0;
  private fightingUntil = 0;
  private eatingUntil = 0;
  private nextGraze = 0;
  private greeting?: { x: number; z: number; until: number };

  protected constructor(
    kind: WildlifeKind,
    x: number,
    z: number,
    private readonly rng: Random,
    readonly profile: WildlifeProfile,
    appearance?: AppearanceOptions,
  ) {
    const model = ModelAssets.shared.create(kind);
    super(kind, model.root, { x, z }, profile.health);
    this.model = model;
    this.appearance = AnimalAppearance.normalize(appearance);
    AnimalAppearance.apply(model, this.appearance);
    this.profile = {
      ...profile,
      radius: profile.radius * this.appearance.size * this.appearance.bodyWidth,
      mass: profile.mass * this.appearance.size ** 3,
    };
    this.legs = ['LegFL', 'LegFR', 'LegBL', 'LegBR']
      .map((name) => this.root.getObjectByName(name))
      .filter((leg): leg is THREE.Object3D => !!leg);
    this.targetX = x;
    this.targetZ = z;
    this.defense = profile.defense;
    this.speed = profile.speed;
    this.range = profile.range;
  }

  get mood(): string {
    return this.health < this.maxHealth * 0.45
      ? 'раненое'
      : this.fleeingUntil > this.root.userData.tailPhase
        ? 'напуганное'
        : this.trust > 25
          ? 'доверчивое'
          : 'осторожное';
  }

  get trust(): number {
    return this.social.trust;
  }

  set trust(value: number) {
    this.social.trust = value;
  }

  befriend(amount: number): void {
    this.trust = THREE.MathUtils.clamp(this.trust + amount, 0, 100);
    this.fleeingUntil = 0;
  }

  greet(player: { x: number; z: number }, time: number): void {
    this.greeting = { x: player.x, z: player.z, until: time + 1.6 };
  }

  receiveAttack(damage: number, time: number, attacker: { x: number; z: number }): number {
    this.health = Math.max(0, this.health - damage);
    if (!this.alive) return 0;

    this.targetX = this.x + (this.x - attacker.x) * 3;
    this.targetZ = this.z + (this.z - attacker.z) * 3;
    this.fleeingUntil = time + 4;
    if (this.defense > 0 && this.health > this.maxHealth * 0.3) {
      this.fightingUntil = time + 2;
      this.fleeingUntil = 0;
      return this.defense;
    }

    return 0;
  }

  update(
    dt: number,
    time: number,
    groundAt: GroundHeight,
    threats: readonly { x: number; z: number }[],
    food?: { x: number; z: number },
  ): boolean {
    if (AnimalRestraint.active(this.root)) {
      ModelAssets.shared.play(this.model, 'idle', dt);
      return false;
    }
    if (
      this.greeting &&
      time < this.greeting.until &&
      !threats.some((threat) => Math.hypot(threat.x - this.x, threat.z - this.z) < 6)
    ) {
      const desired = Math.atan2(-(this.greeting.x - this.x), -(this.greeting.z - this.z));
      const turn = Math.atan2(
        Math.sin(desired - this.root.rotation.y),
        Math.cos(desired - this.root.rotation.y),
      );
      this.root.rotation.y += Math.max(-dt * 4, Math.min(dt * 4, turn));
      ModelAssets.shared.play(this.model, 'idle', dt);
      return false;
    }
    if (this.root.userData.conversing === true) {
      ModelAssets.shared.play(this.model, 'idle', dt);
      this.root.userData.tailPhase = time;
      return false;
    }

    const danger = threats.find((p) => Math.hypot(p.x - this.x, p.z - this.z) < 6);
    if (danger) {
      if (time < this.fightingUntil) {
        this.targetX = danger.x;
        this.targetZ = danger.z;
      } else {
        const away = Math.atan2(this.x - danger.x, this.z - danger.z);
        this.targetX = this.x + Math.sin(away) * this.range;
        this.targetZ = this.z + Math.cos(away) * this.range;
        this.fleeingUntil = time + 2.2;
      }
    } else if (food && time > this.fleeingUntil) {
      this.targetX = food.x;
      this.targetZ = food.z;
    } else if (
      time > this.nextTarget ||
      Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 0.5
    ) {
      this.nextTarget = time + this.rng.range(3, 8);
      const angle = this.rng.range(-Math.PI, Math.PI),
        distance = this.rng.range(2, this.range);
      this.targetX = this.x + Math.sin(angle) * distance;
      this.targetZ = this.z + Math.cos(angle) * distance;
    }

    const fleeing = time < this.fleeingUntil;
    const grazing = !!food && !danger && Math.hypot(food.x - this.x, food.z - this.z) < 1.3;
    if (grazing && time >= this.nextGraze) {
      this.nextGraze = time + this.rng.range(6, 11);
      this.eatingUntil = time + 1.6;
    }

    const moving =
      !grazing &&
      time > this.eatingUntil &&
      (fleeing || !!food || Math.sin(time * 0.47 + this.root.id) > -0.55);
    if (moving) {
      const angle = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
      const step = dt * this.speed * (fleeing ? 2 : 1);
      this.x = THREE.MathUtils.clamp(this.x + Math.sin(angle) * step, -97, 97);
      this.z = THREE.MathUtils.clamp(this.z + Math.cos(angle) * step, -97, 97);
      const desired = angle + Math.PI;
      const turn = Math.atan2(
        Math.sin(desired - this.root.rotation.y),
        Math.cos(desired - this.root.rotation.y),
      );
      this.root.rotation.y += THREE.MathUtils.clamp(turn, -dt * 4, dt * 4);
    }

    this.root.position.set(this.x, groundAt(this.x, this.z), this.z);
    ModelAssets.shared.play(
      this.model,
      time < this.eatingUntil ? 'graze' : moving ? (fleeing ? 'run' : 'walk') : 'idle',
      dt,
      moving
        ? THREE.MathUtils.clamp(
            (this.speed * (fleeing ? 2 : 1)) / (fleeing ? 3.1 : 1.1) / this.appearance.size,
            0.65,
            1.8,
          )
        : 1,
    );
    this.root.userData.tailPhase = time;
    return grazing && time < this.eatingUntil;
  }
}
