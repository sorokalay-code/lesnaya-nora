import type { GameUI } from '../../ui/GameUI';
import { isColdNightGoal, type ColdNightPlan } from '../ColdNightPlan';

interface Context {
  outing: ColdNightPlan;
  ui: Pick<GameUI, 'state'>;
  inspectBurrow: () => void;
  refreshMap: () => void;
  persist: () => void;
  toast: (text: string) => void;
}

/** Принимает команды подготовки из плана норы и команды отметки из карты. */
export class ColdNightActions {
  constructor(private readonly context: Context) {}

  execute(action: string): boolean {
    if (!action.startsWith('cold-night:')) return false;
    const { outing, ui } = this.context;
    const [, command, ...args] = action.split(':');

    if (command === 'mark' || command === 'clear-marker') {
      if (ui.state.journal?.mode !== 'map') return true;
      const [x, z] = args;
      const changed =
        command === 'clear-marker'
          ? outing.clearMarker()
          : args.length === 2 && !!x && !!z && outing.mark(Number(x), Number(z));
      if (changed) {
        this.context.refreshMap();
        this.context.persist();
      }
      return true;
    }

    if (ui.state.gameMenu !== 'burrow') return true;
    if (command === 'start') {
      const [stashId, goal] = args;
      const id = Number(stashId);
      if (args.length === 2 && Number.isSafeInteger(id) && id > 0 && isColdNightGoal(goal))
        this.apply(outing.start(id, goal));
    } else if (command === 'assign') this.apply(outing.assignHelper());
    else if (command === 'cancel') this.apply(outing.cancel());
    else if (command === 'finish') {
      this.apply(outing.finish(), 'Семья готова к холодной ночи. В норе есть тепло и припасы.');
    }

    return true;
  }

  private apply(changed: boolean, message?: string): void {
    if (changed) {
      if (message) this.context.toast(message);
      this.context.persist();
    }
    this.context.inspectBurrow();
  }
}
