import { RabbitReproductiveThreat } from './RabbitReproductiveThreat';
import { Excavation } from '../Excavation';
import { ExcavationTraffic } from '../ExcavationTraffic';
import { animateRabbit, setRabbitAction, type RabbitRig } from '../Models';
import { PartnerSupport } from '../PartnerSupport';
import { Random } from '../Random';
import { WildlifeEcology } from '../WildlifeEcology';
import { World } from '../World';
import type { FlyingRaptor, ForestAnimal } from '../animals';
import { FamilyMember, Predator, RabbitActor } from '../animals';
import { SeasonSystem } from '../systems';
import { type SaveData } from '../types';
import { AnimalCollisionSystem } from './AnimalCollisionSystem';
import { FriendSignals } from './FriendSignals';
import { FriendDefense } from './FriendDefense';
import { FriendMarks } from './FriendMarks';
import type { AnimalWasteSystem } from './AnimalWasteSystem';
import type { AttackListener } from '../audio/AttackCue';
import { RabbitPredation } from './RabbitPredation';
import { HawkHunting } from './HawkHunting';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { ModelAssets } from '../ModelAssets';
import { AnimalAmbience } from '../audio/AnimalAmbience';
import { AnimalVoiceSources } from '../audio/AnimalVoiceSources';
import type { AnimalVoiceListener } from '../audio/AnimalVoice';
import type { FamilyLifecycle } from './FamilyLifecycle';

import type { PlayerConsequences } from './PlayerConsequences';
import { WaterSimulation } from './WaterSimulation';
import type { AnimalRemains } from '../AnimalRemains';
import { WildRabbitBreeding } from './WildRabbitBreeding';
import type { LostKits } from './LostKits';
import { playerSex, potentialMate } from '../RabbitSex';
import type { RaptorPopulation } from './RaptorPopulation';
import { GardenHunters } from './GardenHunters';
import type { DigNode } from '../types';

const MATING_DURATION = 3.1;
const MATING_REACH = 3;

export interface AnimalState {
  mating?: { mateId: number; until: number };
}

interface Context {
  hunterShot?: (at: DigNode) => void;
  lostKits?: LostKits;
  remains?: AnimalRemains;
  resetInput?: () => void;
  canGrabPlayer?: () => boolean;
  impactSound?: () => void;
  ambientSound?: AnimalVoiceListener;
  facing?: () => { x: number; z: number };
  attackSound?: AttackListener;
  family?: FamilyLifecycle;
  animalWaste?: AnimalWasteSystem;
  combatAllowed?: () => boolean;
  save: SaveData;
  world: World;
  earth: Excavation;
  rng: Random;
  player: RabbitRig;
  rabbits: RabbitActor[];
  families: FamilyMember[];
  predators: Predator[];
  wildlife: ForestAnimal[];
  hawks: FlyingRaptor[];
  raptors?: RaptorPopulation;
  ecology: WildlifeEcology;
  traffic: ExcavationTraffic;
  collisions: AnimalCollisionSystem;
  partnerSupport: PartnerSupport;
  seasons: SeasonSystem;
  consequences: PlayerConsequences;
  state: AnimalState;
  groundAt: (x: number, z: number) => number;
  toast: (message: string) => void;
}

/** Обновляет поведение животных, семейную поддержку, охоту и видимость существ. */
export class AnimalSimulation {
  private readonly hawkHunting: HawkHunting;
  private readonly friends = new FriendSignals();
  private readonly friendDefense: FriendDefense;
  private readonly friendMarks?: FriendMarks;
  private readonly rabbitPredation: RabbitPredation;
  private readonly ambience?: AnimalAmbience;
  private readonly reproductiveThreat: RabbitReproductiveThreat;
  private readonly water?: WaterSimulation;
  private readonly wildBreeding: WildRabbitBreeding;
  private readonly hunters?: GardenHunters;

  constructor(private readonly context: Context) {
    if (context.world.gardens?.length && typeof context.world.observeHarvest === 'function')
      this.hunters = new GardenHunters({ ...context, shotSound: context.hunterShot });
    this.wildBreeding = new WildRabbitBreeding(context);
    this.friendDefense = new FriendDefense(context.wildlife, context.toast);
    if (context.world.scene) this.friendMarks = new FriendMarks(context.world.scene);
    this.reproductiveThreat = new RabbitReproductiveThreat(context.save, {
      sheltered: (point) => context.earth.isSheltered(point.x, point.y, point.z),
      floorAt: (x, z, y) => context.earth.floorAt(x, z, y),
      waterDepthAt: (x, z) => context.world.waterAt?.(x, z)?.depth ?? 0,
    });
    this.hawkHunting = new HawkHunting({
      ...context,
      protectPlayer: (time) => this.friendDefense.interruptStrike(context.save.player, time, false),
    });
    this.rabbitPredation = new RabbitPredation(context);
    if (typeof context.world.waterAt === 'function')
      this.water = new WaterSimulation({
        ...context,
        habitats: context.ecology.aquaticHabitats,
        onPikeDeath: (pike) => context.remains?.record(pike),
        protectPlayer: (time) =>
          this.friendDefense.interruptStrike(context.save.player, time, true),
      });
    if (context.ambientSound)
      this.ambience = new AnimalAmbience({
        sources: new AnimalVoiceSources(context),
        listener: () => context.save.player,
        facing: () => context.facing?.() ?? { x: 0, z: -1 },
        sheltered: (point) => context.earth.isSheltered(point.x, point.y, point.z),
        sound: context.ambientSound,
        rng: new Random(context.save.seed + 70151),
      });
  }

  get hasCaptures(): boolean {
    return this.hawkHunting.busy;
  }

  avatarChanged(): void {
    this.hawkHunting.resetTargets();
    this.water?.resetTargets();
  }

  dispose(): void {
    this.hunters?.dispose();
    this.friendMarks?.dispose();
    this.water?.dispose();
    if (this.context.raptors) this.context.raptors.dispose();
    else for (const hawk of this.context.hawks) hawk.dispose();
  }

  captureWater(): void {
    this.water?.capture();
  }

  get airliftView() {
    return this.hawkHunting.playerView;
  }

  get rabbitChaseView() {
    return this.reproductiveThreat.view;
  }

  startMating(mateId: number, time: number, cause: 'consensual' | 'forced'): boolean {
    const { save, state, player } = this.context;
    if (save.pregnancy || state.mating || AnimalRestraint.active(player.root)) return false;
    const malePlayer = playerSex(save.player) === 'male';
    if (malePlayer && cause === 'forced') return false;

    const mate = this.context.rabbits.find((actor) => actor.data.id === mateId);
    if (
      !mate?.alive ||
      mate.inShelter ||
      !potentialMate(save.player, mate.data) ||
      Math.hypot(
        mate.x - save.player.x,
        (mate.data.y ?? mate.root.position.y) - save.player.y,
        mate.z - save.player.z,
      ) > MATING_REACH ||
      mate.data.pregnancy ||
      this.wildBreeding.busy(mate) ||
      AnimalRestraint.active(mate.root)
    )
      return false;

    if (malePlayer) save.pregnancy = { motherId: mateId, progress: 0 };
    else if (cause === 'forced') save.pregnancy = { fatherId: mateId, progress: 0, trauma: true };
    else save.pregnancy = { fatherId: mateId, progress: 0 };

    state.mating = { mateId, until: time + MATING_DURATION };
    setRabbitAction(player, 'mate', time, MATING_DURATION);
    setRabbitAction(mate.rig, 'mate', time + mateId, MATING_DURATION);
    return true;
  }

  update(dt: number, time: number, night: boolean, mode: 'active' | 'rest' = 'active'): number {
    const combat = this.context.combatAllowed?.() ?? true;
    const resting = mode === 'rest';
    const canAttackFamily = combat && !resting;
    const matingActor = this.updateMatingState(time);
    const pursuing = this.reproductiveThreat.actor;
    const attack = this.reproductiveThreat.update(
      dt,
      time,
      this.context.rabbits,
      canAttackFamily &&
        !this.context.state.mating &&
        (this.context.canGrabPlayer?.() ?? true) &&
        !AnimalRestraint.active(this.context.player.root),
    );
    if (attack && this.startMating(attack.data.id, time, 'forced'))
      this.context.toast(
        `Крол ${attack.data.name} напал на крольчиху. Она забеременела от него. Риск отклонений у потомства повышен.`,
      );
    const mate = this.context.state.mating ? (matingActor ?? attack) : undefined;
    this.rabbitPredation.update(
      dt,
      time,
      mate ?? this.reproductiveThreat.actor ?? pursuing,
      canAttackFamily,
    );
    this.context.lostKits?.update(time);
    this.wildBreeding.update(dt, time, mate ?? this.reproductiveThreat.actor);
    this.updateRabbits(dt, time, mate);
    for (const member of this.context.families) member.update(time, dt, this.context.groundAt);

    this.context.ecology.prepareHabitats?.(time, this.context.save.clock, this.context.predators);
    const player = this.context.save.player;
    const exposed =
      canAttackFamily &&
      !player.hidden &&
      !this.sheltered &&
      !AnimalRestraint.active(this.context.player.root);
    this.context.ecology.prepareDenDefense?.(time, exposed ? player : undefined, combat);
    const closestThreat = this.updatePredators(dt, time, night, combat, canAttackFamily);
    this.updateUndergroundTraffic(dt, time, night, canAttackFamily, resting);
    this.friendDefense.updateEscorts(
      this.context.save.player,
      this.context.save.clock,
      this.sheltered,
    );
    this.updateEcology(dt, time, combat);
    if (!resting) this.context.collisions.resolve(this.context.state.mating?.mateId);
    this.water?.update(dt, time, canAttackFamily);
    this.grazeRabbits(dt, time);
    this.context.raptors?.update(time);
    this.hawkHunting.update(dt, time, canAttackFamily, night);
    this.hunters?.update(dt, time, canAttackFamily);
    this.context.animalWaste?.update(dt, time);
    this.context.family?.collectDead?.();
    for (const hawk of this.context.hawks) if (!hawk.alive) this.context.remains?.record(hawk);
    this.context.raptors?.removeDead((bird) => this.hawkHunting.carries(bird));
    this.removeDeadRabbits();
    if (
      mate?.alive &&
      !AnimalRestraint.active(mate.root) &&
      !AnimalRestraint.active(this.context.player.root)
    )
      this.positionMatingPair(mate, time, dt);
    this.context.remains?.update();
    this.updateVisibility();
    this.friendMarks?.update(this.context.wildlife, this.context.save.player, time);
    if (resting) return closestThreat;

    this.ambience?.update(time, night);
    this.friends.update(
      time,
      this.context.save.player,
      this.context.wildlife,
      this.context.predators,
      this.context.toast,
      this.context.save.clock,
    );
    return closestThreat;
  }

  private updateRabbits(dt: number, time: number, mating?: RabbitActor): void {
    const p = this.context.save.player;
    for (const rabbit of this.context.rabbits) {
      if (
        rabbit === mating ||
        rabbit === this.reproductiveThreat.actor ||
        this.wildBreeding.busy(rabbit)
      )
        continue;
      if (rabbit.data.lost && this.context.lostKits) {
        if (rabbit.alive) this.context.lostKits.move(rabbit, dt, time);
      } else if (rabbit.data.id === this.context.save.mateId) {
        const event = this.context.family?.updateMother?.(rabbit, dt, time, this.context.groundAt)
          ? undefined
          : this.context.partnerSupport.update(rabbit, dt, time, this.context.groundAt);
        if (
          event?.kind === 'delivered' &&
          Math.hypot(rabbit.data.x - p.x, rabbit.data.z - p.z) < 12
        )
          this.context.toast(event.text);
      } else if (
        !this.context.ecology.updateRabbitTerritory?.(rabbit, dt, time, this.context.earth)
      )
        rabbit.update(dt, time, p.x, p.z, this.context.groundAt);

      const mark = rabbit.rig.root.getObjectByName('mate-mark');
      if (mark) {
        mark.rotation.y = time * 0.6;
        mark.position.y = Math.sin(time * 2.2) * 0.06;
      }
    }
  }

  private updateMatingState(time: number): RabbitActor | undefined {
    const { state, player, rabbits } = this.context;
    const mating = state.mating;
    if (!mating) return;

    const actor = rabbits.find((rabbit) => rabbit.data.id === mating.mateId);
    if (actor && !AnimalRestraint.active(actor.root)) {
      const y = Number(actor.root.userData.baseY ?? actor.root.position.y);
      actor.root.position.set(actor.x, y, actor.z);
    }
    if (
      time >= mating.until ||
      !actor?.alive ||
      AnimalRestraint.active(actor.root) ||
      AnimalRestraint.active(player.root)
    ) {
      state.mating = undefined;
      if (actor?.root.userData.action === 'mate') actor.root.userData.actionUntil = 0;
      if (player.root.userData.action === 'mate') player.root.userData.actionUntil = 0;
      return;
    }
    return actor;
  }

  private positionMatingPair(actor: RabbitActor, time: number, dt: number): void {
    const p = this.context.save.player;
    const heading = this.context.player.root.rotation.y;
    const malePlayer = playerSex(p) === 'male';
    const offset = malePlayer ? -0.45 : 0.28;
    animateRabbit(actor.rig, time + actor.data.id, false, false, dt);
    // Парная поза применяется после физики и не меняет сохранённое положение второго кролика.
    actor.root.position.set(
      p.x + Math.sin(heading) * offset,
      p.y + (malePlayer ? 0 : 0.4),
      p.z + Math.cos(heading) * offset,
    );
    actor.root.rotation.y = heading;
  }

  private updatePredators(
    dt: number,
    time: number,
    night: boolean,
    combat: boolean,
    canAttackFamily: boolean,
  ): number {
    const p = this.context.save.player;
    const canDefend = canAttackFamily && !this.sheltered;
    let closestThreat = Infinity;
    for (const predator of this.context.predators) {
      if (!predator.alive) continue;
      const prey = combat
        ? this.context.ecology.targetFor(
            predator,
            this.context.predators,
            time,
            this.context.lostKits?.prey,
          )
        : undefined;
      const strike = predator.update(
        dt,
        time,
        p.x,
        p.z,
        p.hidden || !canAttackFamily || AnimalRestraint.active(this.context.player.root),
        !night,
        this.context.groundAt,
        p.dirtiness / 100,
        this.context.seasons.predatorActivity(this.context.save.day),
        prey,
        p.genes.size,
      );
      if (predator.inDen) continue;

      const repelled = canDefend && this.friendDefense.repel(predator, p, time);
      if (!repelled) {
        if (strike) this.context.consequences.predatorAttack(predator.kind);
        if (canAttackFamily && predator.huntingOpen)
          this.context.consequences.threatenKits(predator, time);
      }
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }
    return closestThreat;
  }

  private updateUndergroundTraffic(
    dt: number,
    time: number,
    night: boolean,
    canAttackFamily: boolean,
    resting: boolean,
  ): void {
    for (const event of this.context.traffic.update(
      dt,
      time,
      night,
      this.context.predators,
      this.context.rabbits,
      this.context.save,
      this.context.earth,
      canAttackFamily,
    )) {
      if (resting) continue;
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

  private updateEcology(dt: number, time: number, combat: boolean): void {
    const p = this.context.save.player;
    // Чужие стычки продолжают симулироваться, но не создают семейные уведомления и записи журнала.
    this.context.ecology.update(
      dt,
      time,
      this.context.save.clock,
      p.x,
      p.z,
      this.context.groundAt,
      this.context.predators,
      combat,
    );
  }

  private grazeRabbits(dt: number, time: number): void {
    for (const rabbit of this.context.rabbits)
      if (
        !rabbit.solitary &&
        !rabbit.data.lost &&
        rabbit !== this.reproductiveThreat.actor &&
        rabbit.data.id !== this.context.state.mating?.mateId &&
        !AnimalRestraint.active(rabbit.root) &&
        !rabbit.rig.root.userData.conversing &&
        this.context.rng.chance(dt * 0.025)
      ) {
        const food = this.context.world.nearestResource(rabbit.data.x, rabbit.data.z, 1.2);
        if (food && food.kind !== 'toadstool') {
          this.context.world.harvest(food, this.context.save.clock, rabbit.root);
          setRabbitAction(rabbit.rig, 'eat', time + rabbit.data.id, 1.2);
        } else if (
          this.context.world.gnawBark(rabbit.data.x, rabbit.data.z, this.context.save.clock)
        )
          setRabbitAction(rabbit.rig, 'eat', time + rabbit.data.id, 1.2);
      }
  }

  private removeDeadRabbits(): void {
    for (const actors of [this.context.rabbits, this.context.families])
      for (let i = actors.length - 1; i >= 0; i--)
        if (!actors[i].alive) {
          actors[i].data.health = 0;
          const { save } = this.context;
          if (actors[i] instanceof RabbitActor && save.mateId === actors[i].data.id) {
            if (save.pregnancy?.motherId === save.mateId) save.pregnancy = null;
            save.mateId = undefined;
            if (save.coldNightOuting) delete save.coldNightOuting.helperId;
            save.mateStay = undefined;
            save.mateCommand = undefined;
            save.mateMessages = [];
            save.partnerCargo = undefined;
          }
          if (actors[i] instanceof FamilyMember)
            (this.context.save.familyHealth ??= {})[actors[i].data.id] = 0;
          this.context.remains?.record({
            kind: 'rabbit',
            root: actors[i].root,
            genes: actors[i].data.genes,
          });
          ModelAssets.shared.release(actors[i].root);
          actors[i].root.removeFromParent();
          actors.splice(i, 1);
        }
  }

  private updateVisibility(): void {
    const p = this.context.save.player;
    for (const rabbit of this.context.rabbits)
      rabbit.rig.root.visible =
        !rabbit.inShelter &&
        Math.hypot(rabbit.rig.root.position.x - p.x, rabbit.rig.root.position.z - p.z) < 76;

    for (const member of this.context.families)
      member.rig.root.visible =
        Math.hypot(member.rig.root.position.x - p.x, member.rig.root.position.z - p.z) < 76;

    for (const predator of this.context.predators)
      predator.root.visible =
        !predator.inDen &&
        Math.hypot(predator.root.position.x - p.x, predator.root.position.z - p.z) < 76;

    for (const animal of this.context.wildlife)
      animal.root.visible =
        animal.alive && !animal.inShelter && Math.hypot(animal.x - p.x, animal.z - p.z) < 76;

    for (const hawk of this.context.hawks) {
      const visible =
        hawk.present &&
        (!hawk.perched || hawk.supportVisible) &&
        Math.hypot(hawk.x - p.x, hawk.z - p.z) < 92;
      hawk.root.visible = visible;
      hawk.shadow.visible = visible && !hawk.perched && !this.sheltered;
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
