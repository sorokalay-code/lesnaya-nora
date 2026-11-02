import * as THREE from 'three';
import { RabbitFactory, RabbitKit } from '../animals';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import type { FamilyCare } from '../FamilyCare';
import { KitWander } from '../KitWander';
import { ModelAssets } from '../ModelAssets';
import { animateRabbit, setRabbitAction, type RabbitAction, type RabbitRig } from '../Models';
import { Random } from '../Random';
import { FOOD, type KitData, type SaveData } from '../types';
import type { World } from '../World';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const femaleNames = [
  'Искорка',
  'Лапка',
  'Ромашка',
  'Звёздочка',
  'Берёзка',
  'Снежка',
  'Брусничка',
  'Ива',
];
const maleNames = ['Клевер', 'Шорох', 'Орешек', 'Лучик', 'Пушок', 'Ветерок', 'Туман', 'Листик'];
interface FamilyContext {
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
  private elapsed = 0;

  constructor(private readonly context: FamilyContext) {
    this.wander = new KitWander(new Random(context.save.seed + 7741));
  }

  add(k: KitData): void {
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

    ModelAssets.shared.release(rig.root);
    rig.root.removeFromParent();
    this.rigs.delete(id);
    this.actors.delete(id);
  }

  update(dt: number, time: number): void {
    this.elapsed = time;
    const pregnancyEvent = this.context.care.advance(dt * 6);
    if (pregnancyEvent === 'warning') {
      this.context.sound.play('baby');
      this.context.toast('Скоро роды. Вернись в гнездо внутри выкопанного хода!');
    }

    if (pregnancyEvent === 'birth') this.birth();

    for (const kit of this.context.save.kits) {
      if (!kit.alive) continue;

      const wasYoung = kit.age < 3;
      kit.age += (dt * 6) / 1440;
      if (wasYoung && kit.age >= 3) {
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
        kit.homeX = clamp(kit.homeX + Math.cos(angle) * 22, -90, 90);
        kit.homeZ = clamp(kit.homeZ + Math.sin(angle) * 22, -90, 90);
        kit.homeY = this.context.world.heightAt(kit.homeX, kit.homeZ);
        kit.nestId = undefined;
        this.context.sound.play('baby');
        this.context.toast(
          `${kit.name} вырос${kit.name.endsWith('а') ? 'ла' : ''} и отправился жить самостоятельно.`,
        );
      }

      if (kit.age < 3) {
        kit.hunger = clamp(kit.hunger - dt * 0.08, 0, 100);
        const nest = this.context.save.nests.find((n) => n.id === kit.nestId);
        if (!nest && this.context.temperature() < 9)
          kit.health = clamp(kit.health - dt * 0.17 * 0.8, 0, 100);
        else if (
          nest &&
          !this.context.earth.isSheltered(nest.x, nest.y, nest.z) &&
          this.context.temperature() < 0
        )
          kit.health = clamp(kit.health - dt * 0.055 * 0.8, 0, 100);

        if (kit.hunger < 12) kit.health = clamp(kit.health - dt * 0.2 * 0.8, 0, 100);
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
        if (rig.root.userData.conversing === true) {
          animateRabbit(rig, time + kit.id, false, false, dt);
          continue;
        }
        const nest = this.context.save.nests.find((n) => n.id === kit.nestId);
        const home = nest ?? { x: kit.homeX, y: kit.homeY, z: kit.homeZ };
        rig.root.visible = true;
        if (rig.root.parent !== this.context.scene) this.context.scene.add(rig.root);

        const center = kit.independent
          ? { x: kit.homeX, y: kit.homeY, z: kit.homeZ }
          : kit.command === 'follow'
            ? this.context.save.player
            : kit.command === 'rest' && !nest
              ? {
                  x: kit.stayX ?? kit.x ?? home.x,
                  y: kit.stayY ?? kit.y ?? home.y,
                  z: kit.stayZ ?? kit.z ?? home.z,
                }
              : kit.command === 'stay' && kit.stayX !== undefined
                ? { x: kit.stayX, y: kit.stayY ?? home.y, z: kit.stayZ ?? home.z }
                : home;
        const destination =
          kit.independent || !kit.command
            ? this.wander.target(kit, center, this.elapsed, this.context.earth, (x, z) =>
                this.context.world.heightAt(x, z),
              )
            : kit.command === 'follow'
              ? {
                  x: center.x + Math.cos(kit.id * 2.4) * (1.5 + (kit.id % 3) * 0.35),
                  y: center.y,
                  z: center.z + Math.sin(kit.id * 2.4) * (1.5 + (kit.id % 3) * 0.35),
                }
              : kit.command === 'rest'
                ? {
                    x: center.x + Math.cos(kit.id * 2.4) * 0.3,
                    y: center.y,
                    z: center.z + Math.sin(kit.id * 2.4) * 0.3,
                  }
                : center;
        let targetX = destination.x,
          targetZ = destination.z;
        if (!kit.independent) {
          const step = this.context.earth.nextStep(
            { x: kit.x ?? home.x, y: kit.y ?? home.y, z: kit.z ?? home.z },
            destination,
          );
          if (step) {
            targetX = step.x;
            targetZ = step.z;
          }
        }

        const dx = targetX - (kit.x ?? home.x),
          dz = targetZ - (kit.z ?? home.z),
          distance = Math.hypot(dx, dz);
        const speed = kit.independent
          ? 2.4
          : kit.command === 'follow'
            ? Math.min(12, 3 + distance * 1.3)
            : kit.age < 0.7
              ? 0.55
              : 1.2;
        const step = Math.min(distance, speed * dt);
        if (distance > 0.04) {
          kit.x = (kit.x ?? home.x) + (dx / distance) * step;
          kit.z = (kit.z ?? home.z) + (dz / distance) * step;
          rig.root.rotation.y = Math.atan2(-dx, -dz);
        }

        const currentY = kit.y ?? home.y;
        kit.y = kit.independent
          ? this.context.world.heightAt(kit.x ?? home.x, kit.z ?? home.z)
          : this.context.earth.floorAt(kit.x ?? home.x, kit.z ?? home.z, currentY);
        rig.root.position.x = kit.x ?? home.x;
        rig.root.position.z = kit.z ?? home.z;
        rig.root.userData.baseY = kit.y;
        rig.root.scale.setScalar(
          kit.age < 3 ? (0.28 + kit.age * 0.095) * kit.genes.size : kit.genes.size,
        );
        const mark = rig.root.getObjectByName('family-mark');
        if (mark) {
          mark.rotation.y = this.elapsed * 0.9;
          mark.position.y = Math.sin(this.elapsed * 2 + kit.id) * 0.07;
        }

        if (distance > 0.16) rig.root.userData.actionUntil = 0;
        else if (kit.command === 'rest') setRabbitAction(rig, 'lie', this.elapsed + kit.id, 0.35);
        else if (kit.command === 'stay') setRabbitAction(rig, 'sit', this.elapsed + kit.id, 0.35);

        animateRabbit(rig, this.elapsed + kit.id, distance > 0.14, false, dt);
      }
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
      const id = Math.max(0, ...this.context.save.kits.map((k) => k.id)) + 1;
      const name = this.context.rng.pick(this.context.rng.chance(0.5) ? femaleNames : maleNames);
      const kit: KitData = {
        id,
        name,
        genes: this.context.genetics.inherit(this.context.save.player.genes, father.genes),
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
