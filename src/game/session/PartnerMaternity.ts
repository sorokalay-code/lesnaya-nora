import type { GroundHeight, RabbitActor } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import { FamilyCare, kitPosition } from '../FamilyCare';
import { animateRabbit, setRabbitAction } from '../Models';
import { NEST_BEDDING_RADIUS } from '../NestBedding';
import { playerSex, rabbitSex } from '../RabbitSex';
import type { DigNode, KitData, NestData, PartnerTraits, SaveData } from '../types';
import type { World } from '../World';

interface Context {
  save: SaveData;
  earth: Excavation;
  world: Pick<World, 'heightAt'>;
  care: FamilyCare;
  sound: Pick<Soundscape, 'play'>;
  toast: (text: string) => void;
  canFeed: (kit: KitData) => boolean;
}

const NURSING_INTERVAL_MINUTES = 70;
const NURSE_SECONDS = 2.8;
const HUNGRY = 65;
const PLAN_INTERVAL_SECONDS = 1.2;

/** Ведёт партнёршу к гнезду перед родами и к собственным малышам для кормления. */
export class PartnerMaternity {
  private requestedFor?: number;
  private requestedNest?: NestData;
  private nursingActor?: number;
  private nurseUntil = 0;
  private planAt = 0;
  private planActor?: number;
  private planRevision?: number;
  private preparingBirth = false;
  private nest?: NestData;
  private child?: KitData;

  constructor(private readonly context: Context) {}

  position(rabbit: PartnerTraits): DigNode {
    return {
      x: rabbit.x,
      y: rabbit.y ?? this.context.world.heightAt(rabbit.x, rabbit.z),
      z: rabbit.z,
    };
  }

  requestNursing(): void {
    const { save, toast } = this.context;
    const mother = save.partners.find((rabbit) => rabbit.id === save.mateId);
    if (!mother || rabbitSex(mother) !== 'female' || (mother.health ?? 100) <= 0) {
      toast('Покормить крольчат молоком может их мать. Сейчас партнёрша недоступна.');
      return;
    }
    if (!save.kits.some((kit) => this.isHerYoung(kit, mother.id))) {
      toast('У партнёрши пока нет маленьких крольчат, которых нужно кормить.');
      return;
    }
    this.requestedFor = mother.id;
    this.requestedNest = this.context.care.birthNest(NEST_BEDDING_RADIUS);
    this.planAt = 0;
    toast('Партнёрша покормит малышей, когда сможет до них добраться.');
  }

  update(actor: RabbitActor, dt: number, time: number, groundAt: GroundHeight): boolean {
    const { save, care, earth } = this.context;
    if (
      playerSex(save.player) !== 'male' ||
      rabbitSex(actor.data) !== 'female' ||
      !actor.alive ||
      AnimalRestraint.active(actor.root) ||
      actor.root.userData.conversing === true
    )
      return false;

    const id = actor.data.id;
    if (id === this.nursingActor && time < this.nurseUntil) {
      animateRabbit(actor.rig, time + id, false, false, dt);
      return true;
    }
    if (Number(actor.root.userData.careUntil ?? 0) > time) return false;

    const from = this.position(actor.data);
    const expecting = save.pregnancy?.motherId === id && save.pregnancy.warned === true;
    const canNurse = save.clock >= (actor.data.nextNursingAt ?? 0);
    const hungerLimit = this.requestedFor === id ? 101 : HUNGRY;
    if (
      time >= this.planAt ||
      this.planActor !== id ||
      this.preparingBirth !== expecting ||
      this.planRevision !== earth.revision ||
      (!!this.nest && !save.nests.includes(this.nest))
    ) {
      this.planAt = time + PLAN_INTERVAL_SECONDS;
      this.planActor = id;
      this.preparingBirth = expecting;
      this.planRevision = earth.revision;
      this.nest = expecting ? care.reachableNest(from) : this.feedingNest(from, id);
      this.child =
        canNurse && !(expecting && this.nest)
          ? this.chooseChild(from, id, hungerLimit, this.nest)
          : undefined;
    }

    if (this.nest && expecting) {
      actor.navigateMate(dt, time, this.nest, earth, groundAt, 3.6, 0.55);
      return true;
    }
    const child = this.child;
    if (!canNurse || !child || !this.isHerYoung(child, id)) return false;

    const atNest = care.birthNestAt(from, NEST_BEDDING_RADIUS);
    if (this.nest && this.nest !== atNest) {
      actor.navigateMate(dt, time, this.nest, earth, groundAt, 3, 0.55);
      return true;
    }
    const young = care.youngNear(from, atNest, (kit) => this.isHerYoung(kit, id));
    if (!young.includes(child)) {
      actor.navigateMate(dt, time, kitPosition(child), earth, groundAt, 3, 1.2);
      return true;
    }

    FamilyCare.nurse(young);
    actor.data.nextNursingAt = save.clock + NURSING_INTERVAL_MINUTES;
    this.requestedFor = undefined;
    this.requestedNest = undefined;
    this.child = undefined;
    this.nursingActor = id;
    this.nurseUntil = time + NURSE_SECONDS;
    setRabbitAction(actor.rig, 'nurse', time + id, NURSE_SECONDS);
    animateRabbit(actor.rig, time + id, false, false, dt);
    this.context.sound.play('baby');
    this.context.toast(`${actor.data.name} покормила крольчат молоком.`);
    return true;
  }

  private isHerYoung(kit: KitData, motherId: number): boolean {
    return (
      kit.motherId === motherId &&
      kit.alive &&
      kit.health > 0 &&
      kit.age < 3 &&
      this.context.canFeed(kit)
    );
  }

  private feedingNest(from: DigNode, id: number): NestData | undefined {
    const { care, earth, save } = this.context;
    const nest = this.requestedNest;
    if (this.requestedFor !== id || !nest || !save.nests.includes(nest)) return;
    const young = care.youngNear(nest, nest, (kit) => this.isHerYoung(kit, id));
    if (young.length && earth.route(from, nest).length) return nest;
  }

  private chooseChild(
    from: DigNode,
    motherId: number,
    hungerLimit: number,
    nest?: NestData,
  ): KitData | undefined {
    const { care, save, earth } = this.context;
    const eligible = (kit: KitData) => this.isHerYoung(kit, motherId) && kit.hunger < hungerLimit;
    const candidates = nest ? care.youngNear(nest, nest, eligible) : save.kits.filter(eligible);
    return candidates
      .sort((a, b) => a.hunger - b.hunger)
      .find((kit) => nest || earth.route(from, kitPosition(kit)).length > 0);
  }
}
