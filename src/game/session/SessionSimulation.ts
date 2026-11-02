import * as THREE from 'three';
import { GameUI } from '../../ui/GameUI';
import { Soundscape } from '../Audio';
import { Excavation } from '../Excavation';
import { GroundItems } from '../GroundItems';
import { ModelAssets } from '../ModelAssets';
import { animateRabbit, type RabbitRig } from '../Models';
import { ViewCamera } from '../ViewCamera';
import { World } from '../World';
import { SurvivalSystem, WasteSystem } from '../systems';
import { type SaveData } from '../types';
import { AnimalSimulation } from './AnimalSimulation';
import { EnvironmentController } from './EnvironmentController';
import { FamilyLifecycle } from './FamilyLifecycle';
import { PlayerConsequences } from './PlayerConsequences';
import { PlayerMovement } from './PlayerMovement';
import { SceneLighting } from './SceneLighting';
import type { SessionInterface } from './SessionInterface';
import { SessionQueries } from './SessionQueries';
import { WorldCalendar } from './WorldCalendar';
export interface SimulationState {
  elapsed: number;
  digHeld: boolean;
}

interface Context {
  state: SimulationState;
  camera: THREE.PerspectiveCamera;
  environment: EnvironmentController;
  view: ViewCamera;
  save: SaveData;
  calendar: WorldCalendar;
  movement: PlayerMovement;
  ui: GameUI;
  queries: SessionQueries;
  survival: SurvivalSystem;
  consequences: PlayerConsequences;
  waste: WasteSystem;
  family: FamilyLifecycle;
  items: GroundItems;
  animals: AnimalSimulation;
  world: World;
  sound: Soundscape;
  player: RabbitRig;
  earth: Excavation;
  lighting: SceneLighting;
  sessionUI: SessionInterface;
  action: (command: string) => void;
  gameOver: () => void;
}

/** Задаёт порядок обновления систем сессии, ограничивает частоту HUD и автосохранения. */
export class SessionSimulation {
  private lastHud = 0;
  private autosaveAt = 0;

  constructor(private readonly context: Context) {}

  update(dt: number): void {
    ModelAssets.shared.updateView(this.context.camera);
    this.context.state.elapsed += dt;
    this.context.environment.update(dt);
    if (
      this.context.state.digHeld &&
      this.context.view.isFirstPerson &&
      this.context.state.elapsed >= this.context.environment.nextDigAt
    )
      this.context.action('dig');

    const p = this.context.save.player;
    this.context.calendar.advance(dt);

    const night = this.context.calendar.isNight();
    const moving = this.context.movement.move(
      dt,
      this.context.state.elapsed,
      this.context.ui.panelsOpen,
    );
    this.context.movement.settle(dt);
    p.hidden = this.sheltered;
    const air = this.context.calendar.airTemperature();
    const nearbyNest = this.context.queries.nest(2.8);
    const warmed = this.sheltered || nearbyNest !== undefined;
    this.context.survival.tick(dt, this.context.state.elapsed, moving, air, warmed, () =>
      this.context.consequences.makeWaste('diarrhea'),
    );
    this.context.waste.update(dt, p.x, p.y, p.z);
    if (p.health <= 0) {
      this.context.gameOver();
      return;
    }

    this.context.family.update(dt, this.context.state.elapsed);
    this.context.items.update(this.context.save.clock);
    const closestThreat = this.context.animals.update(dt, this.context.state.elapsed, night);
    this.context.world.update(
      this.context.save.clock,
      this.context.state.elapsed,
      this.context.save.weather,
      this.context.save.day,
      p.x,
      p.z,
    );
    this.context.world.updateRain(dt, p.x, p.z, this.context.save.weather);
    this.context.sound.update(this.context.state.elapsed, night);
    this.context.sound.setWeather(this.context.save.weather, night);
    this.context.player.root.position.x = p.x;
    this.context.player.root.position.z = p.z;
    this.context.player.root.userData.baseY = p.y;
    this.context.player.root.visible = !this.context.view.isFirstPerson;
    animateRabbit(
      this.context.player,
      this.context.state.elapsed,
      moving,
      closestThreat < 8 && !this.sheltered,
      dt,
    );
    this.context.earth.update(
      p.x,
      p.y,
      p.z,
      this.context.view.isFirstPerson
        ? this.context.earth.preview(this.context.camera, p.x, p.y, p.z)
        : undefined,
    );
    this.context.lighting.update(this.context.save, this.context.world, night, this.sheltered);

    if (this.context.state.elapsed - this.lastHud > 0.22) {
      this.lastHud = this.context.state.elapsed;
      this.context.sessionUI.updateHud(closestThreat);
    }

    if (this.context.state.elapsed > this.autosaveAt) {
      this.autosaveAt = this.context.state.elapsed + 30;
      this.context.sessionUI.persist(false);
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
