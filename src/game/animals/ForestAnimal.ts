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
import type { Habitat, HabitatPoint } from '../AnimalHabitats';
import type { WildlifeRoutine } from '../WildlifeRoutine';
/** Общий цикл мирных животных: питание, прогулки, бегство и ответная защита. */
export abstract class ForestAnimal extends Animal<WildlifeKind> {
  readonly appearance: AppearanceTraits;
  readonly model: ModelInstance;
  readonly defense: number;
  socialId = 0;
  waterBody?: string;

  habitat?: Habitat;
  destination?: HabitatPoint;
  foragingAllowed = true;
  restAt?: HabitatPoint;
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
  private guard?: { target: { x: number; z: number }; until: number };
  private escort?: { x: number; z: number };
  private routine?: WildlifeRoutine;

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
    if (profile.swimImmersion !== undefined)
      this.root.userData.swimImmersion = profile.swimImmersion;
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

  get swimSpeed(): number {
    return this.profile.swimSpeed ?? 0;
  }

  get swimImmersion(): number {
    return (this.profile.swimImmersion ?? this.profile.radius * 0.9) * this.growthScale;
  }

  useWaterBody(body: string): void {
    this.waterBody = body;
    this.surfaceAllowed = (x, z) => {
      const water = this.waterNavigation?.terrain.waterAt(x, z);
      return !water || water.body.id === body;
    };
  }

  override updateGrowth(progress: number): void {
    super.updateGrowth(progress);
    this.root.userData.swimImmersion = this.swimImmersion;
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

  get inShelter(): boolean {
    return this.routine?.inside ?? false;
  }

  get shelter(): WildlifeRoutine['shelter'] {
    return this.routine?.shelter;
  }

  get homeTerritory(): Habitat | undefined {
    return this.habitat;
  }

  useRoutine(routine: WildlifeRoutine, inside = false): void {
    this.routine = routine;
    const at = inside ? routine.restore() : undefined;
    if (!at) return;

    this.moveTo(at.x, at.z, at.y);
    this.root.visible = false;
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

  guardAgainst(target: { x: number; z: number }, time: number): void {
    if (this.guard?.target === target) this.guard.until = time + 0.25;
    else this.guard = { target, until: time + 0.25 };
  }

  followFriend(player?: { x: number; z: number }): void {
    this.escort = player;
  }

  receiveAttack(damage: number, time: number, attacker: { x: number; z: number }): number {
    this.health = Math.max(0, this.health - damage);
    if (!this.alive) return 0;

    this.targetX = this.x + (this.x - attacker.x) * 3;
    this.targetZ = this.z + (this.z - attacker.z) * 3;
    this.fleeingUntil = time + 4;
    if (!this.juvenile && this.defense > 0 && this.health > this.maxHealth * 0.3) {
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
    const guard = this.guard && time < this.guard.until ? this.guard.target : undefined;
    if (
      !guard &&
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
    const escort = this.escort;
    const fighting = time < this.fightingUntil;
    const activity = this.routine?.update(
      this.root.position,
      time,
      guard || escort || fighting ? undefined : this.restAt,
      danger,
      !guard && !fighting,
    );
    if (activity) {
      this.root.userData.tailPhase = time;
      if (activity.kind === 'move') {
        if (activity.fleeing) this.fleeingUntil = time + 2.2;
        const moving = this.walkToward(
          activity.target.x,
          activity.target.z,
          dt,
          activity.fleeing,
          groundAt,
        );
        this.animate(dt, moving, activity.fleeing, 'idle');
      } else if (activity.kind === 'rest') {
        this.surfaceStep(this.x, this.z, dt, groundAt);
        const clip = this.model.clips.has('rest') ? 'rest' : 'idle';
        this.animate(dt, false, false, clip);
      } else if (activity.kind === 'enter' || activity.kind === 'emerge') {
        const { x, y, z } = activity.at;
        this.moveTo(x, z, y);
        if (activity.kind === 'emerge') this.root.rotation.y = activity.heading;
        this.root.visible = activity.kind === 'emerge';
      }
      return false;
    }

    const escortDistance = escort ? Math.hypot(escort.x - this.x, escort.z - this.z) : 0;
    if (guard) {
      this.targetX = guard.x;
      this.targetZ = guard.z;
    } else if (danger) {
      if (time < this.fightingUntil) {
        this.targetX = danger.x;
        this.targetZ = danger.z;
      } else {
        const away = Math.atan2(this.x - danger.x, this.z - danger.z);
        this.targetX = this.x + Math.sin(away) * this.range;
        this.targetZ = this.z + Math.cos(away) * this.range;
        this.fleeingUntil = time + 2.2;
      }
    } else if (escort && escortDistance > 2.6) {
      this.targetX = escort.x;
      this.targetZ = escort.z;
    } else if (food && !escort && time > this.fleeingUntil) {
      this.targetX = food.x;
      this.targetZ = food.z;
    } else if (this.destination && time >= this.fleeingUntil) {
      this.targetX = this.destination.x;
      this.targetZ = this.destination.z;
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

    const fleeing = !guard && time < this.fleeingUntil;
    const rushing = !!guard || fleeing || escortDistance > 4;
    const grazing =
      !guard && !escort && !!food && !danger && Math.hypot(food.x - this.x, food.z - this.z) < 1.3;
    if (grazing && time >= this.nextGraze) {
      this.nextGraze = time + this.rng.range(6, 11);
      this.eatingUntil = time + 1.6;
    }

    const wantsToMove =
      !!guard ||
      fleeing ||
      escortDistance > 2.6 ||
      (!escort &&
        !grazing &&
        time > this.eatingUntil &&
        (!!food || Math.sin(time * 0.47 + this.root.id) > -0.55));
    const moving =
      wantsToMove && this.walkToward(this.targetX, this.targetZ, dt, rushing, groundAt);
    if (!wantsToMove) this.surfaceStep(this.x, this.z, dt, groundAt);
    this.animate(dt, moving, rushing, time < this.eatingUntil ? 'graze' : 'idle');
    this.root.userData.tailPhase = time;
    return grazing && time < this.eatingUntil;
  }

  private walkToward(
    x: number,
    z: number,
    dt: number,
    rushing: boolean,
    groundAt: GroundHeight,
  ): boolean {
    const angle = Math.atan2(x - this.x, z - this.z);
    const speed = this.speed * Math.sqrt(this.growthScale);
    const step = Math.min(Math.hypot(x - this.x, z - this.z), dt * speed * (rushing ? 2 : 1));
    const moving = this.surfaceStep(
      this.x + Math.sin(angle) * step,
      this.z + Math.cos(angle) * step,
      dt,
      groundAt,
    );
    if (step > 0.001) {
      const turn = angle + Math.PI - this.root.rotation.y;
      const shortest = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.root.rotation.y += THREE.MathUtils.clamp(shortest, -dt * 4, dt * 4);
    }
    return moving;
  }

  private animate(
    dt: number,
    moving: boolean,
    rushing: boolean,
    still: 'idle' | 'rest' | 'graze',
  ): void {
    ModelAssets.shared.play(
      this.model,
      moving ? (rushing ? 'run' : 'walk') : still,
      dt,
      moving
        ? THREE.MathUtils.clamp(
            (this.speed * (rushing ? 2 : 1)) / (rushing ? 3.1 : 1.1) / this.appearance.size,
            0.65,
            1.8,
          )
        : 1,
    );
  }
}
