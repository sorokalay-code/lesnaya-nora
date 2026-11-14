import { BurrowPlanner, type BurrowNest } from '../../game/BurrowPlanner';
import type { BurrowMoisture } from '../../game/BurrowClimate';
import { NEST_ENTRANCE_MARGIN } from '../../game/BurrowSafety';
import type { Excavation } from '../../game/Excavation';
import { RELOCATION_DETAIL, type FamilyRelocation } from '../../game/session/FamilyRelocation';
import type { DigNode, SaveData } from '../../game/types';

interface BurrowMarker {
  position: DigNode;
  label: string;
  symbol: string;
}

const NEST_STATUS: Record<BurrowNest['placement'], string> = {
  sealed: 'Нет выхода на поверхность',
  exposed: 'У входа — малыши уязвимы',
  near: 'Есть укрытие, но вход близко',
  interior: 'В глубине ходов',
};

export type BurrowView =
  | { state: 'empty' | 'away' }
  | {
      state: 'burrow';
      length: number;
      depth: number;
      exitCount: number;
      food: number;
      steps: { complete: boolean; title: string; detail: string }[];
      map: {
        floors: readonly DigNode[];
        passages: readonly (readonly [number, number])[];
        moisture: readonly BurrowMoisture[];
        exits: BurrowMarker[];
        nests: BurrowMarker[];
        stashes: BurrowMarker[];
        player: DigNode;
      };
      nests: {
        id: number;
        status: string;
        warning: boolean;
        description: string;
        supplies: string;
        moisture: BurrowMoisture;
        relocation?: { available: boolean; detail: string };
      }[];
    };

/** Готовит снимок плана норы и объясняет обустройство без передачи игрового графа в React. */
export class BurrowPresenter {
  static build(
    save: SaveData,
    earth: Excavation,
    relocation?: Pick<FamilyRelocation, 'status'>,
  ): BurrowView {
    const plan = BurrowPlanner.inspect(save, earth);
    if (!plan) return { state: save.excavation.length ? 'away' : 'empty' };
    const exitCount = plan.network.exits.length;
    const food = plan.stashes.reduce((sum, stash) => sum + stash.food, 0);
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      state: 'burrow',
      length: round(plan.length),
      depth: round(plan.depth),
      exitCount,
      food,
      steps: [
        {
          complete: exitCount > 0,
          title: 'Выход на поверхность',
          detail: exitCount
            ? 'Нора соединена с поверхностью.'
            : 'Прокопай ход вверх до поверхности.',
        },
        {
          complete:
            plan.nests.length > 0 && plan.nests.every((nest) => nest.placement === 'interior'),
          title: 'Гнездо в глубине ходов',
          detail: `Размести гнездо хотя бы в ${NEST_ENTRANCE_MARGIN} м по ходу от каждого входа.`,
        },
        {
          complete: exitCount >= 2,
          title: 'Запасной выход',
          detail:
            'Отведи ветвь в сторону и копай вверх, подняв прицел. Выведи ход на поверхность вдали от первого устья: соседние отверстия считаются одним выходом.',
        },
        {
          complete: food > 0,
          title: 'Кладовая с припасами',
          detail: 'Устрой тайник в этой же норе и положи в него еду.',
        },
      ],
      map: {
        floors: plan.network.floors.map((point) => ({ ...point })),
        passages: plan.network.passages.map(([a, b]) => [a, b]),
        moisture: plan.network.floors.map((floor) => earth.moistureAt(floor)),
        exits: plan.network.exits.map((exit, index) => ({
          position: { ...plan.network.floors[exit[0]] },
          label: `Выход ${index + 1}`,
          symbol: `В${index + 1}`,
        })),
        nests: plan.nests.map((nest) => ({
          position: nest.position,
          label: nest.insulated ? `Тёплая спальня ${nest.id}` : `Гнездо ${nest.id}`,
          symbol: `Г${nest.id}`,
        })),
        stashes: plan.stashes.map((stash) => ({
          position: stash.position,
          label: `Тайник ${stash.id}`,
          symbol: `Т${stash.id}`,
        })),
        player: plan.player,
      },
      nests: plan.nests.map((nest) => ({
        id: nest.id,
        status: nest.insulated
          ? `Тёплая спальня · ${NEST_STATUS[nest.placement]}`
          : NEST_STATUS[nest.placement],
        warning: nest.placement !== 'interior',
        moisture: nest.moisture,
        relocation: this.relocationView(save, nest.id, relocation),
        description: Number.isFinite(nest.entranceDistance)
          ? `Глубина ${round(nest.depth)} м · до ближайшего входа ${round(nest.entranceDistance)} м по ходу.`
          : `Глубина ${round(nest.depth)} м · нет пути на поверхность.`,
        supplies:
          nest.stashDistance === undefined
            ? 'В этой норе пока нет кладовой.'
            : `До ближайшей кладовой ${round(nest.stashDistance)} м по ходу.`,
      })),
    };
  }

  private static relocationView(
    save: SaveData,
    id: number,
    relocation?: Pick<FamilyRelocation, 'status'>,
  ) {
    const nest = save.nests.find((item) => item.id === id);
    if (!relocation || !nest) return;
    const status = relocation.status(nest);
    if (status === 'empty') return;
    return { available: status === 'ready', detail: RELOCATION_DETAIL[status] };
  }
}
