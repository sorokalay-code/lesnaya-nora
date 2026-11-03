import type { PlayerRabbit } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { Excavation } from '../Excavation';
import type { KitData, SaveData } from '../types';
import type { FamilyLifecycle } from './FamilyLifecycle';
import { RabbitFamily } from './RabbitFamily';

export interface SuccessionOffer {
  available: boolean;
  reason?: string;
}
interface Context {
  save: SaveData;
  player: PlayerRabbit;
  family: Pick<FamilyLifecycle, 'rigs' | 'remove' | 'add'>;
  earth: Pick<Excavation, 'isSheltered'>;
  safe: () => boolean;
  changed: (previousMate?: number) => void;
  toast: (text: string) => void;
}

/** Передаёт управление взрослой самке линии без пересоздания мира и сохраняет прежнюю крольчиху как NPC. */
export class LineageSuccession {
  constructor(private readonly context: Context) {}

  offer(kit: KitData): SuccessionOffer | undefined {
    if (kit.age < 3 || RabbitFamily.sex(kit) !== 'female') return;
    const p = this.context.save.player;
    let reason: string | undefined;
    if (!kit.alive || kit.health <= 0 || p.health <= 0) reason = 'Нужна живая взрослая крольчиха.';
    else if (this.context.save.pregnancy) reason = 'Сначала дождись родов текущей крольчихи.';
    else if (
      !this.context.safe() ||
      AnimalRestraint.active(this.context.player.root) ||
      AnimalRestraint.active(this.context.family.rigs.get(kit.id)?.root)
    )
      reason = 'Сначала выберись из ловушки и дождись приземления добычи сокола.';
    return { available: !reason, reason };
  }

  switchTo(id: number): boolean {
    const { save, player, family } = this.context;
    const index = save.kits.findIndex((k) => k.id === id);
    const kit = save.kits[index];
    if (!kit) return false;
    const offer = this.offer(kit);
    if (!offer?.available) {
      this.context.toast(offer?.reason ?? 'Продолжить линию можно за взрослую крольчиху.');
      return false;
    }

    const previous = structuredClone(save.player);
    const previousMate = save.mateId;
    const mother: KitData = {
      id: previous.originKitId ?? RabbitFamily.nextId(save),
      name: previous.name ?? 'Мама',
      sex: 'female',
      genes: previous.genes,
      lineage: previous.lineage,
      age: Math.max(3, previous.age),
      health: previous.health,
      hunger: previous.hunger,
      dirtiness: previous.dirtiness,
      alive: true,
      independent: true,
      father: '',
      homeX: previous.x,
      homeY: previous.y,
      homeZ: previous.z,
      x: previous.x,
      y: previous.y,
      z: previous.z,
      condition: {
        thirst: previous.thirst,
        bodyTemp: previous.bodyTemp,
        energy: previous.energy,
        bladder: previous.bladder,
        bowel: previous.bowel,
        poison: previous.poison,
        milk: previous.milk,
      },
    };
    const heading = family.rigs.get(id)?.root.rotation.y ?? player.root.rotation.y;
    family.remove(id);
    save.kits.splice(index, 1);
    save.kits.push(mother);
    Object.assign(save.player, {
      name: kit.name,
      originKitId: kit.id,
      lineage: kit.lineage,
      genes: kit.genes,
      x: kit.x ?? kit.homeX,
      y: kit.y ?? kit.homeY,
      z: kit.z ?? kit.homeZ,
      age: kit.age,
      health: kit.health,
      hunger: kit.hunger,
      dirtiness: kit.dirtiness ?? 0,
      thirst: 85,
      bodyTemp: 38.5,
      energy: 90,
      bladder: 15,
      bowel: 15,
      poison: 0,
      milk: 0,
      ...kit.condition,
    });
    save.player.hidden = this.context.earth.isSheltered(
      save.player.x,
      save.player.y,
      save.player.z,
    );
    player.refreshAppearance();
    player.root.rotation.set(0, heading, 0);
    family.add(mother);

    // Багаж принадлежит линии, а отношения пары — конкретной крольчихе. Груз бывшего партнёра не теряем.
    const cargo = save.partnerCargo;
    if (cargo) {
      if (cargo.food) save.inventory[cargo.food]++;
      for (const material of ['grass', 'twigs', 'fur'] as const)
        save.materials[material] += cargo[material];
    }
    save.mateId = undefined;
    save.mateCommand = undefined;
    save.mateStay = undefined;
    save.mateMessages = [];
    save.partnerCargo = undefined;
    this.context.changed(previousMate);
    this.context.toast(
      'История продолжается: теперь ты ' + kit.name + '. Создай свою семью и продолжи линию!',
    );
    return true;
  }
}
