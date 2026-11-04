import { RabbitFamily, FEMALE_KIT_NAMES, MALE_KIT_NAMES } from './RabbitFamily';
import { KitMovement } from './KitMovement';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { Genealogy } from '../genetics/Genealogy';
import { GeneticTraits } from '../genetics/GeneticTraits';
import * as THREE from 'three';
import { RabbitFactory, RabbitKit } from '../animals';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import { TRAUMA_MUTATION_RISK, type FamilyCare } from '../FamilyCare';
import { KitWander } from '../KitWander';
import { ModelAssets } from '../ModelAssets';
import { type RabbitAction, type RabbitRig } from '../Models';
import { Random } from '../Random';
import { FOOD, type KitData, type SaveData } from '../types';
import type { World } from '../World';
import { GAME_MINUTES_PER_SECOND } from './WorldCalendar';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
interface FamilyContext {
  onDeath?: (root: THREE.Group, genes: import('../types').Genes) => void;
  save: SaveData;
  scene: THREE.Scene;
  world: World;
  earth: Excavation;
  care: FamilyCare;
  rng: Random;
  genetics: RabbitFactory;
  sound: Soundscape;
  temperature: () => number;
  toast: (text: string) => void;
  persist: () => void;
  playAction: (action: RabbitAction, duration: number) => void;
}
/** Жизненный цикл семьи: рождение, взросление, кормление и физическое движение крольчат. */
export class FamilyLifecycle {
  readonly actors = new Map<number, RabbitKit>();
  readonly rigs = new Map<number, RabbitRig>();
  readonly wander: KitWander;
  private readonly movement: KitMovement;

  constructor(private readonly context: FamilyContext) {
    this.wander = new KitWander(new Random(context.save.seed + 7741));
    this.movement = new KitMovement(context, this.wander);
  }

  add(k: KitData): void {
    if (k.age >= 3) {
      k.independent = true;
      k.command = undefined;
    }
    const actor = new RabbitKit(k);
    this.actors.set(k.id, actor);
    const rig = actor.rig;
    if (k.age < 3) {
      const marker = new THREE.Group();
      marker.name = 'family-mark';
      const gold = new THREE.MeshStandardMaterial({
        color: 0xf4d57b,
        emissive: 0x725010,
        emissiveIntensity: 0.25,
      });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), gold);
      star.position.y = 1.67;
      marker.add(star);
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 5, 12), gold);
      ribbon.position.set(0, 0.65, -0.05);
      ribbon.rotation.x = Math.PI / 2;
      marker.add(ribbon);
      rig.root.add(marker);
    }

    k.x ??= k.homeX + Math.cos(k.id * 2.4) * 0.7;
    k.z ??= k.homeZ + Math.sin(k.id * 2.4) * 0.7;
    k.y ??= k.homeY;
    rig.root.position.set(k.x, k.y, k.z);
    this.context.scene.add(rig.root);
    this.rigs.set(k.id, rig);
  }

  remove(id: number): void {
    const rig = this.rigs.get(id);
    if (!rig) return;

    const kit = this.context.save.kits.find((child) => child.id === id);
    if (kit && (!kit.alive || kit.health <= 0)) this.context.onDeath?.(rig.root, kit.genes);

    ModelAssets.shared.release(rig.root);
    rig.root.removeFromParent();
    this.movement.forget(id);
    this.rigs.delete(id);
    this.actors.delete(id);
  }

  advancePregnancy(minutes: number): void {
    const pregnancyEvent = this.context.care.advance(minutes);
    if (pregnancyEvent === 'warning') {
      this.context.sound.play('baby');
      this.context.toast('Скоро роды. Вернись в гнездо внутри выкопанного хода!');
    }

    if (pregnancyEvent === 'birth') this.birth();
  }

  update(dt: number, time: number, mode: 'active' | 'rest' = 'active'): void {
    const minutes = dt * GAME_MINUTES_PER_SECOND;
    if (mode === 'active') this.advancePregnancy(minutes);
    for (const kit of this.context.save.kits) {
      if (!kit.alive || kit.health <= 0) {
        kit.alive = false;
        if (this.rigs.has(kit.id)) this.remove(kit.id);
        continue;
      }

      const currentRig = this.rigs.get(kit.id);
      kit.age += minutes / 1440;
      if (
        !kit.independent &&
        kit.age >= 3 &&
        (!currentRig || !AnimalRestraint.active(currentRig.root))
      ) {
        this.context.save.stats.grown++;
        kit.independent = true;
        kit.command = undefined;
        this.wander.forget(kit.id);
        this.remove(kit.id);
        const actor = new RabbitKit(kit);
        this.actors.set(kit.id, actor);
        const adult = actor.rig;
        adult.root.position.set(kit.x ?? kit.homeX, kit.y ?? kit.homeY, kit.z ?? kit.homeZ);
        this.rigs.set(kit.id, adult);
        this.context.scene.add(adult.root);
        const angle = kit.id * 2.4;
        kit.homeX = clamp(
          kit.homeX + Math.cos(angle) * 22,
          (-this.context.world.size * 90) / 110,
          (this.context.world.size * 90) / 110,
        );
        kit.homeZ = clamp(
          kit.homeZ + Math.sin(angle) * 22,
          (-this.context.world.size * 90) / 110,
          (this.context.world.size * 90) / 110,
        );
        kit.homeY = this.context.world.heightAt(kit.homeX, kit.homeZ);
        kit.nestId = undefined;
        this.context.sound.play('baby');
        this.context.toast(
          RabbitFamily.sex(kit) === 'female'
            ? `${kit.name} выросла и живёт самостоятельно. В панели «Семья» можно продолжить историю за неё.`
            : `${kit.name} вырос и отправился жить самостоятельно.`,
        );
      }

      if (kit.age < 3) {
        kit.hunger = clamp(kit.hunger - dt * 0.08 * GeneticTraits.metabolism(kit.genes), 0, 100);
        const nest = this.context.save.nests.find((n) => n.id === kit.nestId);
        const temperature = this.context.temperature() + GeneticTraits.coldProtection(kit.genes);
        if (!nest && temperature < 9)
          kit.health = clamp(
            kit.health - (dt * 0.17 * 0.8) / GeneticTraits.resilience(kit.genes),
            0,
            100,
          );
        else if (nest && !this.context.earth.isSheltered(nest.x, nest.y, nest.z) && temperature < 0)
          kit.health = clamp(
            kit.health - (dt * 0.055 * 0.8) / GeneticTraits.resilience(kit.genes),
            0,
            100,
          );

        if (kit.hunger < 12)
          kit.health = clamp(
            kit.health - (dt * 0.2 * 0.8) / GeneticTraits.resilience(kit.genes),
            0,
            100,
          );
        else if (kit.hunger > 65) kit.health = clamp(kit.health + dt * 0.04, 0, 100);

        if (kit.health <= 0) {
          kit.alive = false;
          this.remove(kit.id);
          this.context.toast(`${kit.name} не пережил трудные дни. Позаботься о других крольчатах.`);
          continue;
        }
      }

      const rig = this.rigs.get(kit.id);
      if (rig) {
        rig.root.visible = true;
        this.movement.update(kit, rig, time, dt);
      }
    }
  }

  /** Собирает смерти от нападений в конце кадра, до возможного автосохранения. */
  collectDead(): void {
    for (const kit of this.context.save.kits) {
      if (kit.alive && kit.health > 0) continue;
      kit.alive = false;
      if (this.rigs.has(kit.id)) this.remove(kit.id);
    }
  }

  birth(): void {
    const pregnancy = this.context.save.pregnancy;
    if (!pregnancy) return;

    const father = this.context.save.partners.find((p) => p.id === pregnancy.fatherId);
    if (!father) {
      this.context.save.pregnancy = null;
      return;
    }

    const count = this.context.rng.int(2, 5);
    const nest = this.context.care.birthNest();
    if (!nest) {
      this.context.save.stats.stillborn = (this.context.save.stats.stillborn ?? 0) + count;
      this.context.save.pregnancy = null;
      this.context.sound.play('baby');
      this.context.toast(
        `Роды начались вне подземного гнезда. К сожалению, ${count} крольчат родились мёртвыми. В следующий раз подготовь гнездо в норе заранее.`,
      );
      this.context.persist();
      return;
    }

    const home = nest;
    for (let i = 0; i < count; i++) {
      const id = RabbitFamily.nextId(this.context.save);
      const sex = this.context.rng.chance(0.5) ? 'female' : 'male';
      const name = this.context.rng.pick(sex === 'female' ? FEMALE_KIT_NAMES : MALE_KIT_NAMES);
      const kit: KitData = {
        id,
        name,
        sex,
        genes: this.context.genetics.inherit(
          this.context.save.player.genes,
          father.genes,
          Genealogy.related(this.context.save.player.lineage, father.lineage),
          pregnancy.trauma ? TRAUMA_MUTATION_RISK : 0,
        ),
        lineage: Genealogy.child('child:' + this.context.save.seed + ':' + id, [
          {
            name: this.context.save.player.name ?? 'Мама',
            lineage:
              this.context.save.player.lineage ??
              Genealogy.founder('player:' + this.context.save.seed),
          },
          { name: father.name, lineage: father.lineage ?? Genealogy.founder('wild:' + father.id) },
        ]),
        age: 0,
        hunger: 85,
        health: 100,
        father: father.name,
        homeX: home.x,
        homeY: home.y,
        homeZ: home.z,
        x: home.x + Math.cos(id * 2.4) * 0.7,
        y: home.y,
        z: home.z + Math.sin(id * 2.4) * 0.7,
        nestId: nest?.id,
        alive: true,
      };
      this.context.save.kits.push(kit);
      this.context.save.stats.generations = Math.max(
        this.context.save.stats.generations,
        kit.lineage?.generation ?? 1,
      );
      this.add(kit);
    }

    this.context.save.stats.births += count;
    this.context.save.pregnancy = null;
    this.context.sound.play('baby');
    this.context.toast(`Родились крольчата: ${count}! Они устроились в тёплом гнезде под землёй.`);
    this.context.persist();
  }

  feed(vegetables = false): void {
    const p = this.context.save.player;
    const young = this.context.save.kits.filter(
      (k) =>
        k.alive &&
        k.age < 3 &&
        Math.hypot((k.x ?? k.homeX) - p.x, (k.y ?? k.homeY) - p.y, (k.z ?? k.homeZ) - p.z) < 4,
    );
    if (!young.length) {
      this.context.toast('Здесь пока нет маленьких крольчат.');
      return;
    }

    if (vegetables) {
      const ready = young.filter((k) => k.age >= 0.8);
      if (!ready.length) {
        this.context.toast('Крольчата ещё слишком малы для овощей. Пока корми их молоком.');
        return;
      }

      const kind = (['carrot', 'cabbage'] as const).find((k) => this.context.save.inventory[k] > 0);
      if (!kind) {
        this.context.toast('Для крольчат нужны морковь или капуста из запасов.');
        return;
      }

      this.context.save.inventory[kind]--;
      for (const kit of ready) {
        kit.hunger = clamp(kit.hunger + FOOD[kind].nutrition, 0, 100);
        kit.health = clamp(kit.health + 3, 0, 100);
      }

      this.context.playAction('eat', 1.5);
      this.context.sound.play('baby');
      this.context.toast(
        `Ты принесла ${FOOD[kind].label.toLowerCase()} ${ready.length} подросшим крольчатам.`,
      );
      return;
    }

    if (this.context.save.player.milk < 12) {
      this.context.toast('Молока мало. Поешь и попей, чтобы оно накопилось.');
      return;
    }

    this.context.save.player.milk = clamp(this.context.save.player.milk - 12, 0, 100);
    for (const kit of young) {
      kit.hunger = clamp(kit.hunger + 35, 0, 100);
      kit.health = clamp(kit.health + 6, 0, 100);
    }

    this.context.playAction('nurse', 2.8);
    this.context.sound.play('baby');
    this.context.toast(`Ты покормила молоком ${young.length} крольчат. Их здоровье укрепилось.`);
  }
}
