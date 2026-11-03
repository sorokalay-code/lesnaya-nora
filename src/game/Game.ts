import { PartnerCare } from './PartnerCare';
import { ShelterController } from './session/ShelterController';
import { FullscreenController } from './input/FullscreenController';
import * as THREE from 'three';
import { GameUI } from '../ui/GameUI';
import { Soundscape } from './Audio';
import { AttackSounds } from './audio/AttackSounds';
import { AnimalRestraint } from './animals/AnimalRestraint';
import { LineageSuccession } from './session/LineageSuccession';
import { Excavation } from './Excavation';
import { ExcavationTraffic } from './ExcavationTraffic';
import { FamilyCare } from './FamilyCare';
import { GroundItems } from './GroundItems';
import { ModelAssets } from './ModelAssets';
import { setRabbitAction, type RabbitAction, type RabbitRig } from './Models';
import { PartnerSupport } from './PartnerSupport';
import { PerformanceMonitor } from './PerformanceMonitor';
import { Random } from './Random';
import { SaveRepository } from './SaveRepository';
import { ViewCamera } from './ViewCamera';
import { WildlifeEcology } from './WildlifeEcology';
import { World } from './World';
import type { ForestAnimal } from './animals';
import { FamilyMember, Hawk, PlayerRabbit, Predator, RabbitActor, RabbitFactory } from './animals';
import { DesktopInput, type InputContext } from './input/DesktopInput';
import { GameInputController } from './input/GameInputController';
import { MobileInput } from './input/MobileInput';
import { AnimalCollisionSystem } from './session/AnimalCollisionSystem';
import { AnimalSimulation, type AnimalState } from './session/AnimalSimulation';
import { AnimalWasteSystem } from './session/AnimalWasteSystem';
import { EventJournal } from './EventJournal';
import { FamilyGrooming } from './session/FamilyGrooming';
import { SpiderEncounter } from './session/SpiderEncounter';
import { Spider } from './animals/Spider';
import { EnvironmentController } from './session/EnvironmentController';
import { FamilyLifecycle } from './session/FamilyLifecycle';
import { InteractionController } from './session/InteractionController';
import { InventoryController } from './session/InventoryController';
import { NewGameFactory } from './session/NewGameFactory';
import { PlayerConsequences } from './session/PlayerConsequences';
import { PlayerMovement } from './session/PlayerMovement';
import { SceneDecorations } from './session/SceneDecorations';
import { SceneLighting } from './session/SceneLighting';
import { SessionActions } from './session/SessionActions';
import { SessionInterface } from './session/SessionInterface';
import { SessionQueries } from './session/SessionQueries';
import { SessionSimulation, type SimulationState } from './session/SessionSimulation';
import { WorldCalendar } from './session/WorldCalendar';
import { WorldPopulation } from './session/WorldPopulation';
import { FoodStore, SeasonSystem, SurvivalSystem, WasteSystem } from './systems';
import { type SaveData } from './types';

/** Координатор сессии: создаёт системы, выполняет игровой цикл и связывает ввод с командами. */
export class Game {
  private attackSounds?: AttackSounds;
  private web!: SpiderEncounter;
  private sessionUI!: SessionInterface;
  private simulation!: SessionSimulation;
  private calendar!: WorldCalendar;
  private consequences!: PlayerConsequences;
  private decorations!: SceneDecorations;
  private animals!: AnimalSimulation;
  private shelters!: ShelterController;
  private actions!: SessionActions;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 350);
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly lighting = new SceneLighting(this.scene, this.camera);
  private view: ViewCamera;
  private ui!: GameUI;
  private sound = new Soundscape();
  private saves = new SaveRepository();
  private seasons!: SeasonSystem;
  private survival!: SurvivalSystem;
  private waste!: WasteSystem;
  private store!: FoodStore;
  private care!: FamilyCare;
  private family!: FamilyLifecycle;
  private interactions!: InteractionController;
  private queries!: SessionQueries;
  private inventory!: InventoryController;
  private environment!: EnvironmentController;
  private items!: GroundItems;
  private partnerSupport!: PartnerSupport;
  private collisions!: AnimalCollisionSystem;
  private performanceMonitor!: PerformanceMonitor;
  private fullscreen!: FullscreenController;
  private input!: GameInputController;
  private rng!: Random;
  private factory!: RabbitFactory;
  private world!: World;
  private player!: RabbitRig;
  private playerActor!: PlayerRabbit;
  private save!: SaveData;
  private rabbits: RabbitActor[] = [];
  private families: FamilyMember[] = [];
  private predators: Predator[] = [];
  private wildlife: ForestAnimal[] = [];
  private ecology!: WildlifeEcology;
  private hawks: Hawk[] = [];
  private traffic!: ExcavationTraffic;
  private earth!: Excavation;
  private keys = new Set<string>();
  private readonly runtime: SimulationState = { elapsed: 0, digHeld: false };
  private lastFrame = 0;
  private movement!: PlayerMovement;
  private running = false;
  private readonly animalState: AnimalState = {};
  private readonly controls = { visible: true };
  private readonly groundAt = (x: number, z: number) => this.world.heightAt(x, z);

  constructor(private readonly app: HTMLElement) {
    this.view = new ViewCamera(this.camera, this.renderer.domElement);
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.1 : 1.45),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.tabIndex = -1;
    this.app.append(this.renderer.domElement);
    this.buildUi();
    this.fullscreen = new FullscreenController(this.app, this.ui);
    this.bind();
    this.resize();
    this.performanceMonitor = new PerformanceMonitor(this.ui.publishPerformance);
    this.showStart();
    requestAnimationFrame(this.frame);
  }

  private buildUi(): void {
    this.ui = new GameUI(this.app, (action) => this.action(action));
    this.controls.visible = localStorage.getItem('lesnaya-nora-show-controls') !== 'false';
    this.ui.setControls(this.controls.visible);
    this.syncCameraUi();
  }

  private bind(): void {
    const context: InputContext = {
      canvas: this.renderer.domElement,
      view: this.view,
      ui: this.ui,
      keys: this.keys,
      action: (action) => this.action(action),
      resize: () => this.resize(),
      running: () => this.running,
      closePanels: () => this.interactions.close(),
      setDigHeld: (held) => {
        this.runtime.digHeld = held;
      },
    };
    this.input = new GameInputController([
      new DesktopInput(context),
      new MobileInput(context.canvas, context.view, context.ui, context.keys, context.setDigHeld),
    ]);
  }

  private syncCameraUi(): void {
    this.ui.setCamera(this.view.isFirstPerson);
  }

  private resize(): void {
    const w = this.app.clientWidth,
      h = this.app.clientHeight;
    this.view.resize(w, h);
    this.renderer.setSize(w, h);
  }

  private showStart(): void {
    this.ui.showOverlay({ type: 'start', hasSave: this.saves.exists() });
  }

  private async newGame(): Promise<void> {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const seasonIndex = this.ui.state.startSeason;
    this.rng = new Random(seed + 53);
    this.factory = new RabbitFactory(this.rng);
    this.ui.showOverlay({ type: 'loading', title: 'Готовим лес…' });
    try {
      await ModelAssets.shared.preload();
    } catch {
      this.showStart();
      this.toast('Не удалось загрузить 3D-модели. Обнови страницу и попробуй снова.');
      return;
    }

    this.save = NewGameFactory.create(seed, seasonIndex, this.factory);
    this.setupWorld();
    this.ui.showOverlay();
    this.running = true;
    this.sound.unlock();
    this.view.lock();
    this.toast('Исследуй лес, копай землю лапами и найди партнёра.');
  }

  private async loadGame(): Promise<void> {
    try {
      this.save = this.saves.load();
      this.ui.showOverlay({ type: 'loading', title: 'Возвращаемся домой…' });
      await ModelAssets.shared.preload();
      this.rng = new Random(this.save.seed + 53);
      this.factory = new RabbitFactory(this.rng);
      this.setupWorld();
      this.ui.showOverlay();
      this.running = true;
      this.sound.unlock();
      this.view.lock();
      this.toast('История продолжена. Добро пожаловать домой!');
    } catch (err) {
      this.showStart();
      this.toast(err instanceof Error ? err.message : 'Не удалось загрузить игру');
    }
  }

  private setupWorld(): void {
    this.ui.setEvents(this.save.messages);
    this.ui.store.setState({ saveNotice: undefined });
    this.attackSounds?.dispose();
    ModelAssets.shared.release(this.scene);
    this.scene.clear();
    this.lighting.reset();
    this.world = new World(this.scene, this.save.seed, this.save);
    this.world.setRain();
    this.seasons = new SeasonSystem(this.save.seed);
    this.survival = new SurvivalSystem(this.save, this.rng);
    this.store = new FoodStore(this.save);
    this.traffic = new ExcavationTraffic(this.rng);
    for (const id of this.save.harvested) {
      const r = this.world.resources[id];
      if (r) {
        r.available = false;
        r.mesh.visible = false;
        r.regrowAt = this.save.clock + 60;
      }
    }

    this.earth = new Excavation(this.scene, this.world, this.save);
    this.decorations = new SceneDecorations({
      scene: this.scene,
      world: this.world,
      earth: this.earth,
    });
    this.calendar = new WorldCalendar({
      save: this.save,
      world: this.world,
      seasons: this.seasons,
      rng: this.rng,
      toast: (text) => this.toast(text),
    });
    this.care = new FamilyCare(this.save, this.earth);
    this.items = new GroundItems(this.world, this.save);
    this.family = new FamilyLifecycle({
      save: this.save,
      scene: this.scene,
      world: this.world,
      earth: this.earth,
      care: this.care,
      rng: this.rng,
      genetics: this.factory,
      sound: this.sound,
      temperature: () => this.calendar.airTemperature(),
      toast: (text) => this.toast(text),
      persist: () => this.sessionUI.persist(false),
      playAction: (action, duration) => this.playAction(action, duration),
    });
    this.waste = new WasteSystem(
      this.scene,
      this.save,
      (w) => this.earth.floorAt(w.x, w.z, w.y),
      (w) => {
        if (!this.earth.isSheltered(w.x, w.y, w.z)) this.world.fertilize(w.x, w.z, this.save.clock);
      },
    );
    this.partnerSupport = new PartnerSupport(
      this.save,
      this.world,
      this.earth,
      this.items,
      new Random(this.save.seed + 6631),
      new PartnerCare(
        {
          save: this.save,
          earth: this.earth,
          waste: this.waste,
          rigs: this.family.rigs,
          toast: (text) => this.toast(text),
        },
        new Random(this.save.seed + 7593),
      ),
    );
    this.consequences = new PlayerConsequences({
      save: this.save,
      world: this.world,
      earth: this.earth,
      waste: this.waste,
      sound: this.sound,
      toast: (text) => this.toast(text),
    });
    this.playerActor = new PlayerRabbit(this.save.player);
    this.player = this.playerActor.rig;
    this.movement = new PlayerMovement(
      this.playerActor,
      this.keys,
      this.view,
      this.earth,
      this.sound,
      (x, z, y, heading) => this.collisions.canPlayerMove(x, z, y, heading),
      this.world,
    );
    this.scene.add(this.player.root);
    const population = new WorldPopulation({
      scene: this.scene,
      world: this.world,
      save: this.save,
      rng: this.rng,
      markPartner: (actor, active) => this.decorations.markPartner(actor, active),
    });
    this.rabbits = population.rabbits;
    this.families = population.families;
    this.predators = population.predators;
    this.ecology = population.ecology;
    this.wildlife = population.wildlife;
    this.hawks = population.hawks;
    this.attackSounds = new AttackSounds({
      sound: this.sound,
      listener: () => this.save.player,
      facing: () => this.view.forwardAt(),
      combatAllowed: () => !this.ui.conversationOpen,
      elapsed: () => this.runtime.elapsed,
    });
    this.attackSounds.bind([...this.predators, ...this.hawks]);
    this.web = new SpiderEncounter({
      scene: this.scene,
      save: this.save,
      world: this.world,
      spiders: this.predators.filter((predator): predator is Spider => predator instanceof Spider),
      player: this.player,
      toast: (text) => this.toast(text),
    });

    this.save.nests.forEach((n) => this.decorations.addNest(n));
    this.save.stashes.forEach((s) => this.decorations.addStash(s));
    this.save.kits.filter((k) => k.alive).forEach((k) => this.family.add(k));
    this.queries = new SessionQueries({
      save: this.save,
      world: this.world,
      earth: this.earth,
      rabbits: this.rabbits,
      wildlife: this.wildlife,
      family: this.family,
    });
    this.inventory = new InventoryController({
      save: this.save,
      world: this.world,
      earth: this.earth,
      view: this.view,
      items: this.items,
      store: this.store,
      survival: this.survival,
      sound: this.sound,
      ui: this.ui,
      queries: this.queries,
      toast: (text) => this.toast(text),
      playAction: (action, duration) => this.playAction(action, duration),
      addStash: (stash) => this.decorations.addStash(stash),
      clearSelection: () => this.interactions.clearSelection(),
      closePanels: () => this.interactions.close(),
    });
    this.environment = new EnvironmentController({
      waste: this.waste,
      persist: () => this.sessionUI.persist(false),
      save: this.save,
      world: this.world,
      earth: this.earth,
      view: this.view,
      camera: this.camera,
      sound: this.sound,
      player: this.player,
      store: this.store,
      survival: this.survival,
      care: this.care,
      family: this.family,
      queries: this.queries,
      elapsed: () => this.runtime.elapsed,
      toast: (text) => this.toast(text),
      playAction: (action, duration) => this.playAction(action, duration),
      requestJump: () => !this.web.trapped && this.movement.requestJump(this.runtime.elapsed),
      addNest: (nest) => this.decorations.addNest(nest),
      makeWaste: (kind) => this.consequences.makeWaste(kind),
    });
    this.interactions = new InteractionController({
      succession: new LineageSuccession({
        save: this.save,
        player: this.playerActor,
        family: this.family,
        earth: this.earth,
        safe: () => !this.web.trapped && !this.animals?.hasCaptures,
        toast: (text) => this.toast(text),
        changed: (previousMate) => {
          const mate = this.rabbits.find((r) => r.data.id === previousMate);
          if (mate) this.decorations.markPartner(mate, false);
          this.animalState.mating = undefined;
          this.movement.reset();
          this.web.resetTraversal();
          this.animals.avatarChanged();
          this.interactions.clearSelection();
          this.ui.closePanels();
          this.ui.clearMessage();
          this.input.clear();
          this.sessionUI.updateHud();
          this.sessionUI.persist(false);
          this.view.lock();
        },
      }),
      save: this.save,
      ui: this.ui,
      view: this.view,
      sound: this.sound,
      world: this.world,
      rabbits: this.rabbits,
      family: this.family,
      elapsed: () => this.runtime.elapsed,
      resetInput: () => this.input.clear(),
      resumeGame: () => {
        if (this.running && !this.ui.state.overlay) {
          this.renderer.domElement.focus({ preventScroll: true });
          this.view.lock();
        }
      },
      toast: (text) => this.toast(text),
      persist: () => this.sessionUI.persist(false),
      markPartner: (actor, active) => this.decorations.markPartner(actor, active),
      playAction: (action, duration) => this.playAction(action, duration),
      familyStash: () => this.partnerSupport.familyStash(),
      startMating: (fatherId, until) => {
        this.animalState.mating = { fatherId, until };
      },
    });
    this.collisions = new AnimalCollisionSystem({
      playerRestrained: () => AnimalRestraint.active(this.player.root),
      playerHeading: () => this.player.root.rotation.y,
      save: this.save,
      world: this.world,
      earth: this.earth,
      rabbits: this.rabbits,
      families: this.families,
      predators: this.predators,
      wildlife: this.wildlife,
      family: this.family,
    });
    this.sessionUI = new SessionInterface({
      canSave: () => !this.animals?.hasCaptures,
      airliftView: () => this.animals?.airliftView,
      webView: () => this.web.view(),
      captureWildlife: () => this.ecology.capture(),
      save: this.save,
      ui: this.ui,
      view: this.view,
      world: this.world,
      earth: this.earth,
      store: this.store,
      seasons: this.seasons,
      calendar: this.calendar,
      queries: this.queries,
      items: this.items,
      sound: this.sound,
      saves: this.saves,
      interactions: this.interactions,
      toast: (text) => this.toast(text),
    });
    this.shelters = new ShelterController({
      save: this.save,
      queries: this.queries,
      decorations: this.decorations,
      ui: this.ui,
      menu: () => this.actions.showMenu(),
      persist: () => this.sessionUI.persist(false),
      toast: (text) => this.toast(text),
    });
    this.actions = new SessionActions({
      restrained: () => AnimalRestraint.active(this.player.root),
      web: this.web,
      grooming: new FamilyGrooming({
        save: this.save,
        ui: this.ui,
        rabbits: this.rabbits,
        family: this.family,
        elapsed: () => this.runtime.elapsed,
        playAction: (action, duration) => this.playAction(action, duration),
        persist: () => this.sessionUI.persist(false),
        toast: (message) => this.toast(message),
      }),
      shelters: this.shelters,
      resetInput: () => this.input.clear(),
      refreshHud: () => this.sessionUI.updateHud(),
      save: this.save,
      ui: this.ui,
      sound: this.sound,
      view: this.view,
      interactions: this.interactions,
      family: this.family,
      inventory: this.inventory,
      environment: this.environment,
      queries: this.queries,
      controls: this.controls,
      resetDig: () => {
        this.runtime.digHeld = false;
      },
      persist: (notify) => this.sessionUI.persist(notify),
      toast: (text) => this.toast(text),
      toggleJournal: (mode) => this.sessionUI.toggleJournal(mode),
    });
    this.animals = new AnimalSimulation({
      resetInput: () => this.input.clear(),
      canGrabPlayer: () => !this.web.trapped,
      impactSound: () => this.sound.play('danger'),
      ambientSound: (cue) => this.sound.animal(cue),
      facing: () => this.view.forwardAt(),
      attackSound: (cue) => this.attackSounds?.emit(cue),
      family: this.family,
      animalWaste: new AnimalWasteSystem({
        scene: this.scene,
        save: this.save,
        earth: this.earth,
        waste: this.waste,
        family: this.family,
        rabbits: this.rabbits,
        families: this.families,
        wildlife: this.wildlife,
        predators: this.predators,
        hawks: this.hawks,
      }),
      combatAllowed: () => !this.ui.conversationOpen,
      save: this.save,
      world: this.world,
      earth: this.earth,
      rng: this.rng,
      player: this.player,
      rabbits: this.rabbits,
      families: this.families,
      predators: this.predators,
      wildlife: this.wildlife,
      hawks: this.hawks,
      ecology: this.ecology,
      traffic: this.traffic,
      collisions: this.collisions,
      partnerSupport: this.partnerSupport,
      seasons: this.seasons,
      consequences: this.consequences,
      state: this.animalState,
      groundAt: this.groundAt,
      toast: (text) => this.toast(text),
    });
    this.simulation = new SessionSimulation({
      web: this.web,
      decorations: this.decorations,
      interactions: this.interactions,
      camera: this.camera,
      environment: this.environment,
      view: this.view,
      save: this.save,
      calendar: this.calendar,
      movement: this.movement,
      ui: this.ui,
      queries: this.queries,
      survival: this.survival,
      consequences: this.consequences,
      waste: this.waste,
      family: this.family,
      items: this.items,
      animals: this.animals,
      world: this.world,
      sound: this.sound,
      player: this.player,
      earth: this.earth,
      lighting: this.lighting,
      sessionUI: this.sessionUI,
      state: this.runtime,
      action: (command) => this.action(command),
      gameOver: () => this.gameOver(),
    });
    this.view.snap(this.save.player.x, this.save.player.y, this.save.player.z, this.sheltered);
    this.sessionUI.updateHud();
  }

  private get sheltered(): boolean {
    return (
      !!this.earth &&
      this.earth.isSheltered(this.save.player.x, this.save.player.y, this.save.player.z)
    );
  }

  private frame = (timestamp: number): void => {
    const frameMs = timestamp - (this.lastFrame || timestamp);
    const dt = Math.min(frameMs / 1000, 0.05);
    this.lastFrame = timestamp;
    const start = performance.now();
    if (this.running && !this.ui.state.overlay && !this.ui.simulationPaused)
      this.simulation.update(dt);

    const afterUpdate = performance.now();
    if (this.running) this.render();

    if (this.running && frameMs > 0)
      this.performanceMonitor.record(
        this.renderer,
        frameMs,
        afterUpdate - start,
        performance.now() - afterUpdate,
      );

    requestAnimationFrame(this.frame);
  };

  private render(): void {
    const p = this.save.player;
    this.view.setLookEnabled(!this.ui.state.overlay && !this.ui.panelsOpen);
    const digging =
      this.player.root.userData.action === 'dig' &&
      ((this.player.root.userData.actionUntil as number | undefined) ?? 0) > this.runtime.elapsed;
    const walking = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ].some((code) => this.keys.has(code));
    this.view.update(
      p.x,
      p.z,
      p.y + ((this.player.root.userData.jumpHeight as number | undefined) ?? 0) * 0.4,
      this.sheltered ? this.earth : undefined,
      this.runtime.elapsed,
      digging,
      walking,
    );
    this.player.root.visible = !this.view.isFirstPerson;
    this.renderer.render(this.scene, this.camera);
  }

  private action(action: string): void {
    if (action === 'fullscreen') {
      void this.fullscreen.toggle();
      return;
    }
    if (action === 'new') {
      void this.newGame();
      return;
    }
    if (action === 'load') {
      void this.loadGame();
      return;
    }
    if (this.running) this.actions.execute(action);
  }

  private playAction(action: RabbitAction, duration: number): void {
    setRabbitAction(this.player, action, this.runtime.elapsed, duration);
  }

  private toast(message: string): void {
    if (this.save) {
      EventJournal.append(this.save, message);
      this.ui.setEvents(this.save.messages, true);
    }

    this.ui.toast(message);
  }

  private gameOver(): void {
    this.running = false;
    this.view.unlock();
    this.ui.closePanels();
    this.ui.showOverlay({
      type: 'gameover',
      day: this.save.day,
      births: this.save.stats.births,
      grown: this.save.stats.grown,
    });
  }
}
