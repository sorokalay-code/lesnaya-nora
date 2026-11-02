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

interface Context {
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
    this.context.ui.setHud(
      this.hudPresenter.build(
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
      ),
    );
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

  persist(notify: boolean): void {
    this.context.save.harvested = this.context.world.resources
      .filter((r) => !r.available)
      .map((r) => r.id);
    try {
      this.context.saves.store(this.context.save);
      if (notify) {
        this.context.sound.play('save');
        this.context.toast('Игра сохранена в этом браузере.');
      }
    } catch {
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
