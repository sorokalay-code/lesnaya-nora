import type { GameUI } from '../../ui/GameUI';
import type { NestData, SaveData, StashData } from '../types';
import type { SceneDecorations } from './SceneDecorations';
import type { SessionQueries } from './SessionQueries';

export function stashItemCount(stash: StashData): number {
  return (
    Object.values(stash.food).reduce((sum, count) => sum + (count ?? 0), 0) +
    Object.values(stash.materials ?? {}).reduce((sum, count) => sum + count, 0)
  );
}

export function nestHasKits(save: SaveData, nest: NestData): boolean {
  return save.kits.some(
    (kit) =>
      kit.alive &&
      !kit.independent &&
      kit.age < 3 &&
      kit.nestId === nest.id &&
      (kit.command === 'relocate' ||
        Math.hypot(
          (kit.x ?? kit.homeX) - nest.x,
          (kit.y ?? kit.homeY) - nest.y,
          (kit.z ?? kit.homeZ) - nest.z,
        ) < 2.5),
  );
}

interface Context {
  save: SaveData;
  queries: Pick<SessionQueries, 'stash' | 'nest'>;
  decorations: Pick<SceneDecorations, 'removeStash' | 'removeNest'>;
  ui: Pick<GameUI, 'showDialog'>;
  menu: () => void;
  persist: () => void;
  toast: (text: string) => void;
}

/** Разбирает ближайшие объекты только после подтверждения и повторной проверки расстояния. */
export class ShelterController {
  private pending?: { kind: 'stash' | 'nest'; id: number };

  constructor(private readonly context: Context) {}

  execute(action: string): boolean {
    if (action === 'remove-stash' || action === 'remove-nest')
      this.request(action === 'remove-stash' ? 'stash' : 'nest');
    else if (action === 'confirm-remove') this.confirm();
    else if (action === 'cancel-remove') {
      this.pending = undefined;
      this.context.menu();
    } else return false;
    return true;
  }

  private request(kind: 'stash' | 'nest'): void {
    const object = kind === 'stash' ? this.context.queries.stash() : this.context.queries.nest();
    this.pending = undefined;
    if (!object) {
      this.context.toast('Подойди ближе к нужному складу или гнезду.');
      return;
    }
    if (kind === 'nest' && nestHasKits(this.context.save, object as NestData)) {
      this.context.toast('Малыши в гнезде или идут к нему. Позови их за собой либо пересели.');
      return;
    }
    this.pending = { kind, id: object.id };
    this.context.ui.showDialog({
      type: 'remove',
      kind,
      items: kind === 'stash' ? stashItemCount(object as StashData) : 0,
    });
  }

  private confirm(): void {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    const object =
      pending.kind === 'stash' ? this.context.queries.stash() : this.context.queries.nest();
    if (!object || object.id !== pending.id) {
      this.context.menu();
      this.context.toast('Объект больше не рядом. Ничего не удалено.');
      return;
    }
    if (pending.kind === 'nest') {
      if (nestHasKits(this.context.save, object as NestData)) {
        this.context.menu();
        this.context.toast('Сначала уведи малышей из гнезда.');
        return;
      }
      const index = this.context.save.nests.findIndex((n) => n.id === pending.id);
      if (index < 0) return;
      this.context.save.nests.splice(index, 1);
      this.context.decorations.removeNest(pending.id);
      for (const kit of this.context.save.kits)
        if (kit.nestId === pending.id) {
          kit.nestId = undefined;
          kit.homeX = kit.x ?? kit.homeX;
          kit.homeY = kit.y ?? kit.homeY;
          kit.homeZ = kit.z ?? kit.homeZ;
          if (kit.command === 'rest' || kit.command === 'relocate') {
            kit.command = 'stay';
            kit.stayX = kit.homeX;
            kit.stayY = kit.homeY;
            kit.stayZ = kit.homeZ;
          }
        }
    } else {
      const index = this.context.save.stashes.findIndex((s) => s.id === pending.id);
      if (index < 0) return;
      this.context.save.stashes.splice(index, 1);
      this.context.decorations.removeStash(pending.id);
    }
    this.context.persist();
    this.context.menu();
    this.context.toast(pending.kind === 'stash' ? 'Склад разобран.' : 'Гнездо разобрано.');
  }
}
