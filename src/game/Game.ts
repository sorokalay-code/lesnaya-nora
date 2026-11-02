import { DesktopInput, type InputContext } from './input/DesktopInput';
import { MobileInput } from './input/MobileInput';
import * as THREE from 'three';
import { GameUI } from '../ui/GameUI';
import { HudPresenter } from '../ui/presenters/HudPresenter';
import { MapPresenter } from '../ui/presenters/MapPresenter';
import { Soundscape } from './Audio';
import { Excavation } from './Excavation';
import { ExcavationTraffic } from './ExcavationTraffic';
import { FamilyCare } from './FamilyCare';
import { GroundItems } from './GroundItems';
import { ModelAssets } from './ModelAssets';
import {
  animateRabbit,
  makeNest,
  makeStash,
  setRabbitAction,
  type RabbitAction,
  type RabbitRig,
} from './Models';
import { PartnerSupport } from './PartnerSupport';
import { PerformanceMonitor } from './PerformanceMonitor';
import { Random } from './Random';
import { SaveRepository } from './SaveRepository';
import { ViewCamera } from './ViewCamera';
import { WildlifeEcology } from './WildlifeEcology';
import { World } from './World';
import type { ForestAnimal } from './animals';
import {
  createPredatorActor,
  FamilyMember,
  Hawk,
  PlayerRabbit,
  Predator,
  RabbitActor,
  RabbitFactory,
} from './animals';
import { GameInputController } from './input/GameInputController';
import { AnimalCollisionSystem } from './session/AnimalCollisionSystem';
import { EnvironmentController } from './session/EnvironmentController';
import { FamilyLifecycle } from './session/FamilyLifecycle';
import { InteractionController } from './session/InteractionController';
import { InventoryController } from './session/InventoryController';
import { PlayerMovement } from './session/PlayerMovement';
import { SessionQueries } from './session/SessionQueries';
import { FoodStore, SeasonSystem, SurvivalSystem, WasteSystem } from './systems';
import {
  type MateCommand,
  type NestData,
  type SaveData,
  type Season,
  type StashData,
  type Weather,
} from './types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Координатор сессии: создаёт системы, выполняет игровой цикл и связывает ввод с командами. */
export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 350);
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private view: ViewCamera;
  private ui!: GameUI;
  private readonly hudPresenter = new HudPresenter();
  private readonly mapPresenter = new MapPresenter();
  private sun = new THREE.DirectionalLight(0xfff3d2, 2);
  private ambient = new THREE.HemisphereLight(0xd3e4ed, 0x56704d, 1.8);
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
  private nestMeshes = new Map<number, THREE.Group>();
  private stashMeshes = new Map<number, THREE.Group>();
  private keys = new Set<string>();
  private elapsed = 0;
  private lastFrame = 0;
  private lastHud = 0;
  private autosaveAt = 0;
  private eventCooldown = 0;
  private movement!: PlayerMovement;
  private running = false;
  private mating?: { fatherId: number; until: number };
  private showControls = true;
  private digHeld = false;
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
    this.bind();
    this.resize();
    this.performanceMonitor = new PerformanceMonitor(this.ui.publishPerformance);
    this.showStart();
    requestAnimationFrame(this.frame);
  }

  private buildUi(): void {
    this.ui = new GameUI(this.app, (action) => this.action(action));
    this.showControls = localStorage.getItem('lesnaya-nora-show-controls') !== 'false';
    this.ui.setControls(this.showControls);
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
        this.digHeld = held;
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
    const startDay = 1 + Math.max(0, Math.min(3, seasonIndex)) * 30;
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

    this.save = {
      version: 3,
      seed,
      clock: (startDay - 1) * 1440 + 7 * 60,
      day: startDay,
      player: {
        x: 0,
        y: 0,
        z: 0,
        genes: { coat: 'cream', ear: 1.1, speed: 3, vitality: 4, size: 1 },
        hunger: 85,
        thirst: 85,
        bodyTemp: 38.5,
        energy: 90,
        bladder: 15,
        bowel: 15,
        health: 100,
        age: 0,
        hidden: false,
        dirtiness: 0,
        poison: 0,
        milk: 35,
      },
      inventory: {
        clover: 2,
        carrot: 0,
        cabbage: 0,
        mushroom: 0,
        berries: 0,
        toadstool: 0,
        bitterleaf: 0,
        acorn: 0,
      },
      nests: [],
      stashes: [],
      materials: { grass: 0, twigs: 0, fur: 0 },
      excavation: [],
      gnawedRoots: {},
      kits: [],
      partners: this.factory.partners(16),
      harvested: [],
      pregnancy: null,
      mateCommand: 'forage',
      mateMessages: [],
      partnerCargo: { grass: 0, twigs: 0, fur: 0 },
      branchPicked: {},
      drops: [],
      stats: { births: 0, grown: 0, survived: 0, generations: 1, stillborn: 0 },
      weather: 'clear',
      messages: [],
      waste: [],
    };
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
    ModelAssets.shared.release(this.scene);
    this.scene.clear();
    this.nestMeshes.clear();
    this.stashMeshes.clear();
    this.scene.background = new THREE.Color(0xb9d3ba);
    this.scene.add(this.camera);
    this.scene.add(this.ambient);
    this.sun.position.set(25, 45, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 38;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
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
      temperature: () => this.airTemperature(),
      toast: (text) => this.toast(text),
      persist: () => this.persist(false),
      playAction: (action, duration) => this.playAction(action, duration),
    });
    this.partnerSupport = new PartnerSupport(
      this.save,
      this.world,
      this.earth,
      this.items,
      new Random(this.save.seed + 6631),
    );
    this.waste = new WasteSystem(this.scene, this.save, (w) =>
      this.earth.isSheltered(w.x, w.y, w.z) ? w.y : this.world.heightAt(w.x, w.z),
    );
    this.playerActor = new PlayerRabbit(this.save.player);
    this.player = this.playerActor.rig;
    this.movement = new PlayerMovement(
      this.playerActor,
      this.keys,
      this.view,
      this.earth,
      this.sound,
    );
    this.scene.add(this.player.root);
    this.rabbits = this.save.partners.map((p) => {
      const actor = new RabbitActor(p, this.rng);
      actor.rig.root.position.y = this.world.heightAt(p.x, p.z);
      this.scene.add(actor.rig.root);
      if (p.id === this.save.mateId) this.markPartner(actor, true);
      return actor;
    });
    this.families = [];
    for (const partner of this.save.partners) {
      const familyFactory = new RabbitFactory(new Random(this.save.seed + 900 + partner.id * 71));
      for (let i = 0; i < partner.familySize; i++) {
        const member = new FamilyMember(
          partner,
          familyFactory.genes(),
          i,
          i < Math.floor(partner.familySize / 2),
        );
        member.rig.root.position.set(
          partner.x,
          this.world.heightAt(partner.x, partner.z),
          partner.z,
        );
        this.families.push(member);
        this.scene.add(member.rig.root);
      }
    }

    this.predators = [];
    for (let i = 0; i < 22; i++) {
      const a = this.rng.range(0, Math.PI * 2),
        d = this.rng.range(27, 82);
      const x = i === 0 ? 34 : i === 1 ? -35 : Math.cos(a) * d;
      const z = i === 0 ? 31 : i === 1 ? 29 : Math.sin(a) * d;
      const kind =
        i < 2
          ? 'dog'
          : i === 2 || i === 6
            ? 'bear'
            : i >= 3 && i <= 5
              ? 'snake'
              : i % 7 === 0
                ? 'lynx'
                : i % 5 === 0
                  ? 'weasel'
                  : i % 4 === 0
                    ? 'wolf'
                    : 'fox';
      const predator = createPredatorActor(kind, x, z, this.rng);
      predator.root.position.y = this.world.heightAt(x, z);
      this.predators.push(predator);
      this.scene.add(predator.root);
    }

    this.ecology = new WildlifeEcology(this.scene, this.world, this.rng);
    this.ecology.populate();
    this.wildlife = this.ecology.animals;
    this.hawks = [[32, -30]].map(([x, z]) => new Hawk(x, z, this.rng));
    for (const hawk of this.hawks) this.scene.add(hawk.root, hawk.shadow);

    this.save.nests.forEach((n) => this.addNest(n));
    this.save.stashes.forEach((s) => this.addStash(s));
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
      addStash: (stash) => this.addStash(stash),
      clearSelection: () => this.interactions.clearSelection(),
      closePanels: () => this.interactions.close(),
    });
    this.environment = new EnvironmentController({
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
      elapsed: () => this.elapsed,
      toast: (text) => this.toast(text),
      playAction: (action, duration) => this.playAction(action, duration),
      addNest: (nest) => this.addNest(nest),
      makeWaste: (kind) => this.makeWaste(kind),
    });
    this.interactions = new InteractionController({
      save: this.save,
      ui: this.ui,
      view: this.view,
      sound: this.sound,
      world: this.world,
      rabbits: this.rabbits,
      family: this.family,
      elapsed: () => this.elapsed,
      resetInput: () => this.input.clear(),
      resumeGame: () => {
        if (this.running && !this.ui.state.overlay) {
          this.renderer.domElement.focus({ preventScroll: true });
          this.view.lock();
        }
      },
      toast: (text) => this.toast(text),
      persist: () => this.persist(false),
      markPartner: (actor, active) => this.markPartner(actor, active),
      playAction: (action, duration) => this.playAction(action, duration),
      startMating: (fatherId, until) => {
        this.mating = { fatherId, until };
      },
    });
    this.collisions = new AnimalCollisionSystem({
      save: this.save,
      world: this.world,
      earth: this.earth,
      rabbits: this.rabbits,
      families: this.families,
      predators: this.predators,
      wildlife: this.wildlife,
      family: this.family,
    });
    this.view.snap(this.save.player.x, this.save.player.y, this.save.player.z, this.sheltered);
    this.updateHud();
  }

  private addNest(n: NestData): void {
    const mesh = makeNest();
    mesh.position.set(
      n.x,
      (this.earth.isSheltered(n.x, n.y, n.z) ? n.y : this.world.heightAt(n.x, n.z)) + 0.04,
      n.z,
    );
    this.nestMeshes.set(n.id, mesh);
    this.scene.add(mesh);
  }

  private addStash(s: StashData): void {
    const mesh = makeStash();
    mesh.position.set(
      s.x,
      (this.earth.isSheltered(s.x, s.y, s.z) ? s.y : this.world.heightAt(s.x, s.z)) + 0.02,
      s.z,
    );
    this.stashMeshes.set(s.id, mesh);
    this.scene.add(mesh);
  }

  private markPartner(actor: RabbitActor, active: boolean): void {
    const previous = actor.rig.root.getObjectByName('mate-mark');
    if (previous) {
      ModelAssets.shared.release(previous);
      previous.removeFromParent();
    }

    if (!active) return;

    const mark = new THREE.Group();
    mark.name = 'mate-mark';
    const teal = new THREE.MeshStandardMaterial({
      color: 0x89cfc0,
      emissive: 0x285d50,
      emissiveIntensity: 0.3,
    });
    const rose = new THREE.MeshStandardMaterial({
      color: 0xf1a7b4,
      emissive: 0x7c344d,
      emissiveIntensity: 0.4,
    });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 5, 16), teal);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.72, -0.22);
    mark.add(collar);
    for (const side of [-1, 1]) {
      const half = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), rose);
      half.position.set(side * 0.09, 1.88, 0);
      mark.add(half);
    }

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.24, 8), rose);
    tip.position.y = 1.76;
    tip.rotation.z = Math.PI;
    mark.add(tip);
    actor.rig.root.add(mark);
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
    if (this.running && !this.ui.state.overlay && !this.ui.simulationPaused) this.update(dt);

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

  private update(dt: number): void {
    ModelAssets.shared.updateView(this.camera);
    this.elapsed += dt;
    this.eventCooldown = Math.max(0, this.eventCooldown - dt);
    this.environment.update(dt);
    if (this.digHeld && this.view.isFirstPerson && this.elapsed >= this.environment.nextDigAt)
      this.action('dig');

    const p = this.save.player;
    const oldDay = this.save.day;
    this.save.clock += dt * 6;
    this.save.day = Math.floor(this.save.clock / 1440) + 1;
    p.age += (dt * 6) / 1440;
    if (this.save.day > oldDay) this.newDay();

    const night = this.isNight();
    const moving = this.movement.move(dt, this.elapsed, this.ui.panelsOpen);
    this.movement.settle(dt);
    p.hidden = this.sheltered;
    const air = this.airTemperature();
    const nearbyNest = this.queries.nest(2.8);
    const warmed = this.sheltered || nearbyNest !== undefined;
    this.survival.tick(dt, this.elapsed, moving, air, warmed, () => this.makeWaste('diarrhea'));
    this.waste.update(dt, p.x, p.y, p.z);
    if (p.health <= 0) {
      this.gameOver();
      return;
    }

    this.family.update(dt, this.elapsed);
    this.items.update(this.save.clock);
    for (const rabbit of this.rabbits) {
      if (rabbit.data.id === this.save.mateId) {
        const home =
          this.save.nests.find((n) => this.earth.isSheltered(n.x, n.y, n.z)) ??
          this.save.nests[0] ??
          this.save.stashes[0] ??
          p;
        const stash = this.inventory.ensureFamilyStash(home);
        const event = this.partnerSupport.update(
          rabbit,
          dt,
          this.elapsed,
          home,
          stash,
          this.groundAt,
        );
        if (
          event?.kind === 'delivered' &&
          Math.hypot(rabbit.data.x - p.x, rabbit.data.z - p.z) < 12
        )
          this.toast(event.text);
      } else rabbit.update(dt, this.elapsed, p.x, p.z, this.groundAt);

      const mark = rabbit.rig.root.getObjectByName('mate-mark');
      if (mark) {
        mark.rotation.y = this.elapsed * 0.6;
        mark.position.y = Math.sin(this.elapsed * 2.2) * 0.06;
      }
    }

    if (this.mating) {
      const actor = this.rabbits.find((r) => r.data.id === this.mating!.fatherId);
      if (actor) {
        actor.rig.root.position.set(
          p.x + Math.sin(this.player.root.rotation.y) * 0.28,
          p.y + 0.4,
          p.z + Math.cos(this.player.root.rotation.y) * 0.28,
        );
        actor.rig.root.rotation.y = this.player.root.rotation.y;
      }

      if (this.elapsed >= this.mating.until) this.mating = undefined;
    }

    for (const member of this.families) member.update(this.elapsed, dt, this.groundAt);

    let closestThreat = Infinity;
    for (const predator of this.predators) {
      const prey = this.ecology.targetFor(predator, this.predators, this.elapsed);
      if (
        predator.update(
          dt,
          this.elapsed,
          p.x,
          p.z,
          p.hidden,
          !night,
          this.groundAt,
          p.dirtiness / 100,
          this.seasons.predatorActivity(this.save.day),
          prey,
        )
      )
        this.predatorAttack(predator.kind);

      this.threatenKits(predator);
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }

    for (const event of this.traffic.update(
      dt,
      this.elapsed,
      night,
      this.predators,
      this.rabbits,
      this.save,
      this.earth,
    )) {
      const animal = event.kind === 'weasel' ? 'Ласка' : 'Лиса';
      if (event.type === 'predator-entered')
        this.toast(`${animal} учуяла крольчат или отходы и пролезла в неглубокий ход!`);

      if (event.type === 'predator-attack') this.predatorAttack(event.kind);

      if (event.type === 'kit-attack')
        this.toast(`${animal} добралась до ${event.name}. Уведи малыша глубже и защити гнездо.`);
    }

    for (const event of this.ecology.update(
      dt,
      this.elapsed,
      this.save.clock,
      p.x,
      p.z,
      this.groundAt,
      this.predators,
    )) {
      if (Math.hypot(event.x - p.x, event.z - p.z) > 19 || event.kind === 'arrival') continue;

      if (event.kind === 'hunt')
        this.toast(`Хищник поймал ${event.subject}. Лес живёт по своим законам.`);
      else if (event.kind === 'defend')
        this.toast(`${event.subject[0].toUpperCase() + event.subject.slice(1)} дал отпор хищнику!`);
      else this.toast('Хищники столкнулись из-за охотничьей территории.');
    }

    this.collisions.resolve(this.mating?.fatherId);
    for (const rabbit of this.rabbits)
      if (this.rng.chance(dt * 0.025)) {
        const food = this.world.nearestResource(rabbit.data.x, rabbit.data.z, 1.2);
        if (food && food.kind !== 'toadstool') {
          this.world.harvest(food, this.save.clock);
          setRabbitAction(rabbit.rig, 'eat', this.elapsed + rabbit.data.id, 1.2);
        } else if (this.world.gnawBark(rabbit.data.x, rabbit.data.z, this.save.clock))
          setRabbitAction(rabbit.rig, 'eat', this.elapsed + rabbit.data.id, 1.2);
      }

    const exposed = !this.sheltered && !this.world.hasCover(p.x, p.z);
    for (const hawk of this.hawks)
      if (hawk.update(dt, this.elapsed, p.x, p.z, exposed, this.groundAt))
        this.predatorAttack('hawk');

    for (const rabbit of this.rabbits)
      rabbit.rig.root.visible =
        Math.hypot(rabbit.rig.root.position.x - p.x, rabbit.rig.root.position.z - p.z) < 76;

    for (const member of this.families)
      member.rig.root.visible =
        Math.hypot(member.rig.root.position.x - p.x, member.rig.root.position.z - p.z) < 76;

    for (const predator of this.predators)
      predator.root.visible =
        Math.hypot(predator.root.position.x - p.x, predator.root.position.z - p.z) < 76;

    for (const animal of this.wildlife)
      animal.root.visible = Math.hypot(animal.x - p.x, animal.z - p.z) < 76;

    for (const hawk of this.hawks) {
      const visible = Math.hypot(hawk.x - p.x, hawk.z - p.z) < 92;
      hawk.root.visible = visible;
      hawk.shadow.visible = visible && !this.sheltered;
    }

    this.world.update(this.save.clock, this.elapsed, this.save.weather, this.save.day, p.x, p.z);
    this.world.updateRain(dt, p.x, p.z, this.save.weather);
    this.sound.update(this.elapsed, night);
    this.sound.setWeather(this.save.weather, night);
    this.player.root.position.x = p.x;
    this.player.root.position.z = p.z;
    this.player.root.userData.baseY = p.y;
    this.player.root.visible = !this.view.isFirstPerson;
    animateRabbit(this.player, this.elapsed, moving, closestThreat < 8 && !this.sheltered, dt);
    this.earth.update(
      p.x,
      p.y,
      p.z,
      this.view.isFirstPerson ? this.earth.preview(this.camera, p.x, p.y, p.z) : undefined,
    );
    const sunAngle = ((this.save.clock % 1440) / 1440) * Math.PI * 2;
    const daylight = clamp(0.5 + 0.5 * Math.cos(sunAngle - Math.PI), 0.25, 1);
    this.sun.intensity = 0.45 + daylight * 1.55;
    this.ambient.intensity = 0.7 + daylight * 1.1;
    this.sun.position.set(
      Math.cos(sunAngle) * 45,
      Math.max(8, Math.cos(sunAngle - Math.PI) * 45),
      22,
    );
    this.sun.target.position.set(p.x, this.world.heightAt(p.x, p.z), p.z);
    this.scene.add(this.sun.target);
    this.sun.position.x += p.x;
    this.sun.position.z += p.z;
    const hour = (this.save.clock % 1440) / 60;
    const clearSky = night ? 0x3d5667 : hour < 10 ? 0xe1c5a3 : hour >= 17 ? 0xd0aa8a : 0xb9d3ba;
    const sky = new THREE.Color(
      this.sheltered
        ? 0x5c4e3e
        : this.save.weather === 'snow'
          ? 0xd4dfdf
          : this.save.weather === 'rain'
            ? 0x9eafb0
            : clearSky,
    );
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(sky);

    if (this.elapsed - this.lastHud > 0.22) {
      this.lastHud = this.elapsed;
      this.updateHud(closestThreat);
    }

    if (this.elapsed > this.autosaveAt) {
      this.autosaveAt = this.elapsed + 30;
      this.persist(false);
    }
  }

  private render(): void {
    const p = this.save.player;
    this.view.setLookEnabled(
      !this.ui.state.overlay &&
        !this.ui.state.dialog &&
        !this.ui.state.journal &&
        !this.ui.state.settings,
    );
    const digging =
      this.player.root.userData.action === 'dig' &&
      ((this.player.root.userData.actionUntil as number | undefined) ?? 0) > this.elapsed;
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
      p.y,
      this.sheltered ? this.earth : undefined,
      this.elapsed,
      digging,
      walking,
    );
    this.player.root.visible = !this.view.isFirstPerson;
    this.renderer.render(this.scene, this.camera);
  }

  private isNight(): boolean {
    const t = this.save.clock % 1440;
    return t < 300 || t >= 1260;
  }

  private season(): Season {
    return this.seasons.name(this.save.day);
  }

  private airTemperature(): number {
    return (
      this.seasons.temperature(this.save.day, this.save.clock, this.save.weather) +
      this.world.temperatureOffset(this.save.player.x, this.save.player.z)
    );
  }

  private newDay(): void {
    const previous = this.save.weather;
    this.save.weather = this.rng.pick(
      this.season() === 'Зима'
        ? (['clear', 'mist', 'snow', 'snow'] as Weather[])
        : (['clear', 'clear', 'clear', 'mist', 'rain'] as Weather[]),
    );
    if (previous !== this.save.weather)
      this.toast(
        this.save.weather === 'rain'
          ? 'Пошёл дождь. В лесу пахнет мокрой листвой.'
          : this.save.weather === 'mist'
            ? 'Над лесом стелется туман.'
            : this.save.weather === 'snow'
              ? 'Начался снегопад. Пора искать тепло.'
              : 'Небо прояснилось.',
      );

    const grown = this.save.kits.filter((k) => k.alive && k.age >= 3).length;
    this.save.stats.survived = grown;
    this.toast(`Наступил день ${this.save.day}. ${this.season()} в лесу.`);
  }

  private predatorAttack(kind: string): void {
    const p = this.save.player;
    p.health = clamp(
      p.health -
        (kind === 'hawk'
          ? 32
          : kind === 'wolf'
            ? 23
            : kind === 'lynx'
              ? 21
              : kind === 'weasel'
                ? 11
                : kind === 'bear'
                  ? 34
                  : kind === 'snake'
                    ? 8
                    : 15) *
          0.8,
      0,
      100,
    );
    if (kind === 'snake') p.poison = clamp(p.poison + 18, 0, 100);

    p.energy = clamp(p.energy - 13, 0, 100);
    this.sound.play('danger');
    this.toast(
      `${kind === 'hawk' ? 'Сокол' : kind === 'wolf' ? 'Волк' : kind === 'dog' ? 'Сторожевой пёс' : kind === 'lynx' ? 'Рысь' : kind === 'weasel' ? 'Ласка' : kind === 'bear' ? 'Медведь' : kind === 'snake' ? 'Змея' : 'Лиса'} напал! Беги под деревья или в выкопанный ход.`,
    );
  }

  private threatenKits(predator: Predator): void {
    if (predator.attackCooldown > 0) return;

    for (const nest of this.save.nests.filter((n) => !this.earth.isSheltered(n.x, n.y, n.z))) {
      if (Math.hypot(predator.x - nest.x, predator.z - nest.z) > 2) continue;

      const kit = this.save.kits.find(
        (k) => k.alive && k.age < 3 && k.command !== 'follow' && k.nestId === nest.id,
      );
      if (!kit) continue;

      kit.health = clamp(kit.health - 24 * 0.8, 0, 100);
      predator.attackCooldown = 9;
      this.sound.play('danger');
      this.toast(`Хищник нашёл наземное гнездо! ${kit.name} в опасности.`);
      return;
    }
  }

  private action(action: string): void {
    if (action === 'new') {
      this.newGame();
      return;
    }

    if (action === 'load') {
      this.loadGame();
      return;
    }

    if (!this.running) return;

    this.sound.unlock();
    if (action === 'save') {
      this.persist(true);
      return;
    }

    if (action === 'sound') {
      this.sound.muted = !this.sound.muted;
      this.toast(this.sound.muted ? 'Звук выключен' : 'Звук включён');
      return;
    }

    if (action === 'self-profile') {
      this.view.unlock();
      this.ui.closeJournal();
      this.ui.showDialog({
        type: 'self',
        player: this.save.player,
        pregnant: !!this.save.pregnancy,
      });
      return;
    }

    if (action === 'mate-panel') {
      this.interactions.openMatePanel();
      return;
    }

    if (action === 'mate-talk') {
      const mate = this.save.partners.find((p) => p.id === this.save.mateId);
      if (mate) this.interactions.openPartner(mate);
      return;
    }

    if (action === 'mate-send') {
      this.interactions.sendMateMessage();
      return;
    }

    if (action.startsWith('mate-command:')) {
      this.interactions.commandMate(action.slice(13) as MateCommand);
      return;
    }

    if (action === 'camera') {
      const mode = this.view.toggleMode();
      this.digHeld = false;
      this.syncCameraUi();
      this.toast(
        mode === 'first'
          ? this.ui.state.touch
            ? 'Вид от первого лица: удерживай кнопку копания.'
            : 'Вид от первого лица: теперь можно копать ЛКМ.'
          : 'Вид от третьего лица. Для копания нажми B.',
      );
      return;
    }

    if (action === 'settings') {
      this.view.unlock();
      this.ui.toggleSettings();
      return;
    }

    if (action === 'toggle-controls') {
      this.showControls = !this.showControls;
      localStorage.setItem('lesnaya-nora-show-controls', String(this.showControls));
      this.ui.setControls(this.showControls);
      return;
    }

    if (action === 'journal' || action === 'map') {
      this.toggleJournal(action);
      return;
    }

    if (action === 'close') {
      this.interactions.close();
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
      this.interactions.partnerAction(action);
      return;
    }

    if (['child-follow', 'child-stay', 'child-rest'].includes(action)) {
      this.interactions.childAction(action);
      return;
    }

    if (['animal-observe', 'animal-food', 'animal-path'].includes(action)) {
      this.interactions.animalAction(action);
      return;
    }

    if (this.ui.state.overlay) return;

    if (action === 'feed') {
      this.family.feed();
      return;
    }

    if (action === 'feed-vegetables') {
      this.family.feed(true);
      return;
    }

    if (action === 'interact') {
      if (this.ui.state.dialog) {
        this.interactions.close();
        return;
      }

      const kit = this.queries.kit();
      if (kit) {
        this.interactions.openKit(kit);
        return;
      }

      const partner = this.queries.partner();
      if (partner) {
        this.interactions.openPartner(partner);
        return;
      }

      const animal = this.queries.animal();
      if (animal) {
        this.interactions.openAnimal(animal);
        return;
      }

      this.inventory.collect();
      return;
    }

    if (this.inventory.execute(action)) return;

    this.environment.execute(action);
  }

  private playAction(action: RabbitAction, duration: number): void {
    setRabbitAction(this.player, action, this.elapsed, duration);
  }

  private makeWaste(kind: 'pellets' | 'urine' | 'diarrhea'): void {
    const x = this.save.player.x,
      z = this.save.player.z,
      y = this.sheltered ? this.save.player.y : this.world.heightAt(x, z);
    this.waste.spawn(kind, x, y, z);
    this.save.player.dirtiness = clamp(
      this.save.player.dirtiness + (kind === 'diarrhea' ? 18 : kind === 'urine' ? 8 : 3),
      0,
      100,
    );
  }

  private updateHud(threat = Infinity): void {
    const p = this.save.player;
    this.ui.setHud(
      this.hudPresenter.build(
        this.save,
        this.world,
        this.earth,
        this.view.isFirstPerson,
        this.store,
        this.seasons,
        this.airTemperature(),
        threat,
        this.queries.partner(),
        this.sheltered ? undefined : this.world.nearestResource(p.x, p.z, 2.3),
        this.queries.stash(),
        this.queries.kit(),
        this.queries.animal(),
        this.items.nearest(p.x, p.y, p.z),
      ),
    );
  }

  private toggleJournal(mode: string): void {
    if (this.ui.state.journal?.mode === mode) {
      this.interactions.close();
      return;
    }

    this.view.unlock();
    this.interactions.clearSelection();
    if (mode === 'map')
      this.ui.showJournal({ mode: 'map', map: this.mapPresenter.build(this.world, this.save) });
    else this.ui.showJournal({ mode: 'journal', save: this.save, season: this.season() });
  }

  private persist(notify: boolean): void {
    this.save.harvested = this.world.resources.filter((r) => !r.available).map((r) => r.id);
    try {
      this.saves.store(this.save);
      if (notify) {
        this.sound.play('save');
        this.toast('Игра сохранена в этом браузере.');
      }
    } catch {
      if (notify) this.toast('Не удалось сохранить игру: хранилище браузера недоступно.');
    }
  }

  private toast(message: string): void {
    this.save?.messages.push(message);
    if (this.save?.messages.length > 30) this.save.messages.shift();

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
