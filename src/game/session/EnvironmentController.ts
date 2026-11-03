import type { Camera } from 'three';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import type { FamilyCare } from '../FamilyCare';
import type { RabbitAction, RabbitRig } from '../Models';
import type { FoodStore, SurvivalSystem, WasteSystem } from '../systems';
import { FOOD, type NestData, type SaveData } from '../types';
import type { ViewCamera } from '../ViewCamera';
import type { World } from '../World';
import type { FamilyLifecycle } from './FamilyLifecycle';
import type { SessionQueries } from './SessionQueries';
import { GeneticTraits } from '../genetics/GeneticTraits';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
interface EnvironmentContext {
  waste: WasteSystem;
  persist: () => void;
  save: SaveData;
  world: World;
  earth: Excavation;
  view: ViewCamera;
  camera: Camera;
  sound: Soundscape;
  player: RabbitRig;
  store: FoodStore;
  survival: SurvivalSystem;
  care: FamilyCare;
  family: FamilyLifecycle;
  queries: SessionQueries;
  elapsed: () => number;
  toast: (text: string) => void;
  playAction: (action: RabbitAction, duration: number) => void;
  addNest: (nest: NestData) => void;
  requestJump?: () => boolean;
  makeWaste: (kind: 'pellets' | 'urine' | 'diarrhea') => void;
}
/** Реестр действий с окружением и потребностями; владеет их перезарядками. */
export class EnvironmentController {
  nextDigAt = 0;
  private furCooldown = 0;
  private readonly handlers: Record<string, () => void> = {
    hop: () => this.hop(),
    drink: () => this.drink(),
    fur: () => this.pluckFur(),
    nest: () => this.buildNest(),
    dig: () => this.dig('dig'),
    'dig-down': () => this.dig('dig-down'),
    roots: () => this.roots('roots'),
    steal: () => this.roots('steal'),
    bark: () => this.gnawBark(),
    sleep: () => this.sleep(),
    poop: () => this.defecate(),
    pee: () => this.urinate(),
    groom: () => this.groom(),
    clean: () => this.clean(),
  };

  constructor(private readonly context: EnvironmentContext) {}

  private get sheltered(): boolean {
    const p = this.context.save.player;
    return this.context.earth.isSheltered(p.x, p.y, p.z);
  }

  update(dt: number): void {
    this.furCooldown = Math.max(0, this.furCooldown - dt);
  }

  execute(action: string): boolean {
    const handler = this.handlers[action];
    if (!handler) return false;
    handler();
    return true;
  }

  private hop(): void {
    this.context.requestJump?.();
  }

  private clean(): void {
    const p = this.context.save.player;
    if (p.energy < 3) {
      this.context.toast('Для уборки нужно 3 единицы сил. Немного передохни.');
      return;
    }
    const count = this.context.waste.cleanNear(p.x, p.y, p.z);
    if (!count) {
      this.context.toast('Рядом чисто. Подойди к нечистотам поближе.');
      return;
    }
    p.energy -= 3;
    this.context.playAction('dig', 1.2);
    this.context.sound.play('dig');
    this.context.persist();
    this.context.toast(`Ты убрала нечистоты: ${count}. В гнезде стало чище.`);
  }

  private drink(): void {
    const p = this.context.save.player;
    if (this.sheltered || !this.context.world.nearWater(p.x, p.z)) {
      this.context.toast('Подойди к пруду или воде в болоте, чтобы попить.');
      return;
    }

    p.thirst = clamp(p.thirst + 54, 0, 100);
    p.bladder = clamp(p.bladder + 16, 0, 100);
    this.context.sound.play('drink');
    this.context.toast('Прохладная вода утолила жажду.');
    return;
  }

  private pluckFur(): void {
    const p = this.context.save.player;
    if (this.furCooldown > 0) {
      this.context.toast('Нужно немного подождать, пока снова появится пух.');
      return;
    }

    this.furCooldown = 25;
    p.energy = clamp(p.energy - 5, 0, 100);
    this.context.save.materials.fur++;
    this.context.sound.play('pickup');
    this.context.playAction('pluck', 1.7);
    this.context.toast('Ты собрала немного собственного пуха для гнезда.');
    return;
  }

  private buildNest(): void {
    const p = this.context.save.player;
    const m = this.context.save.materials;

    if (!this.sheltered) {
      this.context.toast('Гнездо можно устроить только в выкопанном подземном ходе.');
      return;
    }

    if (m.grass < 3 || m.twigs < 2 || m.fur < 2) {
      this.context.toast(
        `Для гнезда нужно: трава 3 (${m.grass}), ветки 2 (${m.twigs}), пух 2 (${m.fur}).`,
      );
      return;
    }

    if (this.context.queries.nest(2.5)) {
      this.context.toast('Здесь уже есть гнездо. Отойди немного дальше.');
      return;
    }

    m.grass -= 3;
    m.twigs -= 2;
    m.fur -= 2;

    const id = Math.max(0, ...this.context.save.nests.map((n) => n.id)) + 1;

    const n: NestData = { id, x: p.x, y: p.y, z: p.z, quality: 1 };

    this.context.save.nests.push(n);
    this.context.addNest(n);
    this.context.sound.play('nest');
    this.context.toast(
      this.sheltered
        ? 'Тёплое гнездо готово под землёй.'
        : 'Гнездо готово. На поверхности крольчатам опаснее.',
    );
    return;
  }

  private dig(action: string): void {
    const p = this.context.save.player;
    if (!this.context.view.isFirstPerson) {
      this.context.toast('Копать можно только от первого лица. Нажми B.');
      return;
    }

    if (action === 'dig-down' && !this.sheltered) {
      this.context.toast('Сначала выкопай вход, затем спустись в него.');
      return;
    }

    if (this.context.elapsed() < this.nextDigAt) return;

    const cost = 8 * GeneticTraits.energyCost(p.genes);
    if (p.genes.anatomy.legs === 0) {
      this.nextDigAt = this.context.elapsed() + 1;
      this.context.toast('Без лап копать не получится.');
      return;
    }
    if (p.energy < cost) {
      this.nextDigAt = this.context.elapsed() + 1;
      this.context.toast(
        'Мало сил. Постой спокойно: через 4 секунды силы начнут восстанавливаться.',
      );
      return;
    }

    if (
      ((this.context.player.root.userData.actionUntil as number | undefined) ?? 0) >
      this.context.elapsed()
    )
      return;

    const result = this.context.earth.dig(
      this.context.camera,
      p.x,
      p.y,
      p.z,
      action === 'dig-down',
    );

    if (!result.success) {
      this.nextDigAt = this.context.elapsed() + 0.55;
      this.context.toast(result.reason);
      return;
    }

    this.nextDigAt = this.context.elapsed() + 1.15;

    p.energy -= cost;
    this.context.playAction('dig', 1.15);
    this.context.sound.play('dig');
    this.context.toast(result.reason);
    return;
  }

  private roots(action: string): void {
    const p = this.context.save.player;
    if (!this.sheltered) {
      this.context.toast('Копай под растением, чтобы добраться до корня.');
      return;
    }

    const root = this.context.world.rootAt(p.x, p.z, this.context.earth.depthAt(p.x, p.y, p.z));

    if (!root || !root.available || ('mesh' in root && !root.mesh.visible)) {
      this.context.toast('Здесь нет доступного корня. Копай ближе к растению.');
      return;
    }

    if (action === 'steal' && 'tree' in root) {
      this.context.toast('Древесный корень слишком крепок, его можно только погрызть.');
      return;
    }

    if (action === 'steal' && this.context.store.carried() >= this.context.store.capacity) {
      this.context.toast('Запасы переполнены. Сложи часть еды в тайник.');
      return;
    }

    const kind = root.kind;

    if ('tree' in root) this.context.world.gnawTreeRoot(root.id, this.context.save.clock);
    else this.context.world.harvest(root, this.context.save.clock);

    this.context.earth.refreshRoots();

    if (action === 'roots') {
      p.hunger = clamp(p.hunger + ('tree' in root ? 5 : 12), 0, 100);

      p.thirst = clamp(p.thirst + ('tree' in root ? 0 : 4), 0, 100);

      this.context.playAction('eat', 1.3);

      this.context.toast(
        'tree' in root
          ? 'Ты погрызла жёсткое древесное корневище.'
          : `Ты погрызла корень ${FOOD[kind].label.toLowerCase()}.`,
      );
    } else {
      this.context.save.inventory[kind]++;
      this.context.sound.play('pickup');
      this.context.toast(`Ты утащила ${FOOD[kind].label.toLowerCase()} через подкоп.`);
    }

    return;
  }

  private gnawBark(): void {
    const p = this.context.save.player;
    if (this.sheltered || !this.context.world.gnawBark(p.x, p.z, this.context.save.clock)) {
      this.context.toast('Подойди к дереву с доступной корой. Ему нужно время на восстановление.');
      return;
    }

    p.hunger = clamp(p.hunger + 6, 0, 100);
    this.context.playAction('eat', 1.4);
    this.context.toast('Ты погрызла кору дерева и немного утолила голод.');
    return;
  }

  private sleep(): void {
    const p = this.context.save.player;
    if (!this.sheltered && !this.context.queries.nest(2.5)) {
      this.context.toast('Спать можно в укрытом ходе или у гнезда.');
      return;
    }

    this.context.save.clock += 330;
    p.age += 330 / 1440;

    const labour = this.context.care.advance(330);

    if (labour === 'warning')
      this.context.toast('Скоро роды. Успей вернуться в гнездо внутри выкопанного хода!');

    if (labour === 'birth') this.context.family.birth();

    for (const kit of this.context.save.kits) if (kit.alive) kit.age += 330 / 1440;

    p.energy = this.context.queries.nest(2.5) ? 100 : clamp(p.energy + 65, 0, 100);
    p.hunger = clamp(p.hunger - 17, 0, 100);
    p.thirst = clamp(p.thirst - 20, 0, 100);
    p.bladder = clamp(p.bladder + 15, 0, 100);
    p.bodyTemp = clamp(p.bodyTemp + 1.5, 28, 39);

    p.health = 100;
    this.context.playAction('lie', 2.8);
    this.context.toast(
      'Ты выспалась. Здоровье восстановилось; в гнезде силы восстанавливаются полностью.',
    );
    return;
  }

  private defecate(): void {
    const p = this.context.save.player;
    if (p.bowel < 12) {
      this.context.toast('Пока нет потребности оставлять помёт.');
      return;
    }

    this.context.makeWaste(p.poison > 40 ? 'diarrhea' : 'pellets');
    p.bowel = 0;

    this.context.playAction('defecate', 1.8);
    this.context.toast('Готово. Оставленные шарики могут привлечь хищника.');
    return;
  }

  private urinate(): void {
    const p = this.context.save.player;
    if (p.bladder < 12) {
      this.context.toast('Пока нет потребности помочиться.');
      return;
    }

    this.context.makeWaste('urine');
    p.bladder = 0;

    this.context.playAction('defecate', 1.5);
    this.context.toast('Готово. В норе лучше поддерживать чистоту.');
    return;
  }

  private groom(): void {
    this.context.survival.groom();
    this.context.playAction('groom', 2.5);
    this.context.toast('Ты вылизала шерсть. Стало чище и спокойнее.');
    return;
  }
}
