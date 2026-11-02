import { GameUI } from '../../ui/GameUI';
import { Soundscape } from '../Audio';
import { type MateCommand, type SaveData } from '../types';
import { ViewCamera } from '../ViewCamera';
import { EnvironmentController } from './EnvironmentController';
import { FamilyLifecycle } from './FamilyLifecycle';
import { InteractionController } from './InteractionController';
import { InventoryController } from './InventoryController';
import { SessionQueries } from './SessionQueries';

interface Context {
  sound: Soundscape;
  save: SaveData;
  ui: GameUI;
  view: ViewCamera;
  interactions: InteractionController;
  family: FamilyLifecycle;
  inventory: InventoryController;
  environment: EnvironmentController;
  queries: SessionQueries;
  controls: { visible: boolean };
  resetDig: () => void;
  persist: (notify: boolean) => void;
  toast: (message: string) => void;
  toggleJournal: (mode: string) => void;
}

/** Маршрутизирует команды UI и устройств к предметным сервисам текущей сессии. */
export class SessionActions {
  constructor(private readonly context: Context) {}

  execute(action: string): void {
    this.context.sound.unlock();
    if (action === 'save') {
      this.context.persist(true);
      return;
    }

    if (action === 'sound') {
      this.context.sound.muted = !this.context.sound.muted;
      this.context.toast(this.context.sound.muted ? 'Звук выключен' : 'Звук включён');
      return;
    }

    if (action === 'self-profile') {
      this.context.view.unlock();
      this.context.ui.closeJournal();
      this.context.ui.showDialog({
        type: 'self',
        player: this.context.save.player,
        pregnant: !!this.context.save.pregnancy,
      });
      return;
    }

    if (action === 'mate-panel') {
      this.context.interactions.openMatePanel();
      return;
    }

    if (action === 'mate-talk') {
      const mate = this.context.save.partners.find((p) => p.id === this.context.save.mateId);
      if (mate) this.context.interactions.openPartner(mate);
      return;
    }

    if (action === 'mate-send') {
      this.context.interactions.sendMateMessage();
      return;
    }

    if (action.startsWith('mate-command:')) {
      this.context.interactions.commandMate(action.slice(13) as MateCommand);
      return;
    }

    if (action === 'camera') {
      const mode = this.context.view.toggleMode();
      this.context.resetDig();
      this.context.ui.setCamera(this.context.view.isFirstPerson);
      this.context.toast(
        mode === 'first'
          ? this.context.ui.state.touch
            ? 'Вид от первого лица: удерживай кнопку копания.'
            : 'Вид от первого лица: теперь можно копать ЛКМ.'
          : 'Вид от третьего лица. Для копания нажми B.',
      );
      return;
    }

    if (action === 'settings') {
      this.context.view.unlock();
      this.context.ui.toggleSettings();
      return;
    }

    if (action === 'toggle-controls') {
      this.context.controls.visible = !this.context.controls.visible;
      localStorage.setItem('lesnaya-nora-show-controls', String(this.context.controls.visible));
      this.context.ui.setControls(this.context.controls.visible);
      return;
    }

    if (action === 'journal' || action === 'map') {
      this.context.toggleJournal(action);
      return;
    }

    if (action === 'close') {
      this.context.interactions.close();
      return;
    }

    if (
      [
        'talk',
        'gift',
        'court',
        'divorce',
        'ask-food',
        'ask-home',
        'ask-danger',
        'compliment',
      ].includes(action)
    ) {
      this.context.interactions.partnerAction(action);
      return;
    }

    if (['child-follow', 'child-stay', 'child-rest'].includes(action)) {
      this.context.interactions.childAction(action);
      return;
    }

    if (['animal-observe', 'animal-food', 'animal-path'].includes(action)) {
      this.context.interactions.animalAction(action);
      return;
    }

    if (this.context.ui.state.overlay) return;

    if (action === 'feed') {
      this.context.family.feed();
      return;
    }

    if (action === 'feed-vegetables') {
      this.context.family.feed(true);
      return;
    }

    if (action === 'interact') {
      if (this.context.ui.state.dialog) {
        this.context.interactions.close();
        return;
      }

      const kit = this.context.queries.kit();
      if (kit) {
        this.context.interactions.openKit(kit);
        return;
      }

      const partner = this.context.queries.partner();
      if (partner) {
        this.context.interactions.openPartner(partner);
        return;
      }

      const animal = this.context.queries.animal();
      if (animal) {
        this.context.interactions.openAnimal(animal);
        return;
      }

      this.context.inventory.collect();
      return;
    }

    if (this.context.inventory.execute(action)) return;

    this.context.environment.execute(action);
  }
}
