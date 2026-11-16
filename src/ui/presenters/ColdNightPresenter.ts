import { coldNightGoalMet, companionGoal, type ColdNightPlan } from '../../game/ColdNightPlan';
import type { BurrowPlan } from '../../game/BurrowPlanner';
import type { ColdNightGoal } from '../../game/types';

const GOAL_LABEL: Record<ColdNightGoal, string> = { food: 'Собрать еду', fur: 'Собрать пух' };

interface PantryView {
  id: number;
  food: number;
  foodTarget: number;
  carriedFur: number;
  storedFur: number;
  furTarget: number;
  warm: boolean;
  ready: boolean;
  unavailable?: string;
  goals: { id: ColdNightGoal; label: string }[];
}

export type ColdNightView =
  | { active: false; pantries: PantryView[] }
  | {
      active: true;
      pantry: PantryView;
      goal: string;
      goalMet: boolean;
      helperGoal: string;
      helperWorking: boolean;
      helperNeeded: boolean;
      helperAvailable: boolean;
      local: boolean;
      marked: boolean;
    };

/** Переводит состояние подготовки и запасы кладовых в подписи плана норы. */
export class ColdNightPresenter {
  static build(outing: ColdNightPlan, plan?: BurrowPlan): ColdNightView {
    const selection = outing.active;
    if (selection) {
      const pantry = this.pantry(outing, selection.stashId);
      if (pantry) {
        const other = companionGoal(selection.goal);
        const helperNeeded = !coldNightGoalMet(pantry, other);
        return {
          active: true,
          pantry,
          goal: selection.goal === 'fur' ? 'Утеплить гнездо' : GOAL_LABEL.food,
          goalMet: selection.goal === 'fur' ? pantry.warm : coldNightGoalMet(pantry, 'food'),
          helperGoal: other === 'food' ? 'Поручить сбор еды' : 'Поручить сбор пуха',
          helperWorking: selection.helperId !== undefined && helperNeeded,
          helperNeeded,
          helperAvailable: outing.helperAvailable,
          local: plan?.stashes.some((stash) => stash.id === pantry.id) ?? false,
          marked: !!selection.waypoint,
        };
      }
    }

    const pantries = (plan?.stashes ?? []).flatMap(({ id }) => this.pantry(outing, id) ?? []);
    return { active: false, pantries };
  }

  private static pantry(outing: ColdNightPlan, id: number): PantryView | undefined {
    const stash = outing.pantry(id);
    const progress = stash && outing.progress(stash);
    if (!progress) return;

    const goals: PantryView['goals'] = [];
    if (!coldNightGoalMet(progress, 'food')) goals.push({ id: 'food', label: GOAL_LABEL.food });
    if (!progress.warm) {
      goals.push({
        id: 'fur',
        label: coldNightGoalMet(progress, 'fur') ? 'Утеплить гнездо' : GOAL_LABEL.fur,
      });
    }

    return {
      id,
      ...progress,
      ready: outing.ready(progress),
      unavailable: !progress.hasExit
        ? 'Прокопай выход на поверхность.'
        : !progress.hasNest
          ? 'Устрой гнездо в связанных ходах этой норы.'
          : undefined,
      goals,
    };
  }
}
