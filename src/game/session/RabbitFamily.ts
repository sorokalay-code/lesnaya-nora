import type { KitData, SaveData } from '../types';

export const FEMALE_KIT_NAMES = [
  'Искорка',
  'Лапка',
  'Ромашка',
  'Звёздочка',
  'Берёзка',
  'Снежка',
  'Брусничка',
  'Ива',
];
export const MALE_KIT_NAMES = [
  'Клевер',
  'Шорох',
  'Орешек',
  'Лучик',
  'Пушок',
  'Ветерок',
  'Туман',
  'Листик',
];

/** Определяет пол и родство внутри игровой линии; идентификатор игрока не переиспользуется при рождении. */
export class RabbitFamily {
  static sex(kit: KitData): 'female' | 'male' {
    return kit.sex ?? (FEMALE_KIT_NAMES.includes(kit.name) ? 'female' : 'male');
  }

  static nextId(save: SaveData): number {
    return Math.max(0, save.player.originKitId ?? 0, ...save.kits.map((k) => k.id)) + 1;
  }

  static relationship(save: SaveData, kit: KitData): string {
    const female = this.sex(kit) === 'female';
    const player = save.player.lineage;
    if (!player || !kit.lineage) return female ? 'Твоя дочь' : 'Твой сын';
    const parents = (line: NonNullable<KitData['lineage']>) =>
      line.ancestors.filter((a) => a.distance === 1);
    if (parents(kit.lineage).some((a) => a.id === player.id))
      return female ? 'Твоя дочь' : 'Твой сын';
    if (parents(player).some((a) => a.id === kit.lineage!.id))
      return female ? 'Твоя мать' : 'Твой отец';
    if (parents(kit.lineage).some((a) => parents(player).some((p) => p.id === a.id)))
      return female ? 'Твоя сестра' : 'Твой брат';
    return female ? 'Крольчиха твоей линии' : 'Кролик твоей линии';
  }
}
