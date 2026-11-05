import { GameUI } from '../../ui/GameUI';
import { HudPresenter } from '../../ui/presenters/HudPresenter';
import { MapPresenter } from '../../ui/presenters/MapPresenter';
import { Soundscape } from '../Audio';
import { Excavation } from '../Excavation';
import { GroundItems } from '../GroundItems';
import { SaveRepository } from '../SaveRepository';
import { ViewCamera } from '../ViewCamera';
import { World } from '../World';
import { FoodStore, SeasonSystem } from '../systems';
import { type SaveData } from '../types';
import { InteractionController } from './InteractionController';
import { SessionQueries } from './SessionQueries';
import { WorldCalendar } from './WorldCalendar';
import type { WebView } from './SpiderEncounter';

interface Context {
  canSave?: () => boolean;
  airliftView?: () => import('./HawkHunting').AirliftView | undefined;
  rabbitChaseView?: () => import('./RabbitReproductiveThreat').RabbitChaseView | undefined;
  webView?: () => WebView | undefined;
  captureWildlife?: () => void;
  save: SaveData;
  ui: GameUI;
  view: ViewCamera;
  world: World;
  earth: Excavation;
  store: FoodStore;
  seasons: SeasonSystem;
  calendar: WorldCalendar;
  queries: SessionQueries;
  items: GroundItems;
  sound: Soundscape;
  saves: SaveRepository;
  adventure: { id: string; name: string };
  interactions: InteractionController;
  toast: (text: string) => void;
}

/** Публикует HUD и карту, открывает дневник и сохраняет снимок текущего мира. */
export class SessionInterface {
  private readonly hudPresenter = new HudPresenter();
  private readonly mapPresenter = new MapPresenter();

  constructor(private readonly context: Context) {}

  updateHud(threat = Infinity): void {
    const p = this.context.save.player;
    const hud = this.hudPresenter.build(
      this.context.save,
      this.context.world,
      this.context.earth,
      this.context.view.isFirstPerson,
      this.context.store,
      this.context.seasons,
      this.context.calendar.airTemperature(),
      threat,
      this.context.queries.partner(),
      this.sheltered ? undefined : this.context.world.nearestResource(p.x, p.z, 2.3),
      this.context.queries.stash(),
      this.context.queries.kit(),
      this.context.queries.animal(),
      this.context.items.nearest(p.x, p.y, p.z),
      this.context.queries.nest(),
    );
    hud.web = this.context.webView?.();
    hud.airlift = this.context.airliftView?.();
    hud.rabbitChase = this.context.rabbitChaseView?.();
    if (hud.airlift) hud.prompt = [];
    if (hud.web) hud.prompt = [{ key: 'E', text: 'Многократно нажимай, чтобы вырваться' }];
    this.context.ui.setHud(hud);
  }

  toggleJournal(mode: string): void {
    if (this.context.ui.state.journal?.mode === mode) {
      this.context.interactions.close();
      return;
    }

    this.context.view.unlock();
    this.context.interactions.clearSelection();
    if (mode === 'map')
      this.context.ui.showJournal({
        mode: 'map',
        map: this.mapPresenter.build(this.context.world, this.context.save),
      });
    else
      this.context.ui.showJournal({
        mode: 'journal',
        save: this.context.save,
        season: this.context.calendar.season(),
      });
  }

  persist(notify: boolean, manual = false): void {
    if (this.context.canSave && !this.context.canSave()) {
      if (notify) {
        const message = 'Сохранение доступно после того, как сокол отпустит добычу.';
        this.context.ui.store.setState({ saveNotice: message });
        this.context.toast(message);
      }
      return;
    }
    this.context.captureWildlife?.();
    this.context.save.harvested = this.context.world.resources
      .filter((r) => !r.available)
      .map((r) => r.id);
    try {
      const manualSave = manual
        ? this.context.saves.storeManual(
            this.context.save,
            this.context.adventure.id,
            this.context.adventure.name,
          )
        : undefined;
      if (!manual)
        this.context.saves.storeAutosave(
          this.context.save,
          this.context.adventure.id,
          this.context.adventure.name,
        );
      this.context.ui.store.setState({
        saveSlots: this.context.saves.list(),
        legacySaveFound: this.context.saves.hasLegacySave(),
        saveLibraryError: undefined,
      });
      if (notify) {
        const message = manualSave
          ? `Создано «${manualSave.name}» · ${this.context.adventure.name}.`
          : `Автосохранение обновлено · ${this.context.adventure.name}.`;
        this.context.ui.store.setState({ saveNotice: message });
        this.context.sound.play('save');
        this.context.toast(message);
      }
    } catch {
      const message = 'Не удалось сохранить игру: хранилище заполнено или недоступно.';
      this.context.ui.store.setState({ saveLibraryError: message });
      if (notify) this.context.ui.store.setState({ saveNotice: message });
      if (notify) this.context.toast('Не удалось сохранить игру: хранилище браузера недоступно.');
    }
  }

  private get sheltered(): boolean {
    return (
      !!this.context.earth &&
      this.context.earth.isSheltered(
        this.context.save.player.x,
        this.context.save.player.y,
        this.context.save.player.z,
      )
    );
  }
}
