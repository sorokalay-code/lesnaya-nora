import type { Excavation } from '../Excavation';
import type { KitData, NestData, SaveData } from '../types';

export type RelocationStatus = 'ready' | 'home' | 'empty' | 'too-young' | 'held' | 'no-route';

const RELOCATION_AGE_DAYS = 0.7;

export const RELOCATION_DETAIL: Record<RelocationStatus, string> = {
  ready: 'После выхода из плана малыши дойдут сюда по ходам и останутся отдыхать.',
  home: 'Семейное гнездо',
  empty: 'Переселять пока некого.',
  'too-young': 'Дождись, когда самым маленьким исполнится 0,7 дня.',
  held: 'Сначала освободи схваченного крольчонка.',
  'no-route': 'Для переселения все малыши должны находиться в связанных подземных ходах.',
};

/** Переназначает дом всего выводка после общей проверки возраста и подземных маршрутов. */
export class FamilyRelocation {
  constructor(
    private readonly save: SaveData,
    private readonly earth: Excavation,
    private readonly isHeld: (kit: KitData) => boolean,
  ) {}

  status(nest: NestData): RelocationStatus {
    return this.prepare(nest, this.young());
  }

  move(nestId: number): RelocationStatus {
    const nest = this.save.nests.find((item) => item.id === nestId);
    if (!nest) return 'no-route';

    const kits = this.young();
    const status = this.prepare(nest, kits);
    if (status !== 'ready') return status;

    for (const kit of kits) {
      kit.x ??= kit.homeX;
      kit.y ??= kit.homeY;
      kit.z ??= kit.homeZ;
      kit.homeX = nest.x;
      kit.homeY = nest.y;
      kit.homeZ = nest.z;
      kit.nestId = nest.id;
      kit.command = 'relocate';
    }
    return 'ready';
  }

  private young(): KitData[] {
    return this.save.kits.filter(
      (kit) => kit.alive && kit.health > 0 && kit.age < 3 && !kit.independent,
    );
  }

  private prepare(nest: NestData, kits: KitData[]): RelocationStatus {
    if (!kits.length) return 'empty';
    if (kits.every((kit) => kit.nestId === nest.id)) return 'home';
    if (kits.some((kit) => kit.age < RELOCATION_AGE_DAYS)) return 'too-young';
    if (kits.some(this.isHeld)) return 'held';

    const network = this.earth.burrowAt(this.save.player)?.network;
    if (
      !network ||
      !this.earth.isSheltered(nest.x, nest.y, nest.z) ||
      this.earth.burrowAt(nest)?.network !== network
    )
      return 'no-route';

    for (const kit of kits) {
      const origin = { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ };
      if (
        !this.earth.isSheltered(origin.x, origin.y, origin.z) ||
        this.earth.burrowAt(origin)?.network !== network
      )
        return 'no-route';

      const route = this.earth.route(origin, nest);
      if (!route.length || route.some(({ x, y, z }) => !this.earth.isSheltered(x, y, z)))
        return 'no-route';
    }
    return 'ready';
  }
}
