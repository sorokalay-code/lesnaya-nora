import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import type { GroundItems } from '../GroundItems';
import type { WasteSystem } from '../systems';
import type { SaveData } from '../types';
import type { World } from '../World';
import type { AnimalSimulation } from './AnimalSimulation';
import type { FamilyLifecycle } from './FamilyLifecycle';
import type { SimulationState } from './SessionSimulation';
import { GAME_MINUTES_PER_SECOND, type WorldCalendar } from './WorldCalendar';

const ANIMAL_STEP_MINUTES = 3;
const ENVIRONMENT_REFRESH_MINUTES = 30;

interface Context {
  save: SaveData;
  state: Pick<SimulationState, 'elapsed'>;
  calendar: Pick<WorldCalendar, 'advance' | 'isNight'>;
  family: Pick<FamilyLifecycle, 'update' | 'advancePregnancy'>;
  animals: Pick<AnimalSimulation, 'update'>;
  world: Pick<World, 'update'>;
  items: Pick<GroundItems, 'update'>;
  waste: Pick<WasteSystem, 'update'>;
  earth: Pick<Excavation, 'isSheltered'>;
  lighting: { update: (night: boolean, sheltered: boolean) => void };
  sound: Pick<Soundscape, 'setWeather'>;
}

/** Прокручивает календарь и обитателей мира за время сна без ввода, рендера и атак на семью. */
export class WorldRest {
  constructor(private readonly context: Context) {}

  advance(minutes: number): void {
    const { save, state, calendar, family, animals, earth } = this.context;
    const p = save.player;
    p.hidden = earth.isSheltered(p.x, p.y, p.z);
    let nextEnvironmentRefresh = save.clock;
    let remaining = minutes;
    while (remaining > 0) {
      const step = Math.min(ANIMAL_STEP_MINUTES, remaining);
      const dt = step / GAME_MINUTES_PER_SECOND;
      const previousDay = save.day;
      remaining -= step;
      state.elapsed += dt;
      calendar.advance(dt);

      // Растения должны отрастать и во время сна, но обход всей растительности не нужен на каждом шаге ИИ.
      if (save.clock >= nextEnvironmentRefresh || save.day !== previousDay) {
        this.refreshWorld();
        nextEnvironmentRefresh = save.clock + ENVIRONMENT_REFRESH_MINUTES;
      }

      family.update(dt, state.elapsed, 'rest');
      animals.update(dt, state.elapsed, calendar.isNight(), 'rest');
    }

    // За один сон показываем одно событие беременности. Новорождённые не стареют задним числом.
    family.advancePregnancy(minutes);
    this.refreshWorld();
    const night = calendar.isNight();
    this.context.lighting.update(night, p.hidden);
    this.context.sound.setWeather(save.weather, night);
  }

  private refreshWorld(): void {
    const { save, state, world, waste, items } = this.context;
    const { x, y, z } = save.player;
    waste.update(0, x, y, z);
    items.update(save.clock);
    world.update(save.clock, state.elapsed, save.weather, save.day, x, z);
  }
}
