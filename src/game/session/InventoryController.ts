import type { GameUI } from '../../ui/GameUI';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import type { GroundItems } from '../GroundItems';
import type { RabbitAction } from '../Models';
import type { FoodStore, SurvivalSystem } from '../systems';
import type { FoodKind, MaterialKind, SaveData, StashData } from '../types';
import { FOOD } from '../types';
import type { ViewCamera } from '../ViewCamera';
import type { World } from '../World';
import type { SessionQueries } from './SessionQueries';
interface InventoryContext {
  save: SaveData;
  world: World;
  earth: Excavation;
  view: ViewCamera;
  items: GroundItems;
  store: FoodStore;
  survival: SurvivalSystem;
  sound: Soundscape;
  ui: GameUI;
  queries: SessionQueries;
  toast: (text: string) => void;
  playAction: (action: RabbitAction, duration: number) => void;
  addStash: (stash: StashData) => void;
  clearSelection: () => void;
  closePanels: () => void;
}
/** Команды багажа: сбор, выбрасывание, питание и перенос припасов в тайник. */
export class InventoryController {
  constructor(private readonly context: InventoryContext) {}

  private get sheltered(): boolean {
    const p = this.context.save.player;
    return this.context.earth.isSheltered(p.x, p.y, p.z);
  }

  execute(action: string): boolean {
    if (action.startsWith('drop-material:')) this.dropMaterial(action);
    else if (action.startsWith('drop:')) this.dropFood(action);
    else if (action.startsWith('consume:') || action.startsWith('consume-stash:'))
      this.consume(action);
    else if (action === 'eat') this.openBag();
    else if (action === 'store' || action === 'retrieve') this.transfer(action);
    else return false;

    return true;
  }

  private dropMaterial(action: string): void {
    const kind = action.slice(14) as MaterialKind;

    if (!['grass', 'twigs', 'fur'].includes(kind) || this.context.save.materials[kind] <= 0) return;

    const p = this.context.save.player,
      forward = this.context.view.forwardAt(),
      x = p.x + forward.x * 0.85,
      z = p.z + forward.z * 0.85;

    this.context.save.materials[kind]--;

    this.context.items.drop(
      kind,
      x,
      this.sheltered ? this.context.earth.floorAt(x, z, p.y) : this.context.world.heightAt(x, z),
      z,
    );

    this.context.closePanels();
    this.context.toast('Материал выброшен. Его можно поднять снова клавишей E.');
    return;
  }

  private dropFood(action: string): void {
    const kind = action.slice(5) as FoodKind;

    if (!(kind in FOOD) || this.context.save.inventory[kind] <= 0) return;

    const p = this.context.save.player,
      forward = this.context.view.forwardAt();

    const x = p.x + forward.x * 0.85,
      z = p.z + forward.z * 0.85;

    this.context.save.inventory[kind]--;

    this.context.items.drop(
      kind,
      x,
      this.sheltered ? this.context.earth.floorAt(x, z, p.y) : this.context.world.heightAt(x, z),
      z,
    );

    this.context.closePanels();
    this.context.sound.play('pickup');
    this.context.toast(`Ты выбросила ${FOOD[kind].label.toLowerCase()}. Предмет лежит на земле.`);
    return;
  }

  private consume(action: string): void {
    const fromStash = action.startsWith('consume-stash:');

    const kind = action.slice(fromStash ? 14 : 8) as FoodKind;

    const stash = fromStash ? this.context.queries.stash() : undefined;

    if (
      !(kind in FOOD) ||
      (fromStash ? (stash?.food[kind] ?? 0) : this.context.save.inventory[kind]) <= 0
    )
      return;

    if (fromStash && stash) stash.food[kind] = (stash.food[kind] ?? 0) - 1;
    else this.context.save.inventory[kind]--;

    const poisoned = this.context.survival.eat(kind);

    this.context.sound.play('eat');
    this.context.playAction('eat', 1.5);

    this.context.toast(
      poisoned
        ? `После ${FOOD[kind].label.toLowerCase()} тебе стало плохо. Возможно, еда ядовита.`
        : `Ты съела: ${FOOD[kind].label.toLowerCase()}.`,
    );

    this.context.closePanels();
    return;
  }

  collect(): void {
    const p = this.context.save.player;
    const item = this.context.items.nearest(p.x, p.y, p.z);

    if (item) {
      if (item.kind === 'branch') {
        if (this.context.items.collect(item, this.context.save.clock)) {
          this.context.save.materials.twigs++;
          this.context.sound.play('pickup');
          this.context.toast('Ты подняла сухую ветку для гнезда.');
        }
      } else if (item.kind === 'grass' || item.kind === 'twigs' || item.kind === 'fur') {
        if (this.context.items.collect(item, this.context.save.clock)) {
          this.context.save.materials[item.kind]++;
          this.context.sound.play('pickup');
          this.context.toast('Материал снова в багаже.');
        }
      } else {
        if (this.context.store.carried() >= this.context.store.capacity) {
          this.context.toast('Багаж заполнен. Выброси лишнюю еду через G или сложи её в тайник.');
          return;
        }

        if (this.context.items.collect(item, this.context.save.clock)) {
          this.context.save.inventory[item.kind]++;
          this.context.sound.play('pickup');
          this.context.toast(`Подобрано: ${FOOD[item.kind].label.toLowerCase()}.`);
        }
      }

      return;
    }

    if (this.sheltered) {
      this.context.toast('Наведи прицел на земляную стену и нажми ЛКМ, чтобы копать.');
      return;
    }

    const r = this.context.world.nearestResource(p.x, p.z, 2.3);

    if (r) {
      if (this.context.store.carried() >= this.context.store.capacity) {
        this.context.toast('Запасы в лапах переполнены. Сложи еду в тайник (K).');
        return;
      }

      this.context.world.harvest(r, this.context.save.clock);
      this.context.save.inventory[r.kind]++;

      if (r.kind === 'clover') this.context.save.materials.grass++;

      if (r.kind === 'berries' || r.kind === 'mushroom') this.context.save.materials.twigs++;

      this.context.sound.play('pickup');
      this.context.toast(
        `Собрано: ${FOOD[r.kind].label.toLowerCase()} ${FOOD[r.kind].emoji}${r.kind === 'clover' ? ' и трава' : r.kind === 'berries' || r.kind === 'mushroom' ? ' и ветки' : ''}`,
      );
      return;
    }

    this.context.toast('Рядом нет животного или еды.');
    return;
  }

  private openBag(): void {
    const items = (Object.keys(FOOD) as FoodKind[]).filter(
      (k) => this.context.save.inventory[k] > 0,
    );

    const materials = (['grass', 'twigs', 'fur'] as MaterialKind[]).filter(
      (k) => this.context.save.materials[k] > 0,
    );

    const stash = this.context.queries.stash();

    const stored = (Object.keys(FOOD) as FoodKind[]).filter((k) => (stash?.food[k] ?? 0) > 0);

    if (!items.length && !stored.length && !materials.length) {
      this.context.toast('Запасы пусты. Найди растения или ветки и нажми E.');
      return;
    }

    this.context.clearSelection();
    this.context.view.unlock();

    this.context.ui.showDialog({
      type: 'bag',
      inventory: this.context.save.inventory,
      materials: this.context.save.materials,
      stored: stash?.food ?? {},
    });
    return;
  }

  private transfer(action: string): void {
    const p = this.context.save.player;
    let stash = this.context.queries.stash();

    if (action === 'store' && !stash) {
      stash = {
        id: Math.max(0, ...this.context.save.stashes.map((s) => s.id)) + 1,
        x: p.x,
        y: p.y,
        z: p.z,
        food: {},
      };

      this.context.save.stashes.push(stash);
      this.context.addStash(stash);
    }

    if (!stash) {
      this.context.toast('Рядом нет тайника с припасами.');
      return;
    }

    const amount =
      action === 'store' ? this.context.store.deposit(stash) : this.context.store.withdraw(stash);

    this.context.toast(
      amount
        ? `${action === 'store' ? 'Сложено' : 'Взято'} ${amount} предметов.`
        : 'Сейчас нечего перекладывать.',
    );
    return;
  }
}
