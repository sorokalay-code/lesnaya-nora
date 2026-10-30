import * as THREE from 'three';
import { Soundscape } from './Audio';
import { FamilyMember, Hawk, RabbitActor, RabbitFactory, Predator, partnerScore } from './Entities';
import { animateRabbit, createRabbit, makeBurrow, makeNest, setRabbitAction, type RabbitAction, type RabbitRig } from './Models';
import { Random } from './Random';
import { Underground } from './Underground';
import { World } from './World';
import { CropSystem, FoodStore, SeasonSystem, SurvivalSystem, WasteSystem } from './Systems';
import { BurrowTraffic } from './BurrowTraffic';
import { FOOD, type BurrowData, type FoodKind, type KitData, type NestData, type PartnerTraits, type SaveData, type Season, type Weather } from './types';

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
  private seasons!:SeasonSystem;
  private survival!:SurvivalSystem;
  private waste!:WasteSystem;
  private crops!:CropSystem;
  private store!:FoodStore;
  private rng!: Random;
  private factory!: RabbitFactory;
  private world!: World;
  private player!: RabbitRig;
  private save!: SaveData;
  private rabbits: RabbitActor[] = [];
  private families: FamilyMember[] = [];
  private predators: Predator[] = [];
  private hawks:Hawk[]=[];
  private traffic!:BurrowTraffic;
  private burrowMeshes = new Map<number, THREE.Group>();
  private kitMeshes = new Map<number, RabbitRig>();
  private nestMeshes = new Map<number, THREE.Group>();
  private tunnel?: Underground;
  private tunnels=new Map<string,Underground>();
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
  private furCooldown = 0;
  private footstepAt = 0;
  private running = false;
  private dialogPartner?: PartnerTraits;
  private mating?:{fatherId:number;until:number};
  private dialogKit?: KitData;
  private overlay!: HTMLElement;
  private hud!: HTMLElement;
  private prompt!: HTMLElement;
  private toastBox!: HTMLElement;
  private mapCanvas!: HTMLCanvasElement;
  private journal!: HTMLElement;
  private dialog!: HTMLElement;
  private controls!:HTMLElement;
  private settings!:HTMLElement;
  private showControls=true;

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
    layer.innerHTML = `<div class="topbar"><div class="brand"><span class="brand-icon">✦</span><span>ЛЕСНАЯ НОРА<small>история дикой крольчихи</small></span></div><div id="world-info" class="world-info"></div><div class="top-actions"><button data-action="map" title="Карта (M)">◈ Карта</button><button data-action="journal" title="Дневник (J)">☰ Дневник</button><button data-action="save" title="Сохранить (F5)">▣ Сохранить</button><button data-action="sound" title="Звук">♪</button><button data-action="settings" title="Настройки">⚙</button></div></div>
      <div id="hud" class="hud"></div><div id="prompt" class="prompt"></div><div id="toast" class="toast-box"></div>
      <div id="controls" class="controls"><b>Управление</b><span>WASD — движение от камеры · Shift — бег · мышь — камера</span><span>E — общаться/собрать · G — еда · V — пить · B — копать · Z/X — глубже/выше · H — войти/выйти · Q/T — корни/кража · C — вылизаться · N — гнездо · U — пух · R — сон · F — молоко · Y — овощи детям · K/O — припасы</span></div>
      <div id="settings" class="settings-panel hidden"></div><div id="journal" class="journal hidden"></div><div id="dialog" class="dialog-panel hidden"></div><div id="overlay" class="overlay"></div>`;
    this.app.append(layer);
    this.overlay = layer.querySelector('#overlay')!; this.hud = layer.querySelector('#hud')!;
    this.prompt = layer.querySelector('#prompt')!; this.toastBox = layer.querySelector('#toast')!;
    this.journal = layer.querySelector('#journal')!;
    this.dialog = layer.querySelector('#dialog')!;
    this.controls=layer.querySelector('#controls')!;this.settings=layer.querySelector('#settings')!;
    this.showControls=localStorage.getItem('lesnaya-nora-show-controls')!=='false';
    this.controls.classList.toggle('hidden',!this.showControls);
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
      const map: Record<string, string> = { KeyE: 'interact', KeyG: 'eat', KeyV: 'drink', KeyB: 'dig', KeyZ:'down', KeyX:'up',KeyH: 'hide',KeyQ:'roots',KeyT:'steal',KeyC:'groom',KeyK:'store',KeyO:'retrieve',KeyY:'feed-vegetables', KeyN:'nest', KeyU:'fur', KeyR: 'sleep', KeyP: 'relieve', KeyF: 'feed', Space: 'hop' };
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
    this.overlay.innerHTML = `<div class="start-card"><div class="eyebrow">✦ ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div><h1>Лесная<br><em>нора</em></h1><p>Один лес. Тысячи историй. Найди свой дом, вырасти семью и проживи жизнь дикой крольчихи.</p><label class="start-season">Начать с сезона <select id="start-season"><option value="0">Весна — много травы</option><option value="1">Лето — тепло и изобилие</option><option value="2">Осень — пора запасать</option><option value="3">Зима — суровое выживание</option></select></label><div class="start-actions"><button class="primary" data-action="new">Новая история <span>→</span></button>${hasSave ? '<button class="secondary" data-action="load">Продолжить сохранение</button>' : ''}</div><div class="start-foot">Генерируемый мир · наследование генов · смена сезонов · семейная жизнь</div></div>`;
  }

  private newGame(): void {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const seasonIndex=Number(this.overlay.querySelector<HTMLSelectElement>('#start-season')?.value??0);
    const startDay=1+Math.max(0,Math.min(3,seasonIndex))*6;
    this.rng = new Random(seed + 53); this.factory = new RabbitFactory(this.rng);
    this.save = { version: 1, seed, clock: (startDay-1)*1440+7*60, day: startDay,
      player: { x: 0, z: 0, genes: { coat: 'cream', ear: 1.1, speed: 3, vitality: 4, size: 1 }, hunger: 85, thirst: 85, bodyTemp: 38.5, energy: 90, bladder: 15, health: 100, age: 0, hidden: false,dirtiness:0,poison:0,milk:35 },
      inventory: { clover: 2, carrot: 0, cabbage: 0, mushroom: 0, berries: 0,toadstool:0,bitterleaf:0,acorn:0 },
      burrows: [{ id: 1, x: 2.5, z: 2.5, depth: 1, stores: 0, bedding: 1, isHome: true,storedFood:{} }], nests: [], materials: {grass:0,twigs:0,fur:0}, underground:null, kits: [],
      partners: this.factory.partners(16), harvested: [], pregnancy: null,
      stats: { births: 0, grown: 0, survived: 0, generations: 1 }, weather: 'clear', messages: [],waste:[] };
    this.setupWorld(); this.overlay.classList.add('hidden'); this.running = true; this.sound.unlock();
    this.toast('На поляне ждёт твоя первая нора. Исследуй лес и найди партнёра.');
  }

  private loadGame(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) throw new Error('Сохранение не найдено');
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed.version !== 1 || !Number.isFinite(parsed.seed) || !Array.isArray(parsed.burrows) || !Array.isArray(parsed.partners)) throw new Error('Файл сохранения повреждён');
      parsed.player.thirst ??= 85; parsed.player.bodyTemp ??= 38.5;
      parsed.player.dirtiness??=0;parsed.player.poison??=0;parsed.player.milk??=35;
      for(const kind of Object.keys(FOOD) as FoodKind[])parsed.inventory[kind]??=0;
      parsed.waste??=[];
      parsed.burrows.forEach(b=>{b.storedFood??={};});
      parsed.nests ??= []; parsed.materials ??= {grass:0,twigs:0,fur:0}; parsed.underground ??= null;
      if(parsed.underground)parsed.underground.level??=0;
      parsed.kits.forEach(k=>{k.command??='stay';});
      this.save = parsed; this.rng = new Random(parsed.seed + 53); this.factory = new RabbitFactory(this.rng);
      this.setupWorld(); this.overlay.classList.add('hidden'); this.running = true; this.sound.unlock();
      this.toast('История продолжена. Добро пожаловать домой!');
    } catch (err) { this.toast(err instanceof Error ? err.message : 'Не удалось загрузить игру'); }
  }

  private setupWorld(): void {
    this.scene.clear(); this.burrowMeshes.clear(); this.kitMeshes.clear(); this.nestMeshes.clear(); this.tunnel=undefined;this.tunnels.clear();
    this.scene.background = new THREE.Color(0xb9d3ba);
    this.scene.add(this.ambient);
    this.sun.position.set(25, 45, 22); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 38;
    this.sun.shadow.bias = -0.0004; this.scene.add(this.sun);
    this.world = new World(this.scene, this.save.seed); this.world.setRain();
    this.seasons=new SeasonSystem(this.save.seed);
    this.survival=new SurvivalSystem(this.save,this.rng);
    this.waste=new WasteSystem(this.scene,this.save);
    this.crops=new CropSystem(this.rng);
    this.store=new FoodStore(this.save);
    this.traffic=new BurrowTraffic(this.rng);
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
    for (let i = 0; i < 22; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(27, 82);
      const x=i===0?34:i===1?-35:Math.cos(a)*d;
      const z=i===0?31:i===1?29:Math.sin(a)*d;
      const kind = i<2 ? 'dog' : i % 4 === 0 ? 'wolf' : 'fox';
      const predator = new Predator(kind, x, z, this.rng); this.predators.push(predator); this.scene.add(predator.root);
    }
    this.hawks=[[12,24],[-24,8],[29,-15]].map(([x,z])=>new Hawk(x,z,this.rng));
    for(const hawk of this.hawks)this.scene.add(hawk.root,hawk.shadow);
    this.save.burrows.forEach(b => this.addBurrow(b));
    for(const b of this.save.burrows){
      this.getTunnel(b,0);
      for(let level=1;level<=2;level++)if(b.cells?.some(c=>c.startsWith(`${level}:`)))this.getTunnel(b,level);
    }
    this.save.nests.forEach(n => this.addNest(n));
    this.save.kits.filter(k => k.alive).forEach(k => this.addKit(k));
    if(this.save.underground){const b=this.save.burrows.find(v=>v.id===this.save.underground?.burrowId);if(b)this.enterUnderground(b,true);}
    this.updateHud();
  }

  private addBurrow(b: BurrowData): void {
    const mesh = makeBurrow(b.depth); mesh.position.set(b.x, 0.02, b.z); this.scene.add(mesh); this.burrowMeshes.set(b.id, mesh);
    this.world.addGroundHole(b.x,b.z);
  }

  private addNest(n: NestData): void {
    const mesh=makeNest();mesh.position.set(n.x,0.04,n.z);
    this.nestMeshes.set(n.id,mesh);
    if(n.burrowId===null)this.scene.add(mesh);
    else {const b=this.save.burrows.find(v=>v.id===n.burrowId);if(b)this.getTunnel(b,n.level??0).group.add(mesh);}
  }

  private getTunnel(b:BurrowData,level:number):Underground{
    const key=`${b.id}:${level}`;let tunnel=this.tunnels.get(key);
    if(!tunnel){tunnel=new Underground(b,level,this.scene,(x,z)=>this.world.biomeAt(x,z)==='garden');this.tunnels.set(key,tunnel);}
    return tunnel;
  }

  private enterUnderground(b: BurrowData, restoring=false): void {
    this.tunnel=this.getTunnel(b,restoring?this.save.underground?.level??0:0);
    if(!restoring)this.save.underground={burrowId:b.id,x:0,z:0,level:0};
    this.save.player.hidden=true;this.camera.position.set(b.x,-1,b.z+5);
    this.toast('Ты спустилась в нору. Повернись к стене и нажми B, чтобы копать ход. H — выйти.');
  }

  private leaveUnderground(): void {
    if(!this.tunnel)return;
    this.save.player.x=this.tunnel.burrow.x;this.save.player.z=this.tunnel.burrow.z;
    this.save.underground=null;this.save.player.hidden=false;this.tunnel=undefined;
    this.camera.position.set(this.save.player.x,5,this.save.player.z+7);
    this.toast('Ты выбралась на поверхность.');
  }

  private changeLevel(delta:number):void {
    if(!this.tunnel||!this.save.underground){this.toast('Менять глубину можно только в норе.');return;}
    const u=this.save.underground,level=this.tunnel.level+delta;
    if(level<0||level>2){this.toast('На этой глубине дальше не пройти.');return;}
    if(delta<0&&!this.tunnel.hasCell(level,u.x,u.z)){this.toast('Поднимись к вертикальному ходу, где есть выход наверх.');return;}
    if(delta>0){
      if(this.save.player.energy<12){this.toast('Для шахты нужно больше сил.');return;}
      if(!this.tunnel.hasCell(level,u.x,u.z)){this.tunnel.makeShaft(level,u.x,u.z);this.save.player.energy-=12;this.sound.play('dig');}
    }
    const b=this.tunnel.burrow;this.tunnel=this.getTunnel(b,level);this.tunnel.openShaftCell(u.x,u.z);u.level=level;
    this.toast(`Ты ${delta>0?'спустилась глубже':'поднялась выше'}. Уровень ${level+1} из 3.`);
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
    this.elapsed += dt; this.eventCooldown = Math.max(0, this.eventCooldown - dt); this.hopCooldown = Math.max(0, this.hopCooldown - dt);this.furCooldown=Math.max(0,this.furCooldown-dt);
    const p = this.save.player;
    const oldDay = this.save.day;
    this.save.clock += dt * 6;
    this.save.day = Math.floor(this.save.clock / 1440) + 1;
    p.age += dt * 6 / 1440;
    if (this.save.day > oldDay) this.newDay();
    const night = this.isNight();
    const moving = this.movePlayer(dt);
    const air=this.airTemperature();
    const nearbyNest=this.nearestNest(2.8);
    const warmed=this.tunnel!==undefined || nearbyNest!==undefined;
    this.survival.tick(dt,this.elapsed,moving,air,warmed,()=>this.makeWaste('diarrhea'));
    this.waste.update(dt,this.player.root.position.x,this.player.root.position.y,this.player.root.position.z);
    if (p.health <= 0) { this.gameOver(); return; }
    if (this.save.pregnancy) {
      this.save.pregnancy.progress += dt * 6 / 1440;
      if (this.save.pregnancy.progress >= 1.2) this.giveBirth();
    }
    this.updateKits(dt);
    for (const rabbit of this.rabbits) rabbit.update(dt, this.elapsed, p.x, p.z);
    if(this.mating){
      const actor=this.rabbits.find(r=>r.data.id===this.mating!.fatherId);
      if(actor){actor.rig.root.position.set(p.x+Math.sin(this.player.root.rotation.y)*0.28,0.4,p.z+Math.cos(this.player.root.rotation.y)*0.28);actor.rig.root.rotation.y=this.player.root.rotation.y;}
      if(this.elapsed>=this.mating.until)this.mating=undefined;
    }
    for (const member of this.families) member.update(this.elapsed,dt);
    for(const tunnel of this.tunnels.values())tunnel.group.visible=(this.tunnel===tunnel)||Math.hypot(tunnel.burrow.x-p.x,tunnel.burrow.z-p.z)<42;
    let closestThreat = Infinity;
    for (const predator of this.predators) {
      if (predator.update(dt, this.elapsed, p.x, p.z, p.hidden, !night,p.dirtiness/100,this.seasons.predatorActivity(this.save.day))) this.predatorAttack(predator.kind);
      this.threatenKits(predator);
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }
    for(const event of this.traffic.update(dt,this.elapsed,night,this.predators,this.rabbits,this.save,this.tunnel)){
      if(event.type==='fox-entered')this.toast('Лиса пробралась в неглубокую нору! Запах крольчат или отходов привлёк её.');
      if(event.type==='fox-attack')this.predatorAttack('fox');
      if(event.type==='kit-attack')this.toast(`Лиса добралась до ${event.name}. Укрепи вход и защити гнездо.`);
    }
    const exposed=!this.tunnel&&!this.world.hasCover(p.x,p.z);
    for(const hawk of this.hawks)if(hawk.update(dt,this.elapsed,p.x,p.z,exposed))this.predatorAttack('hawk');
    for(const rabbit of this.rabbits)rabbit.rig.root.visible=Math.hypot(rabbit.rig.root.position.x-p.x,rabbit.rig.root.position.z-p.z)<76;
    for(const member of this.families)member.rig.root.visible=Math.hypot(member.rig.root.position.x-p.x,member.rig.root.position.z-p.z)<76;
    for(const predator of this.predators)predator.root.visible=Math.hypot(predator.root.position.x-p.x,predator.root.position.z-p.z)<76;
    for(const hawk of this.hawks){const visible=Math.hypot(hawk.x-p.x,hawk.z-p.z)<92;hawk.root.visible=visible;hawk.shadow.visible=visible&&!this.tunnel;}
    this.world.update(this.save.clock, this.elapsed, this.save.weather,this.save.day,p.x,p.z);
    this.world.updateRain(dt, p.x, p.z,this.save.weather);
    this.sound.update(this.elapsed, night);
    this.sound.setWeather(this.save.weather,night);
    this.player.root.position.x = this.tunnel?this.tunnel.burrow.x+this.save.underground!.x:p.x; this.player.root.position.z = this.tunnel?this.tunnel.burrow.z+this.save.underground!.z:p.z;
    this.player.root.userData.baseY=this.tunnel?this.tunnel.group.position.y:0;
    this.player.root.visible = true;
    animateRabbit(this.player, this.elapsed, moving, closestThreat < 8 && !this.tunnel,dt);
    if(this.tunnel)this.tunnel.updateMarker(this.save.underground!.x,this.save.underground!.z,this.player.root.rotation.y);
    const sunAngle = ((this.save.clock % 1440) / 1440) * Math.PI * 2;
    const daylight = clamp(0.5 + 0.5 * Math.cos(sunAngle - Math.PI), 0.25, 1);
    this.sun.intensity = 0.45 + daylight * 1.55;
    this.ambient.intensity = 0.7 + daylight * 1.1;
    this.sun.position.set(Math.cos(sunAngle) * 45, Math.max(8, Math.cos(sunAngle - Math.PI) * 45), 22);
    this.sun.target.position.set(p.x, 0, p.z); this.scene.add(this.sun.target);
    this.sun.position.x += p.x; this.sun.position.z += p.z;
    const sky = new THREE.Color(this.tunnel?0x5c4e3e:this.save.weather === 'snow' ? 0xd4dfdf : this.save.weather === 'rain' ? 0x9eafb0 : night ? 0x3d5667 : 0xb9d3ba);
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(sky);
    if (this.elapsed - this.lastHud > 0.22) { this.lastHud = this.elapsed; this.updateHud(closestThreat); }
    if (this.elapsed > this.autosaveAt) { this.autosaveAt = this.elapsed + 30; this.persist(false); }
  }

  private movePlayer(dt: number): boolean {
    const p = this.save.player;
    if (!this.dialog.classList.contains('hidden')) return false;
    if(((this.player.root.userData.actionUntil as number|undefined)??0)>this.elapsed)return false;
    let forward = 0, right = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward++;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward--;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right++;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right--;
    if (!forward && !right) return false;
    const d = Math.hypot(forward, right); forward /= d; right /= d;
    const px=this.tunnel?this.tunnel.burrow.x+this.save.underground!.x:p.x;
    const pz=this.tunnel?this.tunnel.burrow.z+this.save.underground!.z:p.z;
    const viewX=px-this.camera.position.x,viewZ=pz-this.camera.position.z;
    const viewLength=Math.hypot(viewX,viewZ);
    const fx=viewLength>0.01?viewX/viewLength:Math.sin(this.yaw);
    const fz=viewLength>0.01?viewZ/viewLength:-Math.cos(this.yaw);
    const dx = fx * forward - fz * right;
    const dz = fz * forward + fx * right;
    const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && p.energy > 8;
    const speed = (sprint ? 6.2 : 3.3) * (0.82 + p.genes.speed * 0.06) * (p.energy < 15 ? 0.75 : 1);
    const desired=Math.atan2(-dx,-dz);
    const turn=Math.atan2(Math.sin(desired-this.player.root.rotation.y),Math.cos(desired-this.player.root.rotation.y));
    this.player.root.rotation.y+=clamp(turn,-dt*8,dt*8);
    const facingX=-Math.sin(this.player.root.rotation.y),facingZ=-Math.cos(this.player.root.rotation.y);
    if(this.tunnel && this.save.underground){
      const u=this.save.underground,nx=u.x+facingX*speed*dt*0.65,nz=u.z+facingZ*speed*dt*0.65;
      if(this.tunnel.canMove(nx,u.z))u.x=nx;
      if(this.tunnel.canMove(u.x,nz))u.z=nz;
    }else{
      p.x = clamp(p.x + facingX * speed * dt, -103, 103); p.z = clamp(p.z + facingZ * speed * dt, -103, 103);
    }
    if(this.elapsed>this.footstepAt){this.footstepAt=this.elapsed+(sprint?0.17:0.28);this.sound.play('step');}
    return true;
  }

  private render(): void {
    const x=this.tunnel?this.tunnel.burrow.x+this.save.underground!.x:this.save.player.x;
    const z=this.tunnel?this.tunnel.burrow.z+this.save.underground!.z:this.save.player.z;
    const baseY=this.tunnel?this.tunnel.group.position.y:0;
    const distance=this.tunnel?Math.min(this.cameraDistance,5):this.cameraDistance;
    const cameraPitch=this.tunnel?Math.max(this.pitch,0.52):this.pitch;
    const h = 1.5 + Math.sin(cameraPitch) * distance;
    const planar = Math.cos(cameraPitch) * distance;
    const wanted = new THREE.Vector3(x + Math.sin(this.yaw) * planar, baseY+h, z + Math.cos(this.yaw) * planar);
    this.camera.position.lerp(wanted, 0.13);
    this.camera.lookAt(x, baseY+0.65, z);
    this.renderer.render(this.scene, this.camera);
  }

  private isNight(): boolean { const t = this.save.clock % 1440; return t < 330 || t > 1230; }
  private season(): Season { return this.seasons.name(this.save.day); }
  private timeText(): string { const t = Math.floor(this.save.clock % 1440); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
  private airTemperature(): number {
    return this.seasons.temperature(this.save.day,this.save.clock,this.save.weather);
  }

  private nearestNest(radius=3): NestData | undefined {
    const x=this.tunnel?this.save.underground!.x:this.save.player.x;
    const z=this.tunnel?this.save.underground!.z:this.save.player.z;
    return this.save.nests.filter(n=>this.tunnel?n.burrowId===this.tunnel.burrow.id&&(n.level??0)===this.tunnel.level:n.burrowId===null)
      .filter(n=>Math.hypot(n.x-x,n.z-z)<radius)
      .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  }

  private newDay(): void {
    const previous = this.save.weather;
    this.save.weather = this.rng.pick(this.season()==='Зима'?['clear','mist','snow','snow'] as Weather[]:['clear', 'clear', 'clear', 'mist', 'rain'] as Weather[]);
    if (previous !== this.save.weather) this.toast(this.save.weather === 'rain' ? 'Пошёл дождь. В лесу пахнет мокрой листвой.' : this.save.weather === 'mist' ? 'Над лесом стелется туман.' : this.save.weather==='snow'?'Начался снегопад. Пора искать тепло.':'Небо прояснилось.');
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
        const nest=this.save.nests.find(n=>n.id===kit.nestId);
        if(!nest && this.airTemperature()<9)kit.health=clamp(kit.health-dt*0.17,0,100);
        else if(nest?.burrowId===null && this.airTemperature()<0)kit.health=clamp(kit.health-dt*0.055,0,100);
        if (kit.hunger < 12) kit.health = clamp(kit.health - dt * 0.2, 0, 100);
        else if (kit.hunger > 65) kit.health = clamp(kit.health + dt * 0.04, 0, 100);
        if (kit.health <= 0) { kit.alive = false; this.kitMeshes.get(kit.id)?.root.removeFromParent(); this.toast(`${kit.name} не пережил трудные дни. Позаботься о других крольчатах.`); continue; }
      }
      const b = this.save.burrows.find(v => v.id === kit.burrowId);
      const rig = this.kitMeshes.get(kit.id);
      if (b && rig) {
        const nest=this.save.nests.find(n=>n.id===kit.nestId);
        const undergroundNest=nest?.burrowId!==null&&nest?.burrowId!==undefined;
        rig.root.visible=true;
        if(rig.root.parent!==this.scene)this.scene.add(rig.root);
        const a = kit.id * 2.4 + this.elapsed * (kit.age >= 3 ? 0.25 : 0.1);
        const radius = kit.command==='rest'?0.7:kit.age >= 3 ? 2.5 : 1.4;
        let homeX=undergroundNest?b.x+nest!.x:nest?.x??b.x,homeZ=undergroundNest?b.z+nest!.z:nest?.z??b.z;
        if(kit.command==='follow'){homeX=this.tunnel?this.tunnel.burrow.x+this.save.underground!.x:this.save.player.x;homeZ=this.tunnel?this.tunnel.burrow.z+this.save.underground!.z:this.save.player.z;}
        if(kit.command==='stay'&&kit.stayX!==undefined&&kit.stayZ!==undefined){homeX=kit.stayX;homeZ=kit.stayZ;}
        const kitY=kit.command==='follow'?(this.tunnel?.group.position.y??0):kit.command==='stay'&&kit.stayY!==undefined?kit.stayY:undergroundNest?-6-(nest!.level??0)*3:0;
        rig.root.position.set(homeX + Math.cos(a) * radius, kitY, homeZ + Math.sin(a) * radius);
        rig.root.userData.baseY=kitY;
        rig.root.rotation.y = -a;
        rig.root.scale.setScalar(kit.age < 3 ? (0.38 + kit.age * 0.14) * kit.genes.size : kit.genes.size);
        animateRabbit(rig, this.elapsed + kit.id, kit.command!=='rest',false,dt);
      }
    }
  }

  private predatorAttack(kind: string): void {
    const p = this.save.player;
    p.health = clamp(p.health - (kind === 'hawk' ? 32:kind === 'wolf' ? 23 : 15), 0, 100);
    p.energy = clamp(p.energy - 13, 0, 100);
    this.sound.play('danger'); this.toast(`${kind === 'hawk'?'Сокол':kind === 'wolf' ? 'Волк' : kind === 'dog' ? 'Сторожевой пёс' : 'Лиса'} напал! Беги под деревья или к норе.`);
  }

  private threatenKits(predator: Predator): void {
    if (predator.attackCooldown > 0) return;
    for(const nest of this.save.nests.filter(n=>n.burrowId===null)){
      if(Math.hypot(predator.x-nest.x,predator.z-nest.z)>2)continue;
      const kit=this.save.kits.find(k=>k.alive&&k.age<3&&k.command!=='follow'&&k.nestId===nest.id);
      if(!kit)continue;
      kit.health=clamp(kit.health-24,0,100);predator.attackCooldown=9;
      this.sound.play('danger');this.toast(`Хищник нашёл наземное гнездо! ${kit.name} в опасности.`);return;
    }
    for (const burrow of this.save.burrows) {
      if (burrow.depth >= 3 || Math.hypot(predator.x - burrow.x, predator.z - burrow.z) > 1.7) continue;
      const kit = this.save.kits.find(k => k.alive && k.age < 3 && k.command!=='follow'&&k.burrowId === burrow.id && k.nestId===undefined);
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
    if(this.tunnel)return undefined;
    const p = this.save.player;
    return this.save.partners.filter(r => Math.hypot(r.x - p.x, r.z - p.z) < radius).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }

  private nearestKit(radius=2.5): KitData | undefined {
    const x=this.tunnel?this.tunnel.burrow.x+this.save.underground!.x:this.save.player.x;
    const z=this.tunnel?this.tunnel.burrow.z+this.save.underground!.z:this.save.player.z;
    return this.save.kits.filter(k=>k.alive).find(k=>{
      const mesh=this.kitMeshes.get(k.id)?.root;
      return mesh?.visible && Math.abs(mesh.position.y-(this.tunnel?.group.position.y??0))<1.5 && Math.hypot(mesh.position.x-x,mesh.position.z-z)<radius;
    });
  }

  private action(action: string): void {
    if (action === 'new') { this.newGame(); return; }
    if (action === 'load') { this.loadGame(); return; }
    if (!this.running) return;
    this.sound.unlock();
    if (action === 'save') { this.persist(true); return; }
    if (action === 'sound') { this.sound.muted = !this.sound.muted; this.toast(this.sound.muted ? 'Звук выключен' : 'Звук включён'); return; }
    if(action==='settings'){
      this.settings.classList.toggle('hidden');
      this.settings.innerHTML=`<div class="journal-head"><h2>Настройки</h2><button data-action="settings">×</button></div><button class="setting-row" data-action="toggle-controls">${this.showControls?'☑':'☐'} Показывать подсказку управления</button>`;
      return;
    }
    if(action==='toggle-controls'){
      this.showControls=!this.showControls;localStorage.setItem('lesnaya-nora-show-controls',String(this.showControls));
      this.controls.classList.toggle('hidden',!this.showControls);this.settings.innerHTML=`<div class="journal-head"><h2>Настройки</h2><button data-action="settings">×</button></div><button class="setting-row" data-action="toggle-controls">${this.showControls?'☑':'☐'} Показывать подсказку управления</button>`;return;
    }
    if (action === 'journal' || action === 'map') { this.toggleJournal(action); return; }
    if (action === 'close') { this.dialog.classList.add('hidden'); this.dialogPartner = undefined;this.dialogKit=undefined; return; }
    if (['talk','gift','court','ask-food','ask-home','ask-danger','compliment'].includes(action)) { this.partnerAction(action); return; }
    if (['child-follow','child-stay','child-rest'].includes(action)) { this.childAction(action);return;}
    if(action.startsWith('consume:')){
      const kind=action.slice(8) as FoodKind;
      if(!(kind in FOOD)||this.save.inventory[kind]<=0)return;
      this.save.inventory[kind]--;
      const poisoned=this.survival.eat(kind);
      this.sound.play('eat');this.playAction('eat',1.5);
      this.toast(poisoned?`После ${FOOD[kind].label.toLowerCase()} тебе стало плохо. Возможно, еда ядовита.`:`Ты съела: ${FOOD[kind].label.toLowerCase()}.`);
      this.dialog.classList.add('hidden');return;
    }
    if (!this.overlay.classList.contains('hidden')) return;
    const p = this.save.player;
    if(action==='down'){this.changeLevel(1);return;}
    if(action==='up'){this.changeLevel(-1);return;}
    if (action === 'hop') { if (this.hopCooldown <= 0) { this.hopCooldown = 0.4; this.sound.play('hop'); this.player.root.position.y = 0.35; } return; }
    if (action === 'interact') {
      if(!this.dialog.classList.contains('hidden')){this.dialog.classList.add('hidden');this.dialogPartner=undefined;this.dialogKit=undefined;return;}
      const child=this.nearestKit();if(child){this.openKit(child);return;}
      const partner = this.nearestPartner();
      if (partner) { this.openPartner(partner); return; }
      if(this.tunnel){this.toast('Повернись к земляной стене и нажми B, чтобы копать.');return;}
      const r = this.world.nearestResource(p.x, p.z, 2.3);
      if (r) {
        if(this.store.carried()>=this.store.capacity){this.toast('Запасы в лапах переполнены. Отнеси еду в нору (K).');return;}
        this.world.harvest(r, this.save.clock); this.save.inventory[r.kind]++;
        if(r.kind==='clover')this.save.materials.grass++;
        if(r.kind==='berries'||r.kind==='mushroom')this.save.materials.twigs++;
        this.sound.play('pickup'); this.toast(`Собрано: ${FOOD[r.kind].label.toLowerCase()} ${FOOD[r.kind].emoji}${r.kind==='clover'?' и трава':r.kind==='berries'||r.kind==='mushroom'?' и ветки':''}`); return;
      }
      this.toast('Рядом нет кролика или еды.'); return;
    }
    if (action === 'eat') {
      const items=(Object.keys(FOOD) as FoodKind[]).filter(k=>this.save.inventory[k]>0);
      if(!items.length){this.toast('Запасы пусты. Найди растения и нажми E.');return;}
      this.dialogPartner=undefined;this.dialogKit=undefined;this.dialog.classList.remove('hidden');
      this.dialog.innerHTML=`<div class="dialog-top"><div><div class="eyebrow">МОИ ЗАПАСЫ</div><h2>Что съесть?</h2></div><button data-action="close">×</button></div><p class="dialog-meta">Некоторые лесные продукты могут быть опасными. Выбирай внимательно.</p><div class="dialog-choices">${items.map(k=>`<button data-action="consume:${k}">${FOOD[k].emoji} ${FOOD[k].label} · ${this.save.inventory[k]} шт.</button>`).join('')}</div>`;return;
    }
    if(action==='drink'){
      if(this.tunnel||!this.world.nearWater(p.x,p.z)){this.toast('Подойди к пруду или воде в болоте, чтобы попить.');return;}
      p.thirst=clamp(p.thirst+54,0,100);p.bladder=clamp(p.bladder+16,0,100);this.sound.play('drink');this.toast('Прохладная вода утолила жажду.');return;
    }
    if(action==='fur'){
      if(this.furCooldown>0){this.toast('Нужно немного подождать, пока снова появится пух.');return;}
      this.furCooldown=25;p.energy=clamp(p.energy-5,0,100);this.save.materials.fur++;this.sound.play('pickup');this.playAction('pluck',1.7);this.toast('Ты собрала немного собственного пуха для гнезда.');return;
    }
    if(action==='nest'){
      const m=this.save.materials;
      if(m.grass<3||m.twigs<2||m.fur<2){this.toast(`Для гнезда нужно: трава 3 (${m.grass}), ветки 2 (${m.twigs}), пух 2 (${m.fur}).`);return;}
      if(this.nearestNest(2.5)){this.toast('Здесь уже есть гнездо. Отойди немного дальше.');return;}
      m.grass-=3;m.twigs-=2;m.fur-=2;
      const id=Math.max(0,...this.save.nests.map(n=>n.id))+1;
      const n:NestData={id,burrowId:this.tunnel?.burrow.id??null,x:this.tunnel?this.save.underground!.x:p.x,z:this.tunnel?this.save.underground!.z:p.z,quality:1,level:this.tunnel?.level};
      this.save.nests.push(n);this.addNest(n);this.sound.play('nest');this.toast(this.tunnel?'Тёплое гнездо готово в подземной камере.':'Гнездо готово. На поверхности крольчатам опаснее.');return;
    }
    if (action === 'dig') {
      if(this.tunnel){
        if(p.energy<8){this.toast('Слишком мало сил для копания.');return;}
        const result=this.tunnel.digAhead(this.save.underground!.x,this.save.underground!.z,this.player.root.rotation.y);
        if(!result.success){this.toast(result.reason??'Здесь не выкопать ход.');return;}
        p.energy-=8;this.sound.play('dig');this.toast(`Проложен новый подземный ход (${result.x}, ${result.z}).`);return;
      }
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
    if(action==='roots'||action==='steal'){
      if(!this.tunnel||!this.save.underground){this.toast('Подкопайся под огород с помощью норы.');return;}
      const x=this.tunnel.burrow.x+this.save.underground.x,z=this.tunnel.burrow.z+this.save.underground.z;
      if(!this.crops.canForage(this.world.biomeAt(x,z)==='garden',this.tunnel.level)){this.toast('Корни культур растут только под огородом на верхнем уровне норы.');return;}
      if(action==='steal'&&this.store.carried()>=this.store.capacity){this.toast('Запасы переполнены. Сначала отнеси их в нору.');return;}
      const crop=this.crops.take(x,z,this.save.clock,this.season());
      if(!crop){this.toast('Здесь корни уже обгрызены. Попробуй соседнюю клетку позже.');return;}
      if(action==='roots'){p.hunger=clamp(p.hunger+12,0,100);p.thirst=clamp(p.thirst+4,0,100);this.playAction('eat',1.3);this.toast(`Ты погрызла корни ${FOOD[crop].label.toLowerCase()} под землёй.`);}
      else{if(this.store.carried()>=this.store.capacity){this.toast('Запасы переполнены. Сначала отнеси их в нору.');return;}this.save.inventory[crop]++;this.sound.play('pickup');this.toast(`Ты утащила ${FOOD[crop].label.toLowerCase()} через подкоп. Можно отнести детям.`);}
      return;
    }
    if(action==='store'||action==='retrieve'){
      const burrow=this.tunnel?.burrow??this.nearestBurrow(4);
      if(!burrow){this.toast('Припасы можно хранить только у норы.');return;}
      const amount=action==='store'?this.store.deposit(burrow):this.store.withdraw(burrow);
      this.toast(amount?`${action==='store'?'Отложено':'Взято'} ${amount} порций еды ${action==='store'?'на зиму':'из запасов'}.`:'Сейчас нечего перекладывать.');return;
    }
    if (action === 'hide') {
      if(this.tunnel){this.leaveUnderground();return;}
      const b = this.nearestBurrow();
      if (!b) { this.toast('Чтобы спуститься под землю, подойди к норе.'); return; }
      this.enterUnderground(b);return;
    }
    if (action === 'sleep') {
      const b = this.nearestBurrow();
      if (!b&&!this.tunnel&&!this.nearestNest(2.5)) { this.toast('Спать можно в норе или у гнезда.'); return; }
      this.save.clock += 330; p.age += 330 / 1440;
      if (this.save.pregnancy) { this.save.pregnancy.progress += 330 / 1440; if (this.save.pregnancy.progress >= 1.2) this.giveBirth(); }
      for (const kit of this.save.kits) if (kit.alive) kit.age += 330 / 1440;
      p.energy = clamp(p.energy + 65, 0, 100); p.hunger = clamp(p.hunger - 17, 0, 100);p.thirst=clamp(p.thirst-20,0,100); p.bladder = clamp(p.bladder + 15, 0, 100);p.bodyTemp=clamp(p.bodyTemp+1.5,28,39);
      p.health = clamp(p.health + 8, 0, 100); this.playAction('lie',2.8);this.toast('Ты выспалась в уютной норе. Прошло несколько часов.'); return;
    }
    if (action === 'relieve') { this.makeWaste(p.poison>40?'diarrhea':p.bladder>50?'urine':'pellets');p.bladder = 0;this.playAction('defecate',1.8); this.toast('Потребность удовлетворена. Не забудь привести шерсть в порядок.'); return; }
    if(action==='groom'){this.survival.groom();this.playAction('groom',2.5);this.toast('Ты вылизала шерсть. Стало чище и спокойнее.');return;}
    if (action === 'feed') { this.feedKits(); return; }
    if(action==='feed-vegetables'){this.feedKits(true);return;}
  }

  private openPartner(p: PartnerTraits, line?: string): void {
    this.dialogPartner = p;
    this.dialogKit=undefined;
    this.journal.classList.add('hidden');
    const score = this.compatibility(p);
    const preference = { speed: 'быстроту', vitality: 'здоровье', 'rare-coat': 'редкий окрас', bond: 'близость и доверие' }[p.preference];
    this.dialog.classList.remove('hidden');
    this.dialog.innerHTML = `<div class="dialog-top"><div><div class="eyebrow">ЛЕСНОЙ РАЗГОВОР</div><h2>${p.name}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??(p.temperament==='осторожный'?'Сначала давай узнаем друг друга получше.':'Рад тебя видеть! Что хочешь узнать?')}»</p><p class="dialog-meta">${p.temperament} крол · семья: ${p.familySize} · ценит ${preference}</p><div class="gene-list"><span>Окрас: ${this.coatName(p.genes.coat)}</span><span>Скорость: ${'◆'.repeat(p.genes.speed)}</span><span>Здоровье: ${'◆'.repeat(p.genes.vitality)}</span><span>Доверие: ${fmt(p.trust)}/100</span><span>Совместимость: ${fmt(score)}/100</span></div><div class="dialog-choices"><button data-action="ask-home">Как живёт твоя семья?</button><button data-action="ask-food">Где искать еду и воду?</button><button data-action="ask-danger">Чего ты опасаешься?</button><button data-action="compliment">Ты мне нравишься</button><button data-action="gift">Подарить еду</button><button class="primary" data-action="court">Предложить создать семью</button></div>`;
  }

  private partnerAction(action: string): void {
    const p = this.dialogPartner; if (!p) return;
    let line='';
    if(action==='ask-home'){p.trust=clamp(p.trust+5,0,100);line=p.familySize>2?'У нас большая семья. Самое важное — возвращаться в гнездо до холодной ночи.':'Моя семья невелика, зато мы всегда держимся рядом с домом.';}
    if(action==='ask-food'){p.trust=clamp(p.trust+4,0,100);line='На лугу много клевера, а в огороде морковь. У пруда можно попить — только прислушивайся к шорохам.';}
    if(action==='ask-danger'){p.trust=clamp(p.trust+6,0,100);line='Лисы особенно смелеют в сумерках. Глубокая нора и сухое гнездо спасают малышей.';}
    if(action==='compliment'){p.trust=clamp(p.trust+(p.preference==='bond'?13:8),0,100);line=p.temperament==='осторожный'?'Спасибо... Мне приятно, что ты это сказала.':'Ты тоже мне нравишься. Я рад нашей встрече!';}
    if (action === 'gift') {
      const kind = (Object.keys(FOOD) as FoodKind[]).find(k => this.save.inventory[k] > 0);
      if (!kind) { this.openPartner(p,'В твоих запасах пока нет подарка.'); return; }
      this.save.inventory[kind]--; p.trust = clamp(p.trust + (kind === 'carrot' || kind === 'cabbage' ? 21 : 13), 0, 100);
      this.sound.play('pickup'); line=`Спасибо за ${FOOD[kind].label.toLowerCase()}! Ты умеешь заботиться о близких.`;
    }
    if (action === 'court') {
      if (this.save.pregnancy) { this.openPartner(p,'Ты уже ждёшь крольчат. Сейчас надо позаботиться о них.'); return; }
      const score = this.compatibility(p);
      if (score < 55) { p.trust = clamp(p.trust + 3, 0, 100); this.openPartner(p,'Я пока не готов. Давай ещё поговорим и лучше узнаем друг друга.'); return; }
      this.save.pregnancy = { fatherId: p.id, progress: 0 };
      this.playAction('mate',3.1);this.mating={fatherId:p.id,until:this.elapsed+3.1};
      const actor=this.rabbits.find(r=>r.data.id===p.id);if(actor)setRabbitAction(actor.rig,'mate',this.elapsed+p.id,3.1);
      this.sound.play('baby'); this.dialog.classList.add('hidden'); this.dialogPartner = undefined;
      this.toast(`Ты и ${p.name} стали парой. Скоро в семье появятся крольчата!`); return;
    }
    this.sound.play('chirp');this.openPartner(p,line);
  }

  private openKit(kit: KitData,line?:string):void {
    this.dialogKit=kit;this.dialogPartner=undefined;this.dialog.classList.remove('hidden');
    this.journal.classList.add('hidden');
    this.dialog.innerHTML=`<div class="dialog-top"><div><div class="eyebrow">МОЯ СЕМЬЯ</div><h2>${kit.name}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??(kit.age<3?'Мама, побудь со мной!':'Я уже вырос, но мне всё ещё хорошо рядом с тобой.')}»</p><p class="dialog-meta">${kit.age<3?'Крольчонок':'Взрослый кролик'} · сытость ${fmt(kit.hunger)}% · здоровье ${fmt(kit.health)}%</p><div class="dialog-choices"><button data-action="child-follow">Иди за мной</button><button data-action="child-stay">Жди здесь</button><button data-action="child-rest">Отдыхай в гнезде</button></div>`;
  }

  private childAction(action:string):void {
    const kit=this.dialogKit;if(!kit)return;
    kit.command=action==='child-follow'?'follow':action==='child-stay'?'stay':'rest';
    const rig=this.kitMeshes.get(kit.id);
    if(rig){if(kit.command==='follow')rig.root.userData.actionUntil=0;else setRabbitAction(rig,kit.command==='rest'?'lie':'sit',this.elapsed+kit.id,3600);}
    if(kit.command==='stay'){
      const pos=this.kitMeshes.get(kit.id)?.root.position;
      kit.stayX=pos?.x;kit.stayZ=pos?.z;kit.stayY=pos?.y;
    }
    this.sound.play('baby');this.openKit(kit,action==='child-follow'?'Хорошо, пойду за тобой!':action==='child-stay'?'Я подожду здесь.':'Свернусь клубочком и отдохну.');
  }

  private giveBirth(): void {
    const pregnancy = this.save.pregnancy; if (!pregnancy) return;
    const father = this.save.partners.find(p => p.id === pregnancy.fatherId);
    const burrow = this.nearestBurrow(20) || this.save.burrows.find(b => b.isHome) || this.save.burrows[0];
    if (!father || !burrow) { this.save.pregnancy = null; return; }
    const nest=this.nearestNest(6)??this.save.nests.find(n=>n.burrowId===burrow.id);
    const count = this.rng.int(2, 5);
    for (let i = 0; i < count; i++) {
      const id = Math.max(0, ...this.save.kits.map(k => k.id)) + 1;
      const name = this.rng.pick(this.rng.chance(0.5) ? femaleNames : maleNames);
      const kit: KitData = { id, name, genes: this.factory.inherit(this.save.player.genes, father.genes), age: 0, hunger: 85, health: 100, father: father.name, burrowId: burrow.id, nestId:nest?.id, command:'stay',alive: true };
      this.save.kits.push(kit); this.addKit(kit);
    }
    this.save.stats.births += count; this.save.pregnancy = null;
    this.sound.play('baby'); this.toast(`Родились крольчата: ${count}! ${nest?`Они устроились в ${nest.burrowId===null?'наземном':'подземном'} гнезде.`:'Для них срочно нужно тёплое гнездо.'}`);
    this.persist(false);
  }

  private feedKits(vegetables=false): void {
    const b = this.tunnel?.burrow??this.nearestBurrow(4);
    const nest=this.nearestNest(4);
    if (!b&&!nest) { this.toast('Подойди к норе или гнезду с крольчатами.'); return; }
    const young = this.save.kits.filter(k => k.alive && k.age < 3 && (nest?k.nestId===nest.id:k.burrowId===b?.id));
    if (!young.length) { this.toast('Здесь пока нет маленьких крольчат.'); return; }
    if(vegetables){
      const ready=young.filter(k=>k.age>=0.8);
      if(!ready.length){this.toast('Крольчата ещё слишком малы для овощей. Пока корми их молоком.');return;}
      const kind=(['carrot','cabbage'] as const).find(k=>this.save.inventory[k]>0);
      if(!kind){this.toast('Для крольчат нужны морковь или капуста из запасов.');return;}
      this.save.inventory[kind]--;
      for(const kit of ready){kit.hunger=clamp(kit.hunger+FOOD[kind].nutrition,0,100);kit.health=clamp(kit.health+3,0,100);}
      this.playAction('eat',1.5);this.sound.play('baby');this.toast(`Ты принесла ${FOOD[kind].label.toLowerCase()} ${ready.length} подросшим крольчатам.`);return;
    }
    if(this.save.player.milk<12){this.toast('Молока мало. Поешь и попей, чтобы оно накопилось.');return;}
    this.save.player.milk=clamp(this.save.player.milk-12,0,100);
    for (const kit of young) { kit.hunger = clamp(kit.hunger + 35, 0, 100); kit.health = clamp(kit.health + 6, 0, 100); }
    this.playAction('nurse',2.8);this.sound.play('baby'); this.toast(`Ты покормила молоком ${young.length} крольчат. Их здоровье укрепилось.`);
  }

  private playAction(action:RabbitAction,duration:number):void{setRabbitAction(this.player,action,this.elapsed,duration);}

  private makeWaste(kind:'pellets'|'urine'|'diarrhea'):void{
    const x=this.tunnel?this.tunnel.burrow.x+this.save.underground!.x:this.save.player.x;
    const z=this.tunnel?this.tunnel.burrow.z+this.save.underground!.z:this.save.player.z;
    const y=this.tunnel?.group.position.y??0;
    this.waste.spawn(kind,x,y,z);
    this.save.player.dirtiness=clamp(this.save.player.dirtiness+(kind==='diarrhea'?18:kind==='urine'?8:3),0,100);
  }

  private coatName(coat: string): string { return ({ cream: 'кремовый', brown: 'бурый', gray: 'серый', black: 'чёрный', white: 'белый' } as Record<string, string>)[coat] || coat; }
  private compatibility(p:PartnerTraits):number{return clamp(partnerScore(p,this.save.player.genes)-this.save.player.dirtiness*0.22-this.save.player.poison*0.08,0,100);}

  private updateHud(threat = Infinity): void {
    const p = this.save.player;
    const weather = { clear: '☀ Ясно', rain: '☂ Дождь', mist: '☁ Туман', snow:'❄ Снег' }[this.save.weather];
    const biome = this.tunnel?`Нора · уровень ${this.tunnel.level+1}`:{ forest: 'Лес', meadow: 'Луг', swamp: 'Болото', garden: 'Огород' }[this.world.biomeAt(p.x, p.z)];
    const bar = (label: string, value: number, color: string, icon: string) => `<div class="stat"><span>${icon} ${label}</span><div class="meter"><i style="width:${fmt(value)}%;background:${color}"></i></div><b>${fmt(value)}</b></div>`;
    const foods = (Object.keys(FOOD) as FoodKind[]).filter(k=>this.save.inventory[k]>0).map(k => `<span title="${FOOD[k].label}">${FOOD[k].emoji} ${this.save.inventory[k]}</span>`).join('')||'<span>Пусто</span>';
    const young = this.save.kits.filter(k => k.alive && k.age < 3);
    this.hud.innerHTML = `<div class="status-card"><div class="card-heading">СОСТОЯНИЕ <span>${this.tunnel ? '● ПОД ЗЕМЛЁЙ' : threat < 8 ? '● ОПАСНОСТЬ' : '● В ЛЕСУ'}</span></div>${bar('Сытость', p.hunger, '#bdcf79', '✿')}${bar('Жажда', p.thirst, '#93bcca', '◈')}${bar('Силы', p.energy, '#93c5ab', '◆')}${bar('Здоровье', p.health, '#dc9f9a', '♥')}${bar('Нужда', p.bladder, '#c7a8cc', '◌')}${bar('Чистота',100-p.dirtiness,'#e4c894','✧')}${p.poison>1?bar('Отравление',p.poison,'#b47b9c','☠'):''}<div class="temperature">Температура тела: <b>${p.bodyTemp.toFixed(1)}°</b> ${p.bodyTemp<34?'⚠ Переохлаждение':''}</div><div class="inventory"><b>ЕДА ${this.store.carried()}/${this.store.capacity} · МОЛОКО ${fmt(p.milk)}%</b><div>${foods}</div><small>Трава ${this.save.materials.grass} · ветки ${this.save.materials.twigs} · пух ${this.save.materials.fur}</small></div></div><div class="family-card"><div class="card-heading">МОЯ СЕМЬЯ</div><strong>${this.save.kits.filter(k => k.alive).length} <small>крольчат</small></strong><span>${young.length ? `${young.length} малышей нуждаются в заботе` : this.save.pregnancy ? `Беременность: ${fmt(this.save.pregnancy.progress / 1.2 * 100)}%` : 'Найди партнёра и создай семью'}</span><div class="family-line"><span>Выросли: ${this.save.stats.grown}</span><span>Гнёзда: ${this.save.nests.length}</span></div></div>`;
    const info = this.app.querySelector('#world-info');
    if (info) info.innerHTML = `<span>◷ День ${this.save.day} · ${this.timeText()}</span><span>✿ ${this.season()}</span><span>${weather} · ${fmt(this.airTemperature())}°C</span><span>⌁ ${biome}</span>`;
    const partner = this.nearestPartner(); const resource = this.world.nearestResource(p.x, p.z, 2.3); const burrow = this.nearestBurrow();
    const child=this.nearestKit();
    const underGarden=this.tunnel&&this.save.underground&&this.world.biomeAt(this.tunnel.burrow.x+this.save.underground.x,this.tunnel.burrow.z+this.save.underground.z)==='garden';
    this.prompt.innerHTML = this.tunnel?`<kbd>B</kbd> Копать &nbsp; <kbd>Z/X</kbd> Глубина &nbsp; <kbd>H</kbd> Выйти ${underGarden?'&nbsp; <kbd>Q</kbd> Корни &nbsp; <kbd>T</kbd> Украсть культуру':''}`:child?`<kbd>E</kbd> Поговорить: ${child.name}`:partner ? `<kbd>E</kbd> Поговорить: ${partner.name}` : resource ? `<kbd>E</kbd> Собрать: ${FOOD[resource.kind].label}` : burrow ? `<kbd>H</kbd> Войти в нору &nbsp; <kbd>R</kbd> Спать &nbsp; <kbd>K/O</kbd> Припасы` : this.world.nearWater(p.x,p.z)?`<kbd>V</kbd> Пить воду`:'';
  }

  private toggleJournal(mode: string): void {
    if (!this.journal.classList.contains('hidden') && this.journal.dataset.mode === mode) { this.journal.classList.add('hidden'); return; }
    this.dialog.classList.add('hidden');this.dialogPartner=undefined;this.dialogKit=undefined;
    this.journal.dataset.mode = mode; this.journal.classList.remove('hidden');
    if (mode === 'map') {
      this.journal.innerHTML = '<div class="journal-head"><h2>Карта леса</h2><button data-action="map">×</button></div><p>Точка в центре — ты. Круги показывают знакомые места.</p>';
      this.journal.append(this.mapCanvas); this.drawMap();
    } else {
      const kits = this.save.kits.filter(k => k.alive).map(k => `<div class="kit-row"><b>${k.name}</b><span>${k.age < 3 ? `малыш · сытость ${fmt(k.hunger)}% · здоровье ${fmt(k.health)}%` : 'взрослый кролик'} · отец ${k.father}</span></div>`).join('') || '<p>Пока крольчат нет. Знакомься с кролами в лесу.</p>';
      this.journal.innerHTML = `<div class="journal-head"><h2>Лесной дневник</h2><button data-action="journal">×</button></div><div class="journal-stat"><span>День ${this.save.day}</span><span>${this.season()}</span><span>Родились: ${this.save.stats.births}</span><span>Выросли: ${this.save.stats.grown}</span></div><h3>Семья</h3>${kits}<h3>Норы и припасы</h3>${this.save.burrows.map(b => `<div class="kit-row"><b>${b.isHome ? 'Родная нора' : `Нора ${b.id}`}</b><span>Вход ${b.depth} · ходов ${b.cells?.length??5} · еды ${Object.values(b.storedFood??{}).reduce((sum,n)=>sum+(n??0),0)}</span></div>`).join('')}<p>Гнёзд: ${this.save.nests.length}. Подземные теплее; неглубокие входы привлекают лис, если рядом крольчата или отходы.</p><h3>Как выжить</h3><p>Зимой пищи почти нет — осенью складывай её в нору клавишей K и бери O. Под огородом можно грызть корни (Q) и красть овощи (T). Грязная шерсть пахнет сильнее и ухудшает отношения: вылизывайся (C). Опасные растения и грибы могут вызвать отравление.</p>`;
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
