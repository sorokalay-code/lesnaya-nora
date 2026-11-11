import type { ShelterController } from './ShelterController';
import { GameUI } from '../../ui/GameUI';
import { Soundscape } from '../Audio';
import { type MateCommand, type SaveData } from '../types';
import { ViewCamera } from '../ViewCamera';
import { EnvironmentController } from './EnvironmentController';
import { FamilyLifecycle } from './FamilyLifecycle';
import { InteractionController } from './InteractionController';
import { InventoryController } from './InventoryController';
import { SessionQueries } from './SessionQueries';
import type { FamilyGrooming } from './FamilyGrooming';
import type { SpiderEncounter } from './SpiderEncounter';
import { GeneticsPresenter } from '../../ui/presenters/GeneticsPresenter';
import { SessionMenus } from './SessionMenus';

interface Context {
  restrained?: () => boolean;
  web: SpiderEncounter;
  grooming: FamilyGrooming;
  shelters: ShelterController;
  resetInput: () => void;
  refreshHud: () => void;
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
  persist: (notify: boolean, manual?: boolean) => void;
  toast: (message: string) => void;
  toggleJournal: (mode: string) => void;
  inspectBurrow: () => void;
}

/** Маршрутизирует команды UI и устройств к предметным сервисам текущей сессии. */
export class SessionActions {
  private readonly menus: SessionMenus;

  constructor(private readonly context: Context) {
    this.menus = new SessionMenus(context);
  }

  showMenu(): void {
    this.menus.showGame();
  }

  execute(action: string): void {
    if (
      this.context.restrained?.() &&
      ![
        'menu',
        'resume',
        'close',
        'menu-back',
        'settings',
        'graphics-menu',
        'controls-help',
        'new-game-menu',
        'save',
        'sound',
        'toggle-controls',
        'status-panel',
        'self-profile',
        'journal',
        'map',
        'burrow-plan',
        'events-panel',
        'camera',
      ].includes(action)
    )
      return;
    if (
      action === 'struggle' ||
      (action === 'interact' && this.context.web.trapped && !this.context.ui.panelsOpen)
    ) {
      if (!this.context.ui.panelsOpen) {
        this.context.web.struggle();
        this.context.refreshHud();
      }
      return;
    }
    if (this.context.web.trapped && ['dig', 'dig-down', 'hop'].includes(action)) return;
    if (action === 'status-panel') {
      const expanded = this.context.ui.state.statusOpen;
      if (this.context.ui.panelsOpen) this.context.interactions.close();
      this.context.ui.store.setState({ statusOpen: !expanded });
      return;
    }
    if (action === 'close' && this.context.ui.state.dialog?.type === 'remove')
      action = 'cancel-remove';
    if (action === 'burrow-plan') {
      this.menus.showGame('burrow');
      this.context.inspectBurrow();
      return;
    }
    if (this.menus.execute(action)) return;
    if (action.startsWith('dialog-page:') || action === 'dialog-back') {
      this.context.ui.openDialogPage(action === 'dialog-back' ? 'overview' : action.slice(12));
      return;
    }
    const fromMenu = this.context.ui.state.actionMenuOpen;
    if (fromMenu) this.context.ui.closePanels();
    try {
      this.route(action);
    } finally {
      if (fromMenu && !this.context.ui.panelsOpen && !this.context.ui.state.overlay)
        this.context.interactions.close();
    }
  }

  private route(action: string): void {
    if (action.startsWith('family-member:')) {
      const kit = this.context.save.kits.find(
        (k) => k.id === Number(action.slice(14)) && k.alive && k.health > 0,
      );
      if (kit) {
        this.context.ui.closePanels();
        this.context.interactions.openKit(kit);
      }
      return;
    }
    if (action === 'lineage-switch') {
      this.context.interactions.continueLineage();
      return;
    }
    if (this.context.grooming.execute(action)) return;
    this.context.sound.unlock();
    if (this.context.shelters.execute(action)) return;
    if (action === 'save') {
      this.context.persist(true, true);
      return;
    }

    if (action === 'sound') {
      this.context.sound.muted = !this.context.sound.muted;
      this.context.ui.store.setState({ soundMuted: this.context.sound.muted });
      this.context.toast(this.context.sound.muted ? 'Звук выключен' : 'Звук включён');
      return;
    }

    if (action === 'self-profile') {
      this.context.view.unlock();
      this.context.ui.closeJournal();
      this.context.ui.showDialog({
        type: 'self',
        genetics: GeneticsPresenter.build(
          this.context.save.player.genes,
          this.context.save.player.lineage,
        ),
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

    if (action === 'family-panel') {
      const wasOpen = this.context.ui.state.familyOpen;
      this.context.view.unlock();
      this.context.ui.closePanels();
      if (wasOpen) {
        this.context.interactions.close();
        return;
      }
      this.context.ui.store.setState({ familyOpen: true });
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
        'rabbit-question',
        'rabbit-answer-care',
        'rabbit-answer-risk',
        'rabbit-answer-listen',
      ].includes(action)
    ) {
      this.context.interactions.partnerAction(action);
      return;
    }

    if (
      ['child-follow', 'child-stay', 'child-rest', 'child-news', 'child-family'].includes(action)
    ) {
      this.context.interactions.childAction(action);
      return;
    }

    if (
      [
        'animal-observe',
        'animal-food',
        'animal-path',
        'animal-question',
        'animal-answer-quiet',
        'animal-answer-rush',
        'animal-answer-later',
        'animal-help',
        'animal-danger',
        'animal-friend-family',
        'animal-friend-story',
        'animal-friend-escort',
      ].includes(action)
    ) {
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

    if (this.context.environment.execute(action) && action === 'sleep') this.context.refreshHud();
  }
}
