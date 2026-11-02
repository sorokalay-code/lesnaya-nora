import type { GameUI } from '../../ui/GameUI';
import type { RabbitActor } from '../animals';
import { CoatDirt } from '../CoatDirt';
import { setRabbitAction, type RabbitAction, type RabbitRig } from '../Models';
import type { SaveData } from '../types';
import type { FamilyLifecycle } from './FamilyLifecycle';

interface Context {
  save: SaveData;
  ui: GameUI;
  rabbits: RabbitActor[];
  family: FamilyLifecycle;
  elapsed: () => number;
  playAction: (action: RabbitAction, duration: number) => void;
  persist: () => void;
  toast: (text: string) => void;
}

/** Позволяет матери вычистить шерсть выбранного члена семьи при непосредственном контакте. */
export class FamilyGrooming {
  constructor(private readonly context: Context) {}

  execute(action: string): boolean {
    if (action !== 'mate-groom' && action !== 'child-groom') return false;
    const dialog = this.context.ui.state.dialog;
    if (action === 'mate-groom') {
      const partner = this.context.save.partners.find(
        (partner) => partner.id === this.context.save.mateId,
      );
      const rig = this.context.rabbits.find((actor) => actor.data.id === partner?.id)?.rig;
      if (partner && rig) {
        this.clean(partner, rig, partner.id);
        if (dialog?.type === 'mate') this.context.ui.showDialog({ ...dialog, partner });
      }
    } else if (dialog?.type === 'kit') {
      const child = this.context.save.kits.find(
        (child) => child.id === dialog.kit.id && child.alive,
      );
      const rig = child && this.context.family.rigs.get(child.id);
      if (child && rig) {
        this.clean(child, rig, child.id);
        this.context.ui.showDialog({ ...dialog, kit: child });
      }
    }
    return true;
  }

  private clean(data: { dirtiness?: number; name: string }, rig: RabbitRig, phase: number): void {
    const p = this.context.save.player;
    if (
      Math.hypot(rig.root.position.x - p.x, rig.root.position.y - p.y, rig.root.position.z - p.z) >
      3
    ) {
      this.context.toast('Подойди к члену семьи поближе, чтобы почистить шерсть.');
      return;
    }
    if ((data.dirtiness ?? 0) < 1) {
      this.context.toast(`${data.name}: шерсть уже чистая.`);
      return;
    }
    if (p.energy < 3) {
      this.context.toast('Для ухода нужно 3 единицы сил.');
      return;
    }
    data.dirtiness = 0;
    p.energy -= 3;
    CoatDirt.update(rig, 0);
    setRabbitAction(rig, 'groom', this.context.elapsed() + phase, 2);
    this.context.playAction('groom', 2);
    this.context.persist();
    this.context.toast(`Ты заботливо почистила шерсть: ${data.name}.`);
  }
}
