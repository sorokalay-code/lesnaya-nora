import { RabbitActor, RabbitFactory, AnimalFactory } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { adultRabbit, rabbitSex } from '../RabbitSex';
import { Random } from '../Random';
import { Genealogy } from '../genetics/Genealogy';
import { GESTATION_DAYS } from '../FamilyCare';
import { setRabbitAction, animateRabbit } from '../Models';
import type { SaveData, PartnerTraits } from '../types';
import type { Excavation } from '../Excavation';
import type { World } from '../World';
import { defaultWorldConfig } from '../WorldConfig';

const MATING_SECONDS = 3.1;
const ENCOUNTER_RANGE = 22;
const MATING_RECOVERY_DAYS = 3;
interface Pair {
  mother: RabbitActor;
  father: RabbitActor;
  expiresAt: number;
  until?: number;
}
interface Context {
  save: SaveData;
  rabbits: RabbitActor[];
  world: World;
  earth: Excavation;
}

/** Ведёт самостоятельные пары соседей, сохраняемую беременность и рост потомства; игрока не спаривает. */
export class WildRabbitBreeding {
  private readonly rng: Random;
  private readonly factory: RabbitFactory;
  private pair?: Pair;
  private nextSearch = 0;
  private lastClock: number;

  constructor(private readonly context: Context) {
    this.rng = new Random(context.save.seed + 81593);
    this.factory = new RabbitFactory(this.rng);
    this.lastClock = context.save.clock;
  }

  busy(actor: RabbitActor): boolean {
    return this.pair?.mother === actor || this.pair?.father === actor;
  }

  update(dt: number, time: number, excluded?: RabbitActor): void {
    const { save, rabbits } = this.context;
    const days = Math.max(0, save.clock - this.lastClock) / 1440;
    this.lastClock = save.clock;
    // Роды дописывают акторов в тот же массив: новорождённым нельзя начислять
    // прошедшее до их появления время этого шага.
    const existingCount = rabbits.length;
    for (let index = 0; index < existingCount; index++) {
      const actor = rabbits[index];
      if (!actor.alive) continue;
      if (actor.data.age !== undefined && actor.data.age < 3) {
        actor.data.age = Math.min(3, actor.data.age + days);
        actor.updateGrowth();
      }
      if (actor.data.pregnancy && save.clock >= actor.data.pregnancy.dueAt) this.birth(actor);
    }
    if (this.pair) {
      const { mother, father } = this.pair;
      if (
        !this.available(mother) ||
        !this.available(father) ||
        mother === excluded ||
        father === excluded ||
        time > this.pair.expiresAt
      ) {
        this.finish();
        return;
      }
      if (this.pair.until === undefined) {
        father.navigateMate(
          dt,
          time,
          { x: mother.x, y: mother.root.position.y, z: mother.z },
          this.context.earth,
          (x, z) => this.context.world.heightAt(x, z),
          1.8,
          1.1,
        );
        animateRabbit(mother.rig, time + mother.data.id, false, false, dt);
        if (
          Math.hypot(
            father.x - mother.x,
            father.root.position.y - mother.root.position.y,
            father.z - mother.z,
          ) > 1.5
        )
          return;
        this.pair.until = time + MATING_SECONDS;
        for (const actor of [mother, father])
          setRabbitAction(actor.rig, 'mate', time + actor.data.id, MATING_SECONDS);
      }
      for (const actor of [mother, father])
        animateRabbit(actor.rig, time + actor.data.id, false, false, dt);
      if (time >= this.pair.until) {
        mother.data.pregnancy = {
          fatherId: father.data.id,
          dueAt: save.clock + GESTATION_DAYS * 1440,
        };
        mother.data.nextMatingAt = father.data.nextMatingAt =
          save.clock + MATING_RECOVERY_DAYS * 1440;
        this.finish();
      }
      return;
    }
    if (time < this.nextSearch) return;
    this.nextSearch = time + 5;
    if (rabbits.filter((actor) => actor.alive).length >= this.populationLimit()) return;
    for (const mother of rabbits) {
      if (
        mother === excluded ||
        rabbitSex(mother.data) !== 'female' ||
        !this.available(mother) ||
        mother.data.pregnancy
      )
        continue;
      const father = rabbits.find(
        (actor) =>
          actor !== excluded &&
          rabbitSex(actor.data) === 'male' &&
          this.available(actor) &&
          Math.hypot(actor.x - mother.x, actor.z - mother.z) < ENCOUNTER_RANGE &&
          !Genealogy.related(mother.data.lineage, actor.data.lineage),
      );
      if (!father) continue;
      this.pair = { mother, father, expiresAt: time + 35 };
      mother.root.userData.wildMating = father.root.userData.wildMating = true;
      break;
    }
  }

  private available(actor: RabbitActor): boolean {
    const { save, earth, world } = this.context;
    return (
      actor.alive &&
      actor.health >= 60 &&
      adultRabbit(actor.data) &&
      !actor.solitary &&
      actor.data.id !== save.mateId &&
      (actor.data.nextMatingAt ?? 0) <= save.clock &&
      !actor.root.userData.conversing &&
      !actor.root.userData.hunting &&
      !AnimalRestraint.active(actor.root) &&
      !earth.isSheltered(actor.x, actor.root.position.y, actor.z) &&
      !world.waterAt?.(actor.x, actor.z)
    );
  }

  private populationLimit(): number {
    const count = (this.context.save.worldConfig ?? defaultWorldConfig()).creatures.rabbit;
    return count === 0 ? 0 : Math.max(16, count * 4);
  }

  private finish(): void {
    if (!this.pair) return;
    for (const actor of [this.pair.mother, this.pair.father]) {
      actor.root.userData.wildMating = false;
      if (actor.root.userData.action === 'mate') actor.root.userData.actionUntil = 0;
    }
    this.pair = undefined;
  }

  private birth(mother: RabbitActor): void {
    const { save, rabbits, world } = this.context;
    const father = save.partners.find((actor) => actor.id === mother.data.pregnancy?.fatherId);
    if (AnimalRestraint.active(mother.root)) return;
    delete mother.data.pregnancy;
    if (!father) return;
    const room = this.populationLimit() - rabbits.filter((actor) => actor.alive).length;
    const count = Math.min(room, this.rng.int(2, 4));
    let id = Math.max(999_999, ...save.partners.map((rabbit) => rabbit.id)) + 1;
    for (let index = 0; index < count; index++) {
      const sex = this.rng.chance(0.5) ? 'female' : 'male';
      const child: PartnerTraits = {
        id: id++,
        sex,
        age: 0,
        name: sex === 'female' ? 'Лапушка' : 'Пушок',
        x: mother.x,
        y: mother.root.position.y,
        z: mother.z,
        genes: this.factory.inherit(mother.data.genes, father.genes),
        lineage: Genealogy.child(`wild-child:${id - 1}`, [
          {
            name: mother.data.name,
            lineage: mother.data.lineage ?? Genealogy.founder(`wild:${mother.data.id}`),
          },
          { name: father.name, lineage: father.lineage ?? Genealogy.founder(`wild:${father.id}`) },
        ]),
        preference: 'bond',
        temperament: mother.data.temperament,
        trust: 5,
        familySize: 0,
      };
      const actor = AnimalFactory.rabbit(child, this.rng);
      actor.useWorldBounds(world.size);
      actor.moveTo(child.x, child.z, child.y!);
      save.partners.push(child);
      rabbits.push(actor);
      world.scene.add(actor.root);
    }
  }
}
