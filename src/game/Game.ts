import * as THREE from 'three';
import { Soundscape } from './Audio';
import { FamilyMember, RabbitActor, RabbitFactory, Predator, partnerScore } from './Entities';
import { animateRabbit, createRabbit, makeBurrow, type RabbitRig } from './Models';
import { Random } from './Random';
import { World } from './World';
import { FOOD, type BurrowData, type FoodKind, type KitData, type PartnerTraits, type SaveData, type Season, type Weather } from './types';

const SAVE_KEY = 'lesnaya-nora-save-v1';
const femaleNames = ['Искорка', 'Лапка', 'Ромашка', 'Звёздочка', 'Берёзка', 'Снежка', 'Брусничка', 'Ива'];
const maleNames = ['Клевер', 'Шорох', 'Орешек', 'Лучик', 'Пушок', 'Ветерок', 'Туман', 'Листик'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fmt = (n: number) => Math.round(n);

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 350);
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private sun = new THREE.DirectionalLight(0xfff3d2, 2);
  private ambient = new THREE.HemisphereLight(0xd3e4ed, 0x56704d, 1.8);
  private sound = new Soundscape();
  private rng!: Random;
  private factory!: RabbitFactory;
  private world!: World;
  private player!: RabbitRig;
  private save!: SaveData;
  private rabbits: RabbitActor[] = [];
  private families: FamilyMember[] = [];
  private predators: Predator[] = [];
  private burrowMeshes = new Map<number, THREE.Group>();
  private kitMeshes = new Map<number, RabbitRig>();
  private keys = new Set<string>();
  private yaw = 0.3;
  private pitch = 0.27;
  private cameraDistance = 7.5;
  private pointerDown = false;
  private pointerX = 0;
  private pointerY = 0;
  private elapsed = 0;
  private lastFrame = 0;
  private lastHud = 0;
  private autosaveAt = 0;
  private eventCooldown = 0;
  private hopCooldown = 0;
  private running = false;
  private dialogPartner?: PartnerTraits;
  private overlay!: HTMLElement;
  private hud!: HTMLElement;
  private prompt!: HTMLElement;
  private toastBox!: HTMLElement;
  private mapCanvas!: HTMLCanvasElement;
  private journal!: HTMLElement;

  constructor(private readonly app: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.className = 'game-canvas';
    this.app.append(this.renderer.domElement);
    this.buildUi(); this.bind(); this.resize();
    this.showStart();
    requestAnimationFrame(this.frame);
  }

  private buildUi(): void {
    const layer = document.createElement('div'); layer.className = 'ui-layer';
    layer.innerHTML = `<div class="topbar"><div class="brand"><span class="brand-icon">✦</span><span>ЛЕСНАЯ НОРА<small>история дикой крольчихи</small></span></div><div id="world-info" class="world-info"></div><div class="top-actions"><button data-action="map" title="Карта (M)">◈ Карта</button><button data-action="journal" title="Дневник (J)">☰ Дневник</button><button data-action="save" title="Сохранить (F5)">▣ Сохранить</button><button data-action="sound" title="Звук">♪</button></div></div>
      <div id="hud" class="hud"></div><div id="prompt" class="prompt"></div><div id="toast" class="toast-box"></div>
      <div class="controls"><b>Управление</b><span>WASD — движение · Shift — бег · мышь — камера · колесо — масштаб</span><span>E — взаимодействие · G — еда · B — копать · H — спрятаться · R — сон · P — нужда · F — кормить крольчат</span></div>
      <div id="journal" class="journal hidden"></div><div id="overlay" class="overlay"></div>`;
    this.app.append(layer);
    this.overlay = layer.querySelector('#overlay')!; this.hud = layer.querySelector('#hud')!;
    this.prompt = layer.querySelector('#prompt')!; this.toastBox = layer.querySelector('#toast')!;
    this.journal = layer.querySelector('#journal')!;
    this.mapCanvas = document.createElement('canvas'); this.mapCanvas.width = this.mapCanvas.height = 420;
    layer.addEventListener('click', e => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.action(action);
    });
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F5'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); if (e.repeat) return;
      if (e.code === 'F5') this.action('save');
      if (e.code === 'KeyM') this.action('map');
      if (e.code === 'KeyJ') this.action('journal');
      if (!this.running || !this.overlay.classList.contains('hidden')) return;
      const map: Record<string, string> = { KeyE: 'interact', KeyG: 'eat', KeyB: 'dig', KeyH: 'hide', KeyR: 'sleep', KeyP: 'relieve', KeyF: 'feed', Space: 'hop' };
      if (map[e.code]) this.action(map[e.code]);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.renderer.domElement.addEventListener('pointerdown', e => { this.pointerDown = true; this.pointerX = e.clientX; this.pointerY = e.clientY; this.renderer.domElement.setPointerCapture(e.pointerId); });
    this.renderer.domElement.addEventListener('pointerup', () => this.pointerDown = false);
    this.renderer.domElement.addEventListener('pointermove', e => {
      if (!this.pointerDown) return;
      this.yaw -= (e.clientX - this.pointerX) * 0.006;
      this.pitch = clamp(this.pitch + (e.clientY - this.pointerY) * 0.004, -0.1, 1.1);
      this.pointerX = e.clientX; this.pointerY = e.clientY;
    });
    this.renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); this.cameraDistance = clamp(this.cameraDistance + e.deltaY * 0.01, 3.2, 13); }, { passive: false });
  }

  private resize(): void {
    const w = this.app.clientWidth, h = this.app.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
  }

  private showStart(): void {
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="start-card"><div class="eyebrow">✦ ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div><h1>Лесная<br><em>нора</em></h1><p>Один лес. Тысячи историй. Найди свой дом, вырасти семью и проживи жизнь дикой крольчихи.</p><div class="start-actions"><button class="primary" data-action="new">Новая история <span>→</span></button>${hasSave ? '<button class="secondary" data-action="load">Продолжить сохранение</button>' : ''}</div><div class="start-foot">Генерируемый мир · наследование генов · смена сезонов · семейная жизнь</div></div>`;
  }

  private newGame(): void {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    this.rng = new Random(seed + 53); this.factory = new RabbitFactory(this.rng);
    this.save = { version: 1, seed, clock: 7 * 60, day: 1,
      player: { x: 0, z: 0, genes: { coat: 'cream', ear: 1.1, speed: 3, vitality: 4, size: 1 }, hunger: 85, energy: 90, bladder: 15, health: 100, age: 0, hidden: false },
      inventory: { clover: 2, carrot: 0, cabbage: 0, mushroom: 0, berries: 0 },
      burrows: [{ id: 1, x: 2.5, z: 2.5, depth: 1, stores: 0, bedding: 1, isHome: true }], kits: [],
      partners: this.factory.partners(16), harvested: [], pregnancy: null,
      stats: { births: 0, grown: 0, survived: 0, generations: 1 }, weather: 'clear', messages: [] };
    this.setupWorld(); this.overlay.classList.add('hidden'); this.running = true; this.sound.unlock();
    this.toast('На поляне ждёт твоя первая нора. Исследуй лес и найди партнёра.');
  }

  private loadGame(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) throw new Error('Сохранение не найдено');
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed.version !== 1 || !Number.isFinite(parsed.seed) || !Array.isArray(parsed.burrows) || !Array.isArray(parsed.partners)) throw new Error('Файл сохранения повреждён');
      this.save = parsed; this.rng = new Random(parsed.seed + 53); this.factory = new RabbitFactory(this.rng);
      this.setupWorld(); this.overlay.classList.add('hidden'); this.running = true; this.sound.unlock();
      this.toast('История продолжена. Добро пожаловать домой!');
    } catch (err) { this.toast(err instanceof Error ? err.message : 'Не удалось загрузить игру'); }
  }

  private setupWorld(): void {
    this.scene.clear(); this.burrowMeshes.clear(); this.kitMeshes.clear();
    this.scene.background = new THREE.Color(0xb9d3ba);
    this.scene.add(this.ambient);
    this.sun.position.set(25, 45, 22); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 38;
    this.sun.shadow.bias = -0.0004; this.scene.add(this.sun);
    this.world = new World(this.scene, this.save.seed); this.world.setRain();
    for (const id of this.save.harvested) {
      const r = this.world.resources[id]; if (r) { r.available = false; r.mesh.visible = false; r.regrowAt = this.save.clock + 60; }
    }
    this.player = createRabbit(this.save.player.genes); this.scene.add(this.player.root);
    this.rabbits = this.save.partners.map(p => { const actor = new RabbitActor(p, this.rng); this.scene.add(actor.rig.root); return actor; });
    this.families = [];
    for (const partner of this.save.partners) {
      const familyFactory = new RabbitFactory(new Random(this.save.seed + 900 + partner.id * 71));
      for (let i = 0; i < partner.familySize; i++) {
        const member = new FamilyMember(partner, familyFactory.genes(), i, i < Math.floor(partner.familySize / 2));
        this.families.push(member); this.scene.add(member.rig.root);
      }
    }
    this.predators = [];
    for (let i = 0; i < 12; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(27, 82), x = Math.cos(a) * d, z = Math.sin(a) * d;
      const kind = this.world.biomeAt(x, z) === 'garden' ? 'dog' : i % 4 === 0 ? 'wolf' : 'fox';
      const predator = new Predator(kind, x, z, this.rng); this.predators.push(predator); this.scene.add(predator.root);
    }
    this.save.burrows.forEach(b => this.addBurrow(b));
    this.save.kits.filter(k => k.alive).forEach(k => this.addKit(k));
    this.updateHud();
  }

  private addBurrow(b: BurrowData): void {
    const mesh = makeBurrow(b.depth); mesh.position.set(b.x, 0.02, b.z); this.scene.add(mesh); this.burrowMeshes.set(b.id, mesh);
  }

  private addKit(k: KitData): void {
    const rig = createRabbit(k.genes, k.age < 2); this.scene.add(rig.root); this.kitMeshes.set(k.id, rig);
  }

  private frame = (timestamp: number): void => {
    const dt = Math.min((timestamp - (this.lastFrame || timestamp)) / 1000, 0.05); this.lastFrame = timestamp;
    if (this.running && this.overlay.classList.contains('hidden')) this.update(dt);
    if (this.running) this.render();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    this.elapsed += dt; this.eventCooldown = Math.max(0, this.eventCooldown - dt); this.hopCooldown = Math.max(0, this.hopCooldown - dt);
    const p = this.save.player;
    const oldDay = this.save.day;
    this.save.clock += dt * 6;
    this.save.day = Math.floor(this.save.clock / 1440) + 1;
    p.age += dt * 6 / 1440;
    if (this.save.day > oldDay) this.newDay();
    const night = this.isNight();
    const moving = this.movePlayer(dt);
    p.hunger = clamp(p.hunger - dt * (moving ? 0.14 : 0.07), 0, 100);
    p.energy = clamp(p.energy - dt * (moving ? (this.keys.has('ShiftLeft') ? 0.2 : 0.08) : 0.025), 0, 100);
    p.bladder = clamp(p.bladder + dt * 0.075, 0, 100);
    if (p.hunger < 10 || p.energy < 5 || p.bladder > 95) p.health = clamp(p.health - dt * 0.18, 0, 100);
    else if (p.hunger > 55 && p.energy > 55) p.health = clamp(p.health + dt * 0.025, 0, 100);
    if (p.health <= 0) { this.gameOver(); return; }
    if (this.save.pregnancy) {
      this.save.pregnancy.progress += dt * 6 / 1440;
      if (this.save.pregnancy.progress >= 1.2) this.giveBirth();
    }
    this.updateKits(dt);
    for (const rabbit of this.rabbits) rabbit.update(dt, this.elapsed, p.x, p.z);
    for (const member of this.families) member.update(this.elapsed);
    let closestThreat = Infinity;
    for (const predator of this.predators) {
      if (predator.update(dt, this.elapsed, p.x, p.z, p.hidden, !night)) this.predatorAttack(predator.kind);
      this.threatenKits(predator);
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }
    this.world.update(this.save.clock, this.elapsed, this.save.weather);
    this.world.updateRain(dt, p.x, p.z);
    this.sound.update(this.elapsed, night);
    this.player.root.position.x = p.x; this.player.root.position.z = p.z;
    this.player.root.visible = !p.hidden;
    animateRabbit(this.player, this.elapsed, moving, closestThreat < 8);
    const sunAngle = ((this.save.clock % 1440) / 1440) * Math.PI * 2;
    const daylight = clamp(0.5 + 0.5 * Math.cos(sunAngle - Math.PI), 0.25, 1);
    this.sun.intensity = 0.45 + daylight * 1.55;
    this.ambient.intensity = 0.7 + daylight * 1.1;
    this.sun.position.set(Math.cos(sunAngle) * 45, Math.max(8, Math.cos(sunAngle - Math.PI) * 45), 22);
    this.sun.target.position.set(p.x, 0, p.z); this.scene.add(this.sun.target);
    this.sun.position.x += p.x; this.sun.position.z += p.z;
    const sky = new THREE.Color(this.save.weather === 'rain' ? 0x9eafb0 : night ? 0x3d5667 : 0xb9d3ba);
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(sky);
    if (this.elapsed - this.lastHud > 0.22) { this.lastHud = this.elapsed; this.updateHud(closestThreat); }
    if (this.elapsed > this.autosaveAt) { this.autosaveAt = this.elapsed + 30; this.persist(false); }
  }

  private movePlayer(dt: number): boolean {
    const p = this.save.player;
    if (p.hidden) return false;
    let forward = 0, right = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward++;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward--;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right++;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right--;
    if (!forward && !right) return false;
    const d = Math.hypot(forward, right); forward /= d; right /= d;
    const dx = Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right;
    const dz = -Math.cos(this.yaw) * forward + Math.sin(this.yaw) * right;
    const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && p.energy > 8;
    const speed = (sprint ? 6.2 : 3.3) * (0.82 + p.genes.speed * 0.06) * (p.energy < 15 ? 0.75 : 1);
    p.x = clamp(p.x + dx * speed * dt, -103, 103); p.z = clamp(p.z + dz * speed * dt, -103, 103);
    this.player.root.rotation.y = Math.atan2(-dx, -dz);
    return true;
  }

  private render(): void {
    const p = this.save.player;
    const h = 1.5 + Math.sin(this.pitch) * this.cameraDistance;
    const planar = Math.cos(this.pitch) * this.cameraDistance;
    const wanted = new THREE.Vector3(p.x + Math.sin(this.yaw) * planar, h, p.z + Math.cos(this.yaw) * planar);
    this.camera.position.lerp(wanted, 0.13);
    this.camera.lookAt(p.x, p.hidden ? 0.3 : 0.65, p.z);
    this.renderer.render(this.scene, this.camera);
  }

  private isNight(): boolean { const t = this.save.clock % 1440; return t < 330 || t > 1230; }
  private season(): Season { return (['Весна', 'Лето', 'Осень', 'Зима'] as const)[Math.floor((this.save.day - 1) / 6) % 4]; }
  private timeText(): string { const t = Math.floor(this.save.clock % 1440); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

  private newDay(): void {
    const previous = this.save.weather;
    this.save.weather = this.rng.pick(['clear', 'clear', 'clear', 'mist', 'rain'] as Weather[]);
    if (previous !== this.save.weather) this.toast(this.save.weather === 'rain' ? 'Пошёл дождь. В лесу пахнет мокрой листвой.' : this.save.weather === 'mist' ? 'Над лесом стелется туман.' : 'Небо прояснилось.');
    const grown = this.save.kits.filter(k => k.alive && k.age >= 3).length;
    this.save.stats.survived = grown;
    this.toast(`Наступил день ${this.save.day}. ${this.season()} в лесу.`);
  }

  private updateKits(dt: number): void {
    for (const kit of this.save.kits) {
      if (!kit.alive) continue;
      const wasYoung = kit.age < 3;
      kit.age += dt * 6 / 1440;
      if (wasYoung && kit.age >= 3) { this.save.stats.grown++; this.sound.play('baby'); this.toast(`${kit.name} вырос${kit.name.endsWith('а') ? 'ла' : ''}! Семья стала сильнее.`); }
      if (kit.age < 3) {
        kit.hunger = clamp(kit.hunger - dt * 0.08, 0, 100);
        if (kit.hunger < 12) kit.health = clamp(kit.health - dt * 0.2, 0, 100);
        else if (kit.hunger > 65) kit.health = clamp(kit.health + dt * 0.04, 0, 100);
        if (kit.health <= 0) { kit.alive = false; this.kitMeshes.get(kit.id)?.root.removeFromParent(); this.toast(`${kit.name} не пережил трудные дни. Позаботься о других крольчатах.`); continue; }
      }
      const b = this.save.burrows.find(v => v.id === kit.burrowId);
      const rig = this.kitMeshes.get(kit.id);
      if (b && rig) {
        const a = kit.id * 2.4 + this.elapsed * (kit.age >= 3 ? 0.25 : 0.1);
        const radius = kit.age >= 3 ? 2.5 : 1.4;
        rig.root.position.set(b.x + Math.cos(a) * radius, 0, b.z + Math.sin(a) * radius);
        rig.root.rotation.y = -a;
        rig.root.scale.setScalar(kit.age < 3 ? (0.38 + kit.age * 0.14) * kit.genes.size : kit.genes.size);
        animateRabbit(rig, this.elapsed + kit.id, true);
      }
    }
  }

  private predatorAttack(kind: string): void {
    const p = this.save.player;
    p.health = clamp(p.health - (kind === 'wolf' ? 23 : 15), 0, 100);
    p.energy = clamp(p.energy - 13, 0, 100);
    this.sound.play('danger'); this.toast(`${kind === 'wolf' ? 'Волк' : kind === 'dog' ? 'Сторожевой пёс' : 'Лиса'} напал! Беги к норе и нажми H.`);
  }

  private threatenKits(predator: Predator): void {
    if (predator.attackCooldown > 0) return;
    for (const burrow of this.save.burrows) {
      if (burrow.depth >= 3 || Math.hypot(predator.x - burrow.x, predator.z - burrow.z) > 1.7) continue;
      const kit = this.save.kits.find(k => k.alive && k.age < 3 && k.burrowId === burrow.id);
      if (!kit) continue;
      kit.health = clamp(kit.health - (burrow.depth === 1 ? 18 : 7), 0, 100);
      predator.attackCooldown = 9;
      this.sound.play('danger');
      this.toast(`Хищник пробрался к норе! ${kit.name} напуган. Уведи его и углуби убежище.`);
      break;
    }
  }

  private nearestBurrow(radius = 3): BurrowData | undefined {
    const p = this.save.player;
    return this.save.burrows.filter(b => Math.hypot(b.x - p.x, b.z - p.z) < radius).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }

  private nearestPartner(radius = 3): PartnerTraits | undefined {
    const p = this.save.player;
    return this.save.partners.filter(r => Math.hypot(r.x - p.x, r.z - p.z) < radius).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }

  private action(action: string): void {
    if (action === 'new') { this.newGame(); return; }
    if (action === 'load') { this.loadGame(); return; }
    if (!this.running) return;
    this.sound.unlock();
    if (action === 'save') { this.persist(true); return; }
    if (action === 'sound') { this.sound.muted = !this.sound.muted; this.toast(this.sound.muted ? 'Звук выключен' : 'Звук включён'); return; }
    if (action === 'journal' || action === 'map') { this.toggleJournal(action); return; }
    if (action === 'close') { this.overlay.classList.add('hidden'); this.dialogPartner = undefined; return; }
    if (action === 'talk' || action === 'gift' || action === 'court') { this.partnerAction(action); return; }
    if (!this.overlay.classList.contains('hidden')) return;
    const p = this.save.player;
    if (action === 'hop') { if (this.hopCooldown <= 0) { this.hopCooldown = 0.4; this.sound.play('hop'); this.player.root.position.y = 0.35; } return; }
    if (action === 'interact') {
      const partner = this.nearestPartner();
      if (partner) { this.openPartner(partner); return; }
      const r = this.world.nearestResource(p.x, p.z, 2.3);
      if (r) { this.world.harvest(r, this.save.clock); this.save.inventory[r.kind]++; this.sound.play('pickup'); this.toast(`Собрано: ${FOOD[r.kind].label.toLowerCase()} ${FOOD[r.kind].emoji}`); return; }
      this.toast('Рядом нет кролика или еды.'); return;
    }
    if (action === 'eat') {
      const kind = (Object.keys(FOOD) as FoodKind[]).filter(k => this.save.inventory[k] > 0).sort((a, b) => FOOD[b].nutrition - FOOD[a].nutrition)[0];
      if (!kind) { this.toast('Запасы пусты. Найди растения и нажми E.'); return; }
      this.save.inventory[kind]--; p.hunger = clamp(p.hunger + FOOD[kind].nutrition, 0, 100); p.bladder = clamp(p.bladder + 5, 0, 100);
      this.sound.play('eat'); this.toast(`Ты съела: ${FOOD[kind].label.toLowerCase()}.`); return;
    }
    if (action === 'dig') {
      const b = this.nearestBurrow(3.4);
      if (b) {
        if (b.depth >= 4) { this.toast('Эта нора уже достаточно просторная.'); return; }
        if (p.energy < 12) { this.toast('Слишком мало сил, чтобы расширить нору.'); return; }
        b.depth++; b.bedding++; p.energy -= 12; this.burrowMeshes.get(b.id)?.removeFromParent(); this.addBurrow(b);
        this.sound.play('dig'); this.toast(`Нора расширена до уровня ${b.depth}. Здесь безопаснее крольчатам.`); return;
      }
      if (p.energy < 25) { this.toast('Для новой норы нужно больше сил.'); return; }
      const id = Math.max(0, ...this.save.burrows.map(v => v.id)) + 1;
      const burrow: BurrowData = { id, x: p.x, z: p.z, depth: 1, stores: 0, bedding: 1, isHome: false };
      this.save.burrows.push(burrow); this.addBurrow(burrow); p.energy -= 25; this.sound.play('dig'); this.toast('Новая нора готова. Теперь можно прятаться и спать.'); return;
    }
    if (action === 'hide') {
      const b = this.nearestBurrow();
      if (!b && !p.hidden) { this.toast('Чтобы спрятаться, подойди к норе.'); return; }
      p.hidden = !p.hidden; this.toast(p.hidden ? 'Ты скрылась в норе. Хищники потеряли след.' : 'Ты вышла из норы.'); return;
    }
    if (action === 'sleep') {
      const b = this.nearestBurrow();
      if (!b) { this.toast('Спать безопасно только рядом с норой.'); return; }
      this.save.clock += 330; p.age += 330 / 1440;
      if (this.save.pregnancy) { this.save.pregnancy.progress += 330 / 1440; if (this.save.pregnancy.progress >= 1.2) this.giveBirth(); }
      for (const kit of this.save.kits) if (kit.alive) kit.age += 330 / 1440;
      p.energy = clamp(p.energy + 65, 0, 100); p.hunger = clamp(p.hunger - 17, 0, 100); p.bladder = clamp(p.bladder + 15, 0, 100);
      p.health = clamp(p.health + 8, 0, 100); this.toast('Ты выспалась в уютной норе. Прошло несколько часов.'); return;
    }
    if (action === 'relieve') { if (p.hidden) { this.toast('Сначала выйди из норы.'); return; } p.bladder = 0; this.toast('Потребность удовлетворена. Можно вернуться к делам.'); return; }
    if (action === 'feed') { this.feedKits(); return; }
  }

  private openPartner(p: PartnerTraits): void {
    this.dialogPartner = p;
    const score = partnerScore(p, this.save.player.genes);
    const preference = { speed: 'быстроту', vitality: 'здоровье', 'rare-coat': 'редкий окрас', bond: 'близость и доверие' }[p.preference];
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="dialog-card"><div class="eyebrow">ВСТРЕЧА В ЛЕСУ</div><h2>${p.name}</h2><p>${p.temperament} крол · семья: ${p.familySize} · ценит ${preference}</p><div class="gene-list"><span>Окрас: ${this.coatName(p.genes.coat)}</span><span>Скорость: ${'◆'.repeat(p.genes.speed)}</span><span>Здоровье: ${'◆'.repeat(p.genes.vitality)}</span><span>Доверие: ${fmt(p.trust)}/100</span><span>Совместимость: ${fmt(score)}/100</span></div><div class="dialog-actions"><button data-action="talk">Поговорить</button><button data-action="gift">Подарить еду</button><button class="primary" data-action="court">Предложить создать семью</button></div><button class="text-button" data-action="close">Вернуться в лес</button></div>`;
  }

  private partnerAction(action: string): void {
    const p = this.dialogPartner; if (!p) return;
    if (action === 'talk') { p.trust = clamp(p.trust + 8, 0, 100); this.sound.play('chirp'); this.toast(`${p.name} стал доверять тебе немного больше.`); }
    if (action === 'gift') {
      const kind = (Object.keys(FOOD) as FoodKind[]).find(k => this.save.inventory[k] > 0);
      if (!kind) { this.toast('В запасах нет еды для подарка.'); return; }
      this.save.inventory[kind]--; p.trust = clamp(p.trust + (kind === 'carrot' || kind === 'cabbage' ? 21 : 13), 0, 100);
      this.sound.play('pickup'); this.toast(`${p.name} оценил подарок и доверяет тебе больше.`);
    }
    if (action === 'court') {
      if (this.save.pregnancy) { this.toast('Ты уже ждёшь крольчат.'); return; }
      const score = partnerScore(p, this.save.player.genes);
      if (score < 55) { p.trust = clamp(p.trust + 3, 0, 100); this.toast(`${p.name} пока не готов. Узнай его лучше и укрепи доверие.`); return; }
      this.save.pregnancy = { fatherId: p.id, progress: 0 };
      this.sound.play('baby'); this.overlay.classList.add('hidden'); this.dialogPartner = undefined;
      this.toast(`Ты и ${p.name} стали парой. Скоро в семье появятся крольчата!`); return;
    }
    this.openPartner(p);
  }

  private giveBirth(): void {
    const pregnancy = this.save.pregnancy; if (!pregnancy) return;
    const father = this.save.partners.find(p => p.id === pregnancy.fatherId);
    const burrow = this.nearestBurrow(20) || this.save.burrows.find(b => b.isHome) || this.save.burrows[0];
    if (!father || !burrow) { this.save.pregnancy = null; return; }
    const count = this.rng.int(2, 5);
    for (let i = 0; i < count; i++) {
      const id = Math.max(0, ...this.save.kits.map(k => k.id)) + 1;
      const name = this.rng.pick(this.rng.chance(0.5) ? femaleNames : maleNames);
      const kit: KitData = { id, name, genes: this.factory.inherit(this.save.player.genes, father.genes), age: 0, hunger: 85, health: 100, father: father.name, burrowId: burrow.id, alive: true };
      this.save.kits.push(kit); this.addKit(kit);
    }
    this.save.stats.births += count; this.save.pregnancy = null;
    this.sound.play('baby'); this.toast(`Родились крольчата: ${count}! Они ждут заботы у норы.`);
    this.persist(false);
  }

  private feedKits(): void {
    const b = this.nearestBurrow(4);
    if (!b) { this.toast('Подойди к норе с крольчатами.'); return; }
    const young = this.save.kits.filter(k => k.alive && k.age < 3 && k.burrowId === b.id);
    if (!young.length) { this.toast('Здесь пока нет маленьких крольчат.'); return; }
    const kind = (Object.keys(FOOD) as FoodKind[]).find(k => this.save.inventory[k] > 0);
    if (!kind) { this.toast('Сначала собери еду для семьи.'); return; }
    this.save.inventory[kind]--;
    for (const kit of young) { kit.hunger = clamp(kit.hunger + FOOD[kind].nutrition + 12, 0, 100); kit.health = clamp(kit.health + 6, 0, 100); }
    this.sound.play('baby'); this.toast(`Ты покормила ${young.length} крольчат. Их здоровье укрепилось.`);
  }

  private coatName(coat: string): string { return ({ cream: 'кремовый', brown: 'бурый', gray: 'серый', black: 'чёрный', white: 'белый' } as Record<string, string>)[coat] || coat; }

  private updateHud(threat = Infinity): void {
    const p = this.save.player;
    const weather = { clear: '☀ Ясно', rain: '☂ Дождь', mist: '☁ Туман' }[this.save.weather];
    const biome = { forest: 'Лес', meadow: 'Луг', swamp: 'Болото', garden: 'Огород' }[this.world.biomeAt(p.x, p.z)];
    const bar = (label: string, value: number, color: string, icon: string) => `<div class="stat"><span>${icon} ${label}</span><div class="meter"><i style="width:${fmt(value)}%;background:${color}"></i></div><b>${fmt(value)}</b></div>`;
    const foods = (Object.keys(FOOD) as FoodKind[]).map(k => `<span title="${FOOD[k].label}">${FOOD[k].emoji} ${this.save.inventory[k]}</span>`).join('');
    const young = this.save.kits.filter(k => k.alive && k.age < 3);
    this.hud.innerHTML = `<div class="status-card"><div class="card-heading">СОСТОЯНИЕ <span>${p.hidden ? '● В НОРЕ' : threat < 8 ? '● ОПАСНОСТЬ' : '● В ЛЕСУ'}</span></div>${bar('Сытость', p.hunger, '#bdcf79', '✿')}${bar('Силы', p.energy, '#93c5ab', '◆')}${bar('Здоровье', p.health, '#dc9f9a', '♥')}${bar('Нужда', p.bladder, '#c7a8cc', '◌')}<div class="inventory"><b>ЗАПАСЫ</b><div>${foods}</div></div></div><div class="family-card"><div class="card-heading">МОЯ СЕМЬЯ</div><strong>${this.save.kits.filter(k => k.alive).length} <small>крольчат</small></strong><span>${young.length ? `${young.length} малышей нуждаются в заботе` : this.save.pregnancy ? `Беременность: ${fmt(this.save.pregnancy.progress / 1.2 * 100)}%` : 'Найди партнёра и создай семью'}</span><div class="family-line"><span>Выросли: ${this.save.stats.grown}</span><span>Норы: ${this.save.burrows.length}</span></div></div>`;
    const info = this.app.querySelector('#world-info');
    if (info) info.innerHTML = `<span>◷ День ${this.save.day} · ${this.timeText()}</span><span>✿ ${this.season()}</span><span>${weather}</span><span>⌁ ${biome}</span>`;
    const partner = this.nearestPartner(); const resource = this.world.nearestResource(p.x, p.z, 2.3); const burrow = this.nearestBurrow();
    this.prompt.innerHTML = partner ? `<kbd>E</kbd> Поговорить: ${partner.name}` : resource ? `<kbd>E</kbd> Собрать: ${FOOD[resource.kind].label}` : burrow ? `<kbd>H</kbd> ${p.hidden ? 'Выйти из норы' : 'Спрятаться в норе'} &nbsp; <kbd>R</kbd> Спать &nbsp; <kbd>B</kbd> Расширить` : '';
  }

  private toggleJournal(mode: string): void {
    if (!this.journal.classList.contains('hidden') && this.journal.dataset.mode === mode) { this.journal.classList.add('hidden'); return; }
    this.journal.dataset.mode = mode; this.journal.classList.remove('hidden');
    if (mode === 'map') {
      this.journal.innerHTML = '<div class="journal-head"><h2>Карта леса</h2><button data-action="map">×</button></div><p>Точка в центре — ты. Круги показывают знакомые места.</p>';
      this.journal.append(this.mapCanvas); this.drawMap();
    } else {
      const kits = this.save.kits.filter(k => k.alive).map(k => `<div class="kit-row"><b>${k.name}</b><span>${k.age < 3 ? `малыш · сытость ${fmt(k.hunger)}% · здоровье ${fmt(k.health)}%` : 'взрослый кролик'} · отец ${k.father}</span></div>`).join('') || '<p>Пока крольчат нет. Знакомься с кролами в лесу.</p>';
      this.journal.innerHTML = `<div class="journal-head"><h2>Лесной дневник</h2><button data-action="journal">×</button></div><div class="journal-stat"><span>День ${this.save.day}</span><span>${this.season()}</span><span>Родились: ${this.save.stats.births}</span><span>Выросли: ${this.save.stats.grown}</span></div><h3>Семья</h3>${kits}<h3>Норы</h3>${this.save.burrows.map(b => `<div class="kit-row"><b>${b.isHome ? 'Родная нора' : `Нора ${b.id}`}</b><span>Уровень ${b.depth} · ${b.depth >= 3 ? 'защищённая' : 'неглубокая'}</span></div>`).join('')}<h3>Как выжить</h3><p>Собирай растения, отдыхай в норе, убегай от хищников. Партнёры ценят разные гены и доверие. Корми крольчат, пока они не повзрослеют.</p>`;
    }
  }

  private drawMap(): void {
    const ctx = this.mapCanvas.getContext('2d')!, s = 420, step = 7;
    ctx.clearRect(0, 0, s, s);
    for (let y = 0; y < s; y += step) for (let x = 0; x < s; x += step) {
      const wx = (x / s - 0.5) * 220, wz = (y / s - 0.5) * 220;
      ctx.fillStyle = { forest: '#426e51', meadow: '#88a969', swamp: '#5d8c80', garden: '#b69b66' }[this.world.biomeAt(wx, wz)];
      ctx.fillRect(x, y, step, step);
    }
    for (const l of this.world.landmarks) {
      const x = (l.x / 220 + 0.5) * s, y = (l.z / 220 + 0.5) * s;
      ctx.fillStyle = '#f8e9cc'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '11px sans-serif'; ctx.fillText(l.label, x + 8, y + 4);
    }
    for (const b of this.save.burrows) {
      ctx.fillStyle = '#513d2b'; ctx.beginPath(); ctx.arc((b.x / 220 + 0.5) * s, (b.z / 220 + 0.5) * s, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#24382b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc((this.save.player.x / 220 + 0.5) * s, (this.save.player.z / 220 + 0.5) * s, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  private persist(notify: boolean): void {
    this.save.harvested = this.world.resources.filter(r => !r.available).map(r => r.id);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); if (notify) { this.sound.play('save'); this.toast('Игра сохранена в этом браузере.'); } }
    catch { if (notify) this.toast('Не удалось сохранить игру: хранилище браузера недоступно.'); }
  }

  private toast(message: string): void {
    this.save?.messages.push(message); if (this.save?.messages.length > 30) this.save.messages.shift();
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
    this.toastBox.append(el); setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 350); }, 4100);
  }

  private gameOver(): void {
    this.running = false;
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="dialog-card"><div class="eyebrow">ЛЕС ПОМНИТ КАЖДУЮ ИСТОРИЮ</div><h2>История завершилась</h2><p>Ты прожила ${this.save.day} дней, дала жизнь ${this.save.stats.births} крольчатам и вырастила ${this.save.stats.grown} из них.</p><div class="dialog-actions"><button class="primary" data-action="new">Начать новую историю</button><button data-action="load">Вернуться к сохранению</button></div></div>`;
  }
}
