import { Excavation } from '../Excavation';
import { ExcavationTraffic } from '../ExcavationTraffic';
import { setRabbitAction, type RabbitRig } from '../Models';
import { PartnerSupport } from '../PartnerSupport';
import { Random } from '../Random';
import { WildlifeEcology } from '../WildlifeEcology';
import { World } from '../World';
import type { ForestAnimal } from '../animals';
import { FamilyMember, Hawk, Predator, RabbitActor } from '../animals';
import { SeasonSystem } from '../systems';
import { type SaveData } from '../types';
import { AnimalCollisionSystem } from './AnimalCollisionSystem';
import { InventoryController } from './InventoryController';

import type { PlayerConsequences } from './PlayerConsequences';
export interface AnimalState {
  mating?: { fatherId: number; until: number };
}

interface Context {
  save: SaveData;
  world: World;
  earth: Excavation;
  rng: Random;
  player: RabbitRig;
  rabbits: RabbitActor[];
  families: FamilyMember[];
  predators: Predator[];
  wildlife: ForestAnimal[];
  hawks: Hawk[];
  ecology: WildlifeEcology;
  traffic: ExcavationTraffic;
  collisions: AnimalCollisionSystem;
  partnerSupport: PartnerSupport;
  inventory: InventoryController;
  seasons: SeasonSystem;
  consequences: PlayerConsequences;
  state: AnimalState;
  groundAt: (x: number, z: number) => number;
  toast: (message: string) => void;
}

/** Обновляет поведение животных, семейную поддержку, охоту и видимость существ. */
export class AnimalSimulation {
  constructor(private readonly context: Context) {}

  update(dt: number, time: number, night: boolean): number {
    this.updateRabbits(dt, time);
    this.positionMatingPair(time);
    for (const member of this.context.families) member.update(time, dt, this.context.groundAt);

    const closestThreat = this.updatePredators(dt, time, night);
    this.updateUndergroundTraffic(dt, time, night);
    this.updateEcology(dt, time);
    this.context.collisions.resolve(this.context.state.mating?.fatherId);
    this.grazeRabbits(dt, time);
    this.updateHawks(dt, time);
    this.updateVisibility();
    return closestThreat;
  }

  private updateRabbits(dt: number, time: number): void {
    const p = this.context.save.player;
    for (const rabbit of this.context.rabbits) {
      if (rabbit.data.id === this.context.save.mateId) {
        const home =
          this.context.save.nests.find((n) => this.context.earth.isSheltered(n.x, n.y, n.z)) ??
          this.context.save.nests[0] ??
          this.context.save.stashes[0] ??
          p;
        const stash = this.context.inventory.ensureFamilyStash(home);
        const event = this.context.partnerSupport.update(
          rabbit,
          dt,
          time,
          home,
          stash,
          this.context.groundAt,
        );
        if (
          event?.kind === 'delivered' &&
          Math.hypot(rabbit.data.x - p.x, rabbit.data.z - p.z) < 12
        )
          this.context.toast(event.text);
      } else rabbit.update(dt, time, p.x, p.z, this.context.groundAt);

      const mark = rabbit.rig.root.getObjectByName('mate-mark');
      if (mark) {
        mark.rotation.y = time * 0.6;
        mark.position.y = Math.sin(time * 2.2) * 0.06;
      }
    }
  }

  private positionMatingPair(time: number): void {
    const p = this.context.save.player;
    if (this.context.state.mating) {
      const actor = this.context.rabbits.find(
        (r) => r.data.id === this.context.state.mating!.fatherId,
      );
      if (actor) {
        actor.rig.root.position.set(
          p.x + Math.sin(this.context.player.root.rotation.y) * 0.28,
          p.y + 0.4,
          p.z + Math.cos(this.context.player.root.rotation.y) * 0.28,
        );
        actor.rig.root.rotation.y = this.context.player.root.rotation.y;
      }

      if (time >= this.context.state.mating.until) this.context.state.mating = undefined;
    }
  }

  private updatePredators(dt: number, time: number, night: boolean): number {
    const p = this.context.save.player;
    let closestThreat = Infinity;
    for (const predator of this.context.predators) {
      const prey = this.context.ecology.targetFor(predator, this.context.predators, time);
      if (
        predator.update(
          dt,
          time,
          p.x,
          p.z,
          p.hidden,
          !night,
          this.context.groundAt,
          p.dirtiness / 100,
          this.context.seasons.predatorActivity(this.context.save.day),
          prey,
        )
      )
        this.context.consequences.predatorAttack(predator.kind);

      this.context.consequences.threatenKits(predator);
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }
    return closestThreat;
  }

  private updateUndergroundTraffic(dt: number, time: number, night: boolean): void {
    for (const event of this.context.traffic.update(
      dt,
      time,
      night,
      this.context.predators,
      this.context.rabbits,
      this.context.save,
      this.context.earth,
    )) {
      const animal = event.kind === 'weasel' ? 'Ласка' : 'Лиса';
      if (event.type === 'predator-entered')
        this.context.toast(`${animal} учуяла крольчат или отходы и пролезла в неглубокий ход!`);

      if (event.type === 'predator-attack') this.context.consequences.predatorAttack(event.kind);

      if (event.type === 'kit-attack')
        this.context.toast(
          `${animal} добралась до ${event.name}. Уведи малыша глубже и защити гнездо.`,
        );
    }
  }

  private updateEcology(dt: number, time: number): void {
    const p = this.context.save.player;
    for (const event of this.context.ecology.update(
      dt,
      time,
      this.context.save.clock,
      p.x,
      p.z,
      this.context.groundAt,
      this.context.predators,
    )) {
      if (Math.hypot(event.x - p.x, event.z - p.z) > 19 || event.kind === 'arrival') continue;

      if (event.kind === 'hunt')
        this.context.toast(`Хищник поймал ${event.subject}. Лес живёт по своим законам.`);
      else if (event.kind === 'defend')
        this.context.toast(
          `${event.subject[0].toUpperCase() + event.subject.slice(1)} дал отпор хищнику!`,
        );
      else this.context.toast('Хищники столкнулись из-за охотничьей территории.');
    }
  }

  private grazeRabbits(dt: number, time: number): void {
    for (const rabbit of this.context.rabbits)
      if (this.context.rng.chance(dt * 0.025)) {
        const food = this.context.world.nearestResource(rabbit.data.x, rabbit.data.z, 1.2);
        if (food && food.kind !== 'toadstool') {
          this.context.world.harvest(food, this.context.save.clock);
          setRabbitAction(rabbit.rig, 'eat', time + rabbit.data.id, 1.2);
        } else if (
          this.context.world.gnawBark(rabbit.data.x, rabbit.data.z, this.context.save.clock)
        )
          setRabbitAction(rabbit.rig, 'eat', time + rabbit.data.id, 1.2);
      }
  }

  private updateHawks(dt: number, time: number): void {
    const p = this.context.save.player;
    const exposed = !this.sheltered && !this.context.world.hasCover(p.x, p.z);
    for (const hawk of this.context.hawks)
      if (hawk.update(dt, time, p.x, p.z, exposed, this.context.groundAt))
        this.context.consequences.predatorAttack('hawk');
  }

  private updateVisibility(): void {
    const p = this.context.save.player;
    for (const rabbit of this.context.rabbits)
      rabbit.rig.root.visible =
        Math.hypot(rabbit.rig.root.position.x - p.x, rabbit.rig.root.position.z - p.z) < 76;

    for (const member of this.context.families)
      member.rig.root.visible =
        Math.hypot(member.rig.root.position.x - p.x, member.rig.root.position.z - p.z) < 76;

    for (const predator of this.context.predators)
      predator.root.visible =
        Math.hypot(predator.root.position.x - p.x, predator.root.position.z - p.z) < 76;

    for (const animal of this.context.wildlife)
      animal.root.visible = Math.hypot(animal.x - p.x, animal.z - p.z) < 76;

    for (const hawk of this.context.hawks) {
      const visible = Math.hypot(hawk.x - p.x, hawk.z - p.z) < 92;
      hawk.root.visible = visible;
      hawk.shadow.visible = visible && !this.sheltered;
    }
  }

  private get sheltered(): boolean {
    return (
      !!this.context.earth &&
      this.context.earth.isSheltered(
        this.context.save.player.x,
        this.context.save.player.y,
        this.context.save.player.z,
      )
    );
  }
}
