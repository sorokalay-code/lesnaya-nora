import { animateRabbit, setRabbitAction, type RabbitRig } from './Models';
import { CoatDirt } from './CoatDirt';
import { BurrowRoaming } from './BurrowRoaming';
import type { RabbitActor, GroundHeight } from './animals';
import { AnimalRestraint } from './animals/AnimalRestraint';
import type { Excavation } from './Excavation';
import { GeneticTraits } from './genetics/GeneticTraits';
import { Random } from './Random';
import type { WasteSystem } from './systems/WasteSystem';
import type { DigNode, KitData, SaveData } from './types';

type Task = { kind: 'self' | 'kit' | 'waste'; id?: number; expires: number; until?: number };
interface Context {
  save: SaveData;
  earth: Excavation;
  waste: WasteSystem;
  rigs: ReadonlyMap<number, RabbitRig>;
  toast: (line: string) => void;
}
const CARE_INTERVALS = [Infinity, Infinity, 120, 70, 42, 24];

/** Домашние занятия партнёра: прогулки, вылизывание и физический подход к ребёнку или нечистотам. */
export class PartnerCare {
  private readonly roaming: BurrowRoaming;
  private task?: Task;
  private nextCareAt = 0;
  private actorId?: number;
  private lastHouseTask?: 'kit' | 'waste';
  private homeProbe?: { home: DigNode; revision: number; until: number; value: boolean };

  constructor(
    private readonly context: Context,
    rng: Random,
  ) {
    this.roaming = new BurrowRoaming(rng);
  }

  get busy(): boolean {
    return this.task !== undefined;
  }

  hasHouseWork(actorId: number): boolean {
    return this.actorId === actorId && this.task !== undefined && this.task.kind !== 'self';
  }

  update(
    actor: RabbitActor,
    home: DigNode,
    dt: number,
    time: number,
    groundAt: GroundHeight,
    domestic: boolean,
  ): boolean {
    if (this.actorId !== actor.data.id) {
      if (this.actorId !== undefined) this.roaming.forget(this.actorId);
      this.actorId = actor.data.id;
      this.task = undefined;
      this.nextCareAt = 0;
      this.homeProbe = undefined;
      this.lastHouseTask = undefined;
    }
    if (!actor.alive || AnimalRestraint.active(actor.root) || actor.root.userData.conversing)
      return false;
    if (
      ['mate', 'defecate', 'eat', 'pluck'].includes(String(actor.root.userData.action)) &&
      Number(actor.root.userData.actionUntil ?? 0) > time + actor.data.id
    )
      return false;
    if (this.task && this.task.kind !== 'self' && !domestic) this.task = undefined;
    const level = GeneticTraits.cleanliness(actor.data.genes);
    const atHome = domestic && this.atHome(actor, home, time);
    if (this.task && time >= this.task.expires) this.task = undefined;
    if (!this.task && level > 1 && time >= this.nextCareAt) {
      this.nextCareAt = time + CARE_INTERVALS[level];
      if ((actor.data.dirtiness ?? 0) >= 12) this.task = { kind: 'self', expires: time + 4 };
      else if (atHome) this.task = this.houseTask(actor, home, time);
    }

    if (this.task && this.perform(actor, home, dt, time, groundAt)) return true;
    if (!atHome) return false;
    const destination =
      this.roaming.target(
        actor.data.id,
        this.position(actor),
        home,
        time,
        this.context.earth,
        1.5,
      ) ?? home;
    actor.navigateMate(dt, time, destination, this.context.earth, groundAt, 1.5, 0.35);
    return true;
  }

  private position(actor: RabbitActor): DigNode {
    return {
      x: actor.x,
      y: Number(actor.root.userData.baseY ?? actor.root.position.y),
      z: actor.z,
    };
  }

  private sameArea(a: DigNode, b: DigNode): boolean {
    const area = this.context.earth.roamingFloors(b);
    return area.length > 0 && area === this.context.earth.roamingFloors(a);
  }

  private atHome(actor: RabbitActor, home: DigNode, time: number): boolean {
    const probe = this.homeProbe;
    if (
      probe &&
      time < probe.until &&
      probe.revision === this.context.earth.revision &&
      Math.hypot(home.x - probe.home.x, home.y - probe.home.y, home.z - probe.home.z) < 0.5
    )
      return probe.value;
    const value = this.sameArea(this.position(actor), home);
    this.homeProbe = {
      home: { ...home },
      revision: this.context.earth.revision,
      until: time + 0.5,
      value,
    };
    return value;
  }

  private childPosition(kit: KitData): DigNode {
    return { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ };
  }

  private houseTask(actor: RabbitActor, home: DigNode, time: number): Task | undefined {
    let child: KitData | undefined;
    for (const kit of this.context.save.kits) {
      const rig = this.context.rigs.get(kit.id);
      if (
        !kit.alive ||
        kit.health <= 0 ||
        kit.age >= 3 ||
        !rig ||
        AnimalRestraint.active(rig.root) ||
        rig.root.userData.conversing ||
        (kit.dirtiness ?? 0) < 20 ||
        !this.sameArea(this.childPosition(kit), home)
      )
        continue;
      if (!child || (kit.dirtiness ?? 0) > (child.dirtiness ?? 0)) child = kit;
    }
    const position = this.position(actor);
    let nearest: number | undefined,
      distance = Infinity;
    for (const waste of this.context.save.waste) {
      const d = Math.hypot(waste.x - position.x, waste.y - position.y, waste.z - position.z);
      if (d < distance && this.sameArea(waste, home)) {
        nearest = waste.id;
        distance = d;
      }
    }
    // Чередуем уход и уборку: иначе повторное загрязнение малыша навсегда откладывает удаление источника грязи.
    if (child && (this.lastHouseTask !== 'kit' || nearest === undefined))
      return { kind: 'kit', id: child.id, expires: time + 45 };
    return nearest === undefined ? undefined : { kind: 'waste', id: nearest, expires: time + 60 };
  }

  private perform(
    actor: RabbitActor,
    home: DigNode,
    dt: number,
    time: number,
    groundAt: GroundHeight,
  ): boolean {
    const task = this.task;
    if (!task) return false;
    const child =
      task.kind === 'kit'
        ? this.context.save.kits.find((k) => k.id === task.id && k.alive && k.health > 0)
        : undefined;
    const rig = child && this.context.rigs.get(child.id);
    const waste =
      task.kind === 'waste' ? this.context.save.waste.find((w) => w.id === task.id) : undefined;
    if (
      (task.kind === 'kit' &&
        (!child || !rig || AnimalRestraint.active(rig.root) || rig.root.userData.conversing)) ||
      (task.kind === 'waste' && !waste)
    ) {
      this.task = undefined;
      return false;
    }
    const target = child ? this.childPosition(child) : waste;
    if (target && !this.sameArea(target, home)) {
      this.task = undefined;
      return false;
    }
    if (
      !task.until &&
      target &&
      Math.hypot(actor.x - target.x, this.position(actor).y - target.y, actor.z - target.z) > 1.4
    ) {
      actor.navigateMate(dt, time, target, this.context.earth, groundAt, 2.3, 1.15);
      return true;
    }
    if (!task.until) {
      task.until = time + 2;
      actor.root.userData.careUntil = task.until;
      setRabbitAction(actor.rig, task.kind === 'waste' ? 'dig' : 'groom', time + actor.data.id, 2);
      if (child && rig) {
        rig.root.userData.careUntil = task.until;
        setRabbitAction(rig, 'groom', time + child.id, 2);
      }
    }
    animateRabbit(actor.rig, time + actor.data.id, false, false, dt);
    if (time < task.until) return true;
    if (task.kind === 'self') {
      actor.data.dirtiness = 0;
      CoatDirt.update(actor.rig, 0);
    } else if (child && rig) {
      this.lastHouseTask = 'kit';
      child.dirtiness = 0;
      CoatDirt.update(rig, 0);
      this.context.toast(actor.data.name + ' заботливо почистил шерсть: ' + child.name + '.');
    } else if (waste && this.context.waste.clean(waste.id)) {
      this.lastHouseTask = 'waste';
      this.context.toast(actor.data.name + ' убрал нечистоты в семейном убежище.');
    }
    this.task = undefined;
    this.nextCareAt = time + CARE_INTERVALS[GeneticTraits.cleanliness(actor.data.genes)];
    return true;
  }
}
