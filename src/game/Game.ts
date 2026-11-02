import * as THREE from 'three';
import { Soundscape } from './Audio';
import { FamilyMember, Hawk, RabbitActor, RabbitFactory, Predator, partnerScore } from './Entities';
import { animateRabbit, createRabbit, makeNest, makeStash, setRabbitAction, type RabbitAction, type RabbitRig } from './Models';
import { Random } from './Random';
import { Excavation } from './Excavation';
import { World } from './World';
import { FoodStore, SeasonSystem, SurvivalSystem, WasteSystem } from './Systems';
import { ExcavationTraffic } from './ExcavationTraffic';
import { ViewCamera } from './ViewCamera';
import { HudRenderer } from './HudRenderer';
import { SaveRepository } from './SaveRepository';
import { PanelRenderer } from './PanelRenderer';
import type { ForestAnimal } from './Wildlife';
import { WildlifeEcology } from './WildlifeEcology';
import { FamilyCare } from './FamilyCare';
import { KitWander } from './KitWander';
import { GroundItems } from './GroundItems';
import { PartnerSupport } from './PartnerSupport';
import { ModelAssets } from './ModelAssets';
import { AnimalPhysics, type PhysicalBody } from './AnimalPhysics';
import {PerformanceMonitor} from './PerformanceMonitor';
import { FOOD, type FoodKind, type KitData, type MateCommand, type MaterialKind, type NestData, type PartnerTraits, type SaveData, type Season, type StashData, type Weather } from './types';

const femaleNames = ['Искорка', 'Лапка', 'Ромашка', 'Звёздочка', 'Берёзка', 'Снежка', 'Брусничка', 'Ива'];
const maleNames = ['Клевер', 'Шорох', 'Орешек', 'Лучик', 'Пушок', 'Ветерок', 'Туман', 'Листик'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 350);
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private view:ViewCamera;
  private hudRenderer!:HudRenderer;
  private sun = new THREE.DirectionalLight(0xfff3d2, 2);
  private ambient = new THREE.HemisphereLight(0xd3e4ed, 0x56704d, 1.8);
  private sound = new Soundscape();
  private saves=new SaveRepository();
  private panels=new PanelRenderer();
  private seasons!:SeasonSystem;
  private survival!:SurvivalSystem;
  private waste!:WasteSystem;
  private store!:FoodStore;
  private care!:FamilyCare;
  private kitWander!:KitWander;
  private items!:GroundItems;
  private partnerSupport!:PartnerSupport;
  private readonly physics=new AnimalPhysics();
  private performanceMonitor!:PerformanceMonitor;
  private rng!: Random;
  private factory!: RabbitFactory;
  private world!: World;
  private player!: RabbitRig;
  private save!: SaveData;
  private rabbits: RabbitActor[] = [];
  private families: FamilyMember[] = [];
  private predators: Predator[] = [];
  private wildlife:ForestAnimal[]=[];
  private ecology!:WildlifeEcology;
  private hawks:Hawk[]=[];
  private traffic!:ExcavationTraffic;
  private earth!:Excavation;
  private kitMeshes = new Map<number, RabbitRig>();
  private nestMeshes = new Map<number, THREE.Group>();
  private stashMeshes = new Map<number, THREE.Group>();
  private keys = new Set<string>();
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
  private dialogAnimal?:ForestAnimal;
  private overlay!: HTMLElement;
  private hud!: HTMLElement;
  private avatars!:HTMLElement;
  private kitProgress!:HTMLElement;
  private prompt!: HTMLElement;
  private toastBox!: HTMLElement;
  private mapCanvas!: HTMLCanvasElement;
  private journal!: HTMLElement;
  private dialog!: HTMLElement;
  private controls!:HTMLElement;
  private settings!:HTMLElement;
  private showControls=true;
  private reticle!:HTMLElement;
  private cameraButton!:HTMLButtonElement;
  private digHeld=false;
  private nextDigAt=0;
  private readonly groundAt=(x:number,z:number)=>this.world.heightAt(x,z);

  constructor(private readonly app: HTMLElement) {
    this.view=new ViewCamera(this.camera,this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.45));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.className = 'game-canvas';
    this.app.append(this.renderer.domElement);
    this.buildUi(); this.bind(); this.resize();
    this.performanceMonitor=new PerformanceMonitor(this.app);
    this.showStart();
    requestAnimationFrame(this.frame);
  }

  private buildUi(): void {
    const layer = document.createElement('div'); layer.className = 'ui-layer';
    layer.innerHTML = `<div class="topbar"><div class="brand"><span class="brand-icon">✦</span><span>ЛЕСНАЯ НОРА<small>история дикой крольчихи</small></span></div><div id="world-info" class="world-info"></div><div class="top-actions"><button id="camera-button" data-action="camera" title="Переключить вид (B)">◉ 3-е лицо</button><button data-action="map" title="Карта (M)">◈ Карта</button><button data-action="journal" title="Дневник (J)">☰ Дневник</button><button data-action="save" title="Сохранить (F5)">▣ Сохранить</button><button data-action="sound" title="Звук">♪</button><button data-action="settings" title="Настройки">⚙</button></div></div>
      <div id="family-avatars" class="family-avatars"></div><div id="kit-progress" class="kit-progress hidden"></div>
      <div id="hud" class="hud"></div><div id="prompt" class="prompt"></div><div id="toast" class="toast-box"></div><div class="dig-reticle" aria-hidden="true">✦</div>
      <div id="controls" class="controls"><b>Управление</b><span>WASD — идти · Shift — бег · B — сменить вид · мышь — осмотреться · Esc — освободить курсор · щелчок по миру — вернуться · ЛКМ (1-е лицо) — копать · Z — копать вниз</span><span>E — общаться/подобрать ветку · G — еда и выбросить предмет · иконка партнёра — команды и сообщения · V — пить · P/L — нужда · Q/T — корни · H — кора · C — вылизаться · N — гнездо · U — пух · R — сон · F/Y — кормить детей · K/O — тайник</span></div>
      <div id="settings" class="settings-panel hidden"></div><div id="journal" class="journal hidden"></div><div id="dialog" class="dialog-panel hidden"></div><div id="overlay" class="overlay"></div>`;
    this.app.append(layer);
    this.overlay = layer.querySelector('#overlay')!; this.hud = layer.querySelector('#hud')!;
    this.avatars=layer.querySelector('#family-avatars')!;this.kitProgress=layer.querySelector('#kit-progress')!;
    this.prompt = layer.querySelector('#prompt')!; this.toastBox = layer.querySelector('#toast')!;
    this.hudRenderer=new HudRenderer(this.hud,this.prompt,layer.querySelector('#world-info')!,this.avatars,this.kitProgress);
    this.journal = layer.querySelector('#journal')!;
    this.dialog = layer.querySelector('#dialog')!;
    this.controls=layer.querySelector('#controls')!;this.settings=layer.querySelector('#settings')!;
    this.reticle=layer.querySelector('.dig-reticle')!;this.cameraButton=layer.querySelector('#camera-button')!;
    this.syncCameraUi();
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
      if(e.code==='Escape'){this.view.unlock();this.digHeld=false;return;}
      this.keys.add(e.code); if (e.repeat) return;
      if (e.code === 'F5') this.action('save');
      if (e.code === 'KeyM') this.action('map');
      if (e.code === 'KeyJ') this.action('journal');
      if (!this.running || !this.overlay.classList.contains('hidden')) return;
      const map: Record<string, string> = { KeyB:'camera',KeyE: 'interact', KeyG: 'eat', KeyV: 'drink',KeyQ:'roots',KeyT:'steal',KeyC:'groom',KeyK:'store',KeyO:'retrieve',KeyY:'feed-vegetables', KeyN:'nest', KeyU:'fur', KeyR: 'sleep', KeyP: 'poop', KeyL:'pee', KeyF: 'feed', KeyZ:'dig-down', KeyH:'bark', Space: 'hop' };
      if (map[e.code]) this.action(map[e.code]);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => {this.keys.clear();this.digHeld=false;});
    this.renderer.domElement.addEventListener('pointerdown',e=>{
      if(!this.running||!this.overlay.classList.contains('hidden'))return;
      this.view.lock();
      if(e.button!==0)return;
      this.digHeld=this.view.isFirstPerson;this.action('dig');
    });
    window.addEventListener('pointerup',e=>{if(e.button===0)this.digHeld=false;});
    this.renderer.domElement.addEventListener('pointercancel',()=>{this.digHeld=false;});
  }

  private syncCameraUi():void{
    this.cameraButton.textContent=this.view.isFirstPerson?'◉ 1-е лицо':'◉ 3-е лицо';
    this.reticle.classList.toggle('hidden',!this.view.isFirstPerson);
  }

  private resize(): void {
    const w = this.app.clientWidth, h = this.app.clientHeight;
    this.view.resize(w,h);this.renderer.setSize(w, h);
  }

  private showStart(): void {
    const hasSave = this.saves.exists();
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="start-card"><div class="eyebrow">✦ ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div><h1>Лесная<br><em>нора</em></h1><p>Один лес. Тысячи историй. Найди свой дом, вырасти семью и проживи жизнь дикой крольчихи.</p><label class="start-season">Начать с сезона <select id="start-season"><option value="0">Весна — много травы</option><option value="1">Лето — тепло и изобилие</option><option value="2">Осень — пора запасать</option><option value="3">Зима — суровое выживание</option></select></label><div class="start-actions"><button class="primary" data-action="new">Новая история <span>→</span></button>${hasSave ? '<button class="secondary" data-action="load">Продолжить сохранение</button>' : ''}</div><div class="start-foot">Генерируемый мир · наследование генов · смена сезонов · семейная жизнь</div></div>`;
  }

  private async newGame(): Promise<void> {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const seasonIndex=Number(this.overlay.querySelector<HTMLSelectElement>('#start-season')?.value??0);
    const startDay=1+Math.max(0,Math.min(3,seasonIndex))*30;
    this.rng = new Random(seed + 53); this.factory = new RabbitFactory(this.rng);
    this.overlay.innerHTML='<div class="start-card"><h1>Готовим лес…</h1><p>Загружаем животных и их движения.</p></div>';
    try{await ModelAssets.shared.preload();}catch{this.showStart();this.toast('Не удалось загрузить 3D-модели. Обнови страницу и попробуй снова.');return;}
    this.save = { version: 3, seed, clock: (startDay-1)*1440+7*60, day: startDay,
      player: { x: 0, y:0, z: 0, genes: { coat: 'cream', ear: 1.1, speed: 3, vitality: 4, size: 1 }, hunger: 85, thirst: 85, bodyTemp: 38.5, energy: 90, bladder: 15, bowel:15, health: 100, age: 0, hidden: false,dirtiness:0,poison:0,milk:35 },
      inventory: { clover: 2, carrot: 0, cabbage: 0, mushroom: 0, berries: 0,toadstool:0,bitterleaf:0,acorn:0 },
      nests: [], stashes:[], materials: {grass:0,twigs:0,fur:0}, excavation:[], gnawedRoots:{}, kits: [],
      partners: this.factory.partners(16), harvested: [], pregnancy: null,mateCommand:'forage',mateMessages:[],partnerCargo:{grass:0,twigs:0,fur:0},branchPicked:{},drops:[],
      stats: { births: 0, grown: 0, survived: 0, generations: 1,stillborn:0 }, weather: 'clear', messages: [],waste:[] };
    this.setupWorld(); this.overlay.classList.add('hidden'); this.running = true; this.sound.unlock();
    this.view.lock();
    this.toast('Исследуй лес, копай землю лапами и найди партнёра.');
  }

  private async loadGame(): Promise<void> {
    try {
      this.save=this.saves.load();
      this.overlay.innerHTML='<div class="start-card"><h1>Возвращаемся домой…</h1><p>Загружаем животных и их движения.</p></div>';
      await ModelAssets.shared.preload();
      this.rng=new Random(this.save.seed+53);this.factory=new RabbitFactory(this.rng);
      this.setupWorld();this.overlay.classList.add('hidden');this.running=true;this.sound.unlock();
      this.view.lock();
      this.toast('История продолжена. Добро пожаловать домой!');
    } catch(err){this.showStart();this.toast(err instanceof Error?err.message:'Не удалось загрузить игру');}
  }

  private setupWorld(): void {
    ModelAssets.shared.release(this.scene);
    this.scene.clear(); this.kitMeshes.clear(); this.nestMeshes.clear();this.stashMeshes.clear();
    this.scene.background = new THREE.Color(0xb9d3ba);
    this.scene.add(this.camera);
    this.scene.add(this.ambient);
    this.sun.position.set(25, 45, 22); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 38;
    this.sun.shadow.bias = -0.0004; this.scene.add(this.sun);
    this.world = new World(this.scene, this.save.seed,this.save); this.world.setRain();
    this.seasons=new SeasonSystem(this.save.seed);
    this.survival=new SurvivalSystem(this.save,this.rng);
    this.store=new FoodStore(this.save);
    this.traffic=new ExcavationTraffic(this.rng);
    for (const id of this.save.harvested) {
      const r = this.world.resources[id]; if (r) { r.available = false; r.mesh.visible = false; r.regrowAt = this.save.clock + 60; }
    }
    this.earth=new Excavation(this.scene,this.world,this.save);
    this.care=new FamilyCare(this.save,this.earth);
    this.items=new GroundItems(this.world,this.save);
    this.kitWander=new KitWander(new Random(this.save.seed+7741));
    this.partnerSupport=new PartnerSupport(this.save,this.world,this.earth,this.items,new Random(this.save.seed+6631));
    this.waste=new WasteSystem(this.scene,this.save,w=>this.earth.isSheltered(w.x,w.y,w.z)?w.y:this.world.heightAt(w.x,w.z));
    this.player = createRabbit(this.save.player.genes); this.scene.add(this.player.root);
    this.rabbits = this.save.partners.map(p => { const actor = new RabbitActor(p, this.rng); actor.rig.root.position.y=this.world.heightAt(p.x,p.z);this.scene.add(actor.rig.root);if(p.id===this.save.mateId)this.markPartner(actor,true); return actor; });
    this.families = [];
    for (const partner of this.save.partners) {
      const familyFactory = new RabbitFactory(new Random(this.save.seed + 900 + partner.id * 71));
      for (let i = 0; i < partner.familySize; i++) {
        const member = new FamilyMember(partner, familyFactory.genes(), i, i < Math.floor(partner.familySize / 2));
        member.rig.root.position.set(partner.x,this.world.heightAt(partner.x,partner.z),partner.z);
        this.families.push(member); this.scene.add(member.rig.root);
      }
    }
    this.predators = [];
    for (let i = 0; i < 22; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(27, 82);
      const x=i===0?34:i===1?-35:Math.cos(a)*d;
      const z=i===0?31:i===1?29:Math.sin(a)*d;
      const kind = i<2 ? 'dog' : i===2||i===6?'bear':i>=3&&i<=5?'snake':i%7===0?'lynx':i%5===0?'weasel':i % 4 === 0 ? 'wolf' : 'fox';
      const predator = new Predator(kind, x, z, this.rng);predator.root.position.y=this.world.heightAt(x,z);this.predators.push(predator); this.scene.add(predator.root);
    }
    this.ecology=new WildlifeEcology(this.scene,this.world,this.rng);
    this.ecology.populate();this.wildlife=this.ecology.animals;
    this.hawks=[[32,-30]].map(([x,z])=>new Hawk(x,z,this.rng));
    for(const hawk of this.hawks)this.scene.add(hawk.root,hawk.shadow);
    this.save.nests.forEach(n => this.addNest(n));
    this.save.stashes.forEach(s=>this.addStash(s));
    this.save.kits.filter(k => k.alive).forEach(k => this.addKit(k));
    this.view.snap(this.save.player.x,this.save.player.y,this.save.player.z,this.sheltered);
    this.updateHud();
  }

  private addNest(n: NestData): void {
    const mesh=makeNest();mesh.position.set(n.x,(this.earth.isSheltered(n.x,n.y,n.z)?n.y:this.world.heightAt(n.x,n.z))+0.04,n.z);
    this.nestMeshes.set(n.id,mesh);
    this.scene.add(mesh);
  }
  private addStash(s:StashData):void{
    const mesh=makeStash();mesh.position.set(s.x,(this.earth.isSheltered(s.x,s.y,s.z)?s.y:this.world.heightAt(s.x,s.z))+0.02,s.z);this.stashMeshes.set(s.id,mesh);this.scene.add(mesh);
  }
  private markPartner(actor:RabbitActor,active:boolean):void{
    const previous=actor.rig.root.getObjectByName('mate-mark');
    if(previous){ModelAssets.shared.release(previous);previous.removeFromParent();}
    if(!active)return;
    const mark=new THREE.Group();mark.name='mate-mark';
    const teal=new THREE.MeshStandardMaterial({color:0x89cfc0,emissive:0x285d50,emissiveIntensity:0.3});
    const rose=new THREE.MeshStandardMaterial({color:0xf1a7b4,emissive:0x7c344d,emissiveIntensity:0.4});
    const collar=new THREE.Mesh(new THREE.TorusGeometry(0.27,0.04,5,16),teal);
    collar.rotation.x=Math.PI/2;collar.position.set(0,0.72,-0.22);mark.add(collar);
    for(const side of [-1,1]){
      const half=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,6),rose);
      half.position.set(side*0.09,1.88,0);mark.add(half);
    }
    const tip=new THREE.Mesh(new THREE.ConeGeometry(0.17,0.24,8),rose);
    tip.position.y=1.76;tip.rotation.z=Math.PI;mark.add(tip);
    actor.rig.root.add(mark);
  }
  private get sheltered():boolean{return !!this.earth&&this.earth.isSheltered(this.save.player.x,this.save.player.y,this.save.player.z);}

  private addKit(k: KitData): void {
    const rig = createRabbit(k.genes, k.age < 3);
    if(k.age<3){
      const marker=new THREE.Group();marker.name='family-mark';
      const gold=new THREE.MeshStandardMaterial({color:0xf4d57b,emissive:0x725010,emissiveIntensity:0.25});
      const star=new THREE.Mesh(new THREE.OctahedronGeometry(0.14),gold);star.position.y=1.67;marker.add(star);
      const ribbon=new THREE.Mesh(new THREE.TorusGeometry(0.26,0.035,5,12),gold);
      ribbon.position.set(0,0.65,-0.05);ribbon.rotation.x=Math.PI/2;marker.add(ribbon);
      rig.root.add(marker);
    }
    k.x??=k.homeX+Math.cos(k.id*2.4)*0.7;k.z??=k.homeZ+Math.sin(k.id*2.4)*0.7;k.y??=k.homeY;
    rig.root.position.set(k.x,k.y,k.z);this.scene.add(rig.root); this.kitMeshes.set(k.id, rig);
  }

  private removeKitModel(id:number):void{
    const rig=this.kitMeshes.get(id);if(!rig)return;
    ModelAssets.shared.release(rig.root);rig.root.removeFromParent();this.kitMeshes.delete(id);
  }

  private frame = (timestamp: number): void => {
    const frameMs=timestamp-(this.lastFrame||timestamp);
    const dt = Math.min(frameMs / 1000, 0.05); this.lastFrame = timestamp;
    const start=performance.now();
    if (this.running && this.overlay.classList.contains('hidden')) this.update(dt);
    const afterUpdate=performance.now();
    if (this.running) this.render();
    if(this.running&&frameMs>0)this.performanceMonitor.record(this.renderer,frameMs,afterUpdate-start,performance.now()-afterUpdate);
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    ModelAssets.shared.updateView(this.camera);
    this.elapsed += dt; this.eventCooldown = Math.max(0, this.eventCooldown - dt); this.hopCooldown = Math.max(0, this.hopCooldown - dt);this.furCooldown=Math.max(0,this.furCooldown-dt);
    if(this.digHeld&&this.view.isFirstPerson&&this.elapsed>=this.nextDigAt)this.action('dig');
    const p = this.save.player;
    const oldDay = this.save.day;
    this.save.clock += dt * 6;
    this.save.day = Math.floor(this.save.clock / 1440) + 1;
    p.age += dt * 6 / 1440;
    if (this.save.day > oldDay) this.newDay();
    const night = this.isNight();
    const moving = this.movePlayer(dt);
    this.settlePlayer(dt);
    p.hidden=this.sheltered;
    const air=this.airTemperature();
    const nearbyNest=this.nearestNest(2.8);
    const warmed=this.sheltered || nearbyNest!==undefined;
    this.survival.tick(dt,this.elapsed,moving,air,warmed,()=>this.makeWaste('diarrhea'));
    this.waste.update(dt,p.x,p.y,p.z);
    if (p.health <= 0) { this.gameOver(); return; }
    const pregnancyEvent=this.care.advance(dt*6);
    if(pregnancyEvent==='warning'){this.sound.play('baby');this.toast('Скоро роды. Вернись в гнездо внутри выкопанного хода!');}
    if(pregnancyEvent==='birth')this.giveBirth();
    this.updateKits(dt);
    this.items.update(this.save.clock);
    for (const rabbit of this.rabbits){
      if(rabbit.data.id===this.save.mateId){
        const home=this.save.nests.find(n=>this.earth.isSheltered(n.x,n.y,n.z))??this.save.nests[0]??this.save.stashes[0]??p;
        const stash=this.ensureFamilyStash(home);
        const event=this.partnerSupport.update(rabbit,dt,this.elapsed,home,stash,this.groundAt);
        if(event?.kind==='delivered'&&Math.hypot(rabbit.data.x-p.x,rabbit.data.z-p.z)<12)this.toast(event.text);
      }else rabbit.update(dt,this.elapsed,p.x,p.z,this.groundAt);
      const mark=rabbit.rig.root.getObjectByName('mate-mark');
      if(mark){mark.rotation.y=this.elapsed*0.6;mark.position.y=Math.sin(this.elapsed*2.2)*0.06;}
    }
    if(this.mating){
      const actor=this.rabbits.find(r=>r.data.id===this.mating!.fatherId);
      if(actor){actor.rig.root.position.set(p.x+Math.sin(this.player.root.rotation.y)*0.28,p.y+0.4,p.z+Math.cos(this.player.root.rotation.y)*0.28);actor.rig.root.rotation.y=this.player.root.rotation.y;}
      if(this.elapsed>=this.mating.until)this.mating=undefined;
    }
    for (const member of this.families)member.update(this.elapsed,dt,this.groundAt);
    let closestThreat = Infinity;
    for (const predator of this.predators) {
      const prey=this.ecology.targetFor(predator,this.predators,this.elapsed);
      if (predator.update(dt, this.elapsed, p.x, p.z, p.hidden, !night,this.groundAt,p.dirtiness/100,this.seasons.predatorActivity(this.save.day),prey)) this.predatorAttack(predator.kind);
      this.threatenKits(predator);
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }
    for(const event of this.traffic.update(dt,this.elapsed,night,this.predators,this.rabbits,this.save,this.earth)){
      const animal=event.kind==='weasel'?'Ласка':'Лиса';
      if(event.type==='predator-entered')this.toast(`${animal} учуяла крольчат или отходы и пролезла в неглубокий ход!`);
      if(event.type==='predator-attack')this.predatorAttack(event.kind);
      if(event.type==='kit-attack')this.toast(`${animal} добралась до ${event.name}. Уведи малыша глубже и защити гнездо.`);
    }
    for(const event of this.ecology.update(dt,this.elapsed,this.save.clock,p.x,p.z,this.groundAt,this.predators)){
      if(Math.hypot(event.x-p.x,event.z-p.z)>19||event.kind==='arrival')continue;
      if(event.kind==='hunt')this.toast(`Хищник поймал ${event.subject}. Лес живёт по своим законам.`);
      else if(event.kind==='defend')this.toast(`${event.subject[0].toUpperCase()+event.subject.slice(1)} дал отпор хищнику!`);
      else this.toast('Хищники столкнулись из-за охотничьей территории.');
    }
    this.resolveAnimalCollisions();
    for(const rabbit of this.rabbits)if(this.rng.chance(dt*0.025)){
      const food=this.world.nearestResource(rabbit.data.x,rabbit.data.z,1.2);
      if(food&&food.kind!=='toadstool'){
        this.world.harvest(food,this.save.clock);setRabbitAction(rabbit.rig,'eat',this.elapsed+rabbit.data.id,1.2);
      }else if(this.world.gnawBark(rabbit.data.x,rabbit.data.z,this.save.clock))
        setRabbitAction(rabbit.rig,'eat',this.elapsed+rabbit.data.id,1.2);
    }
    const exposed=!this.sheltered&&!this.world.hasCover(p.x,p.z);
    for(const hawk of this.hawks)if(hawk.update(dt,this.elapsed,p.x,p.z,exposed,this.groundAt))this.predatorAttack('hawk');
    for(const rabbit of this.rabbits)rabbit.rig.root.visible=Math.hypot(rabbit.rig.root.position.x-p.x,rabbit.rig.root.position.z-p.z)<76;
    for(const member of this.families)member.rig.root.visible=Math.hypot(member.rig.root.position.x-p.x,member.rig.root.position.z-p.z)<76;
    for(const predator of this.predators)predator.root.visible=Math.hypot(predator.root.position.x-p.x,predator.root.position.z-p.z)<76;
    for(const animal of this.wildlife)animal.root.visible=Math.hypot(animal.x-p.x,animal.z-p.z)<76;
    for(const hawk of this.hawks){const visible=Math.hypot(hawk.x-p.x,hawk.z-p.z)<92;hawk.root.visible=visible;hawk.shadow.visible=visible&&!this.sheltered;}
    this.world.update(this.save.clock, this.elapsed, this.save.weather,this.save.day,p.x,p.z);
    this.world.updateRain(dt, p.x, p.z,this.save.weather);
    this.sound.update(this.elapsed, night);
    this.sound.setWeather(this.save.weather,night);
    this.player.root.position.x = p.x; this.player.root.position.z = p.z;
    this.player.root.userData.baseY=p.y;
    this.player.root.visible = !this.view.isFirstPerson;
    animateRabbit(this.player, this.elapsed, moving, closestThreat < 8 && !this.sheltered,dt);
    this.earth.update(p.x,p.y,p.z,this.view.isFirstPerson?this.earth.preview(this.camera,p.x,p.y,p.z):undefined);
    const sunAngle = ((this.save.clock % 1440) / 1440) * Math.PI * 2;
    const daylight = clamp(0.5 + 0.5 * Math.cos(sunAngle - Math.PI), 0.25, 1);
    this.sun.intensity = 0.45 + daylight * 1.55;
    this.ambient.intensity = 0.7 + daylight * 1.1;
    this.sun.position.set(Math.cos(sunAngle) * 45, Math.max(8, Math.cos(sunAngle - Math.PI) * 45), 22);
    this.sun.target.position.set(p.x, this.world.heightAt(p.x,p.z), p.z); this.scene.add(this.sun.target);
    this.sun.position.x += p.x; this.sun.position.z += p.z;
    const hour=this.save.clock%1440/60;
    const clearSky=night?0x3d5667:hour<10?0xe1c5a3:hour>=17?0xd0aa8a:0xb9d3ba;
    const sky = new THREE.Color(this.sheltered?0x5c4e3e:this.save.weather === 'snow' ? 0xd4dfdf : this.save.weather === 'rain' ? 0x9eafb0 : clearSky);
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(sky);
    if (this.elapsed - this.lastHud > 0.22) { this.lastHud = this.elapsed; this.updateHud(closestThreat); }
    if (this.elapsed > this.autosaveAt) { this.autosaveAt = this.elapsed + 30; this.persist(false); }
  }

  private resolveAnimalCollisions():void{
    const p=this.save.player,bodies:PhysicalBody[]=[];
    const valid=(x:number,z:number,y:number,sheltered:boolean)=>Math.abs(x)<103&&Math.abs(z)<103&&this.earth.canMoveTo(x,z,y,sheltered);
    bodies.push({id:0,x:p.x,y:p.y,z:p.z,radius:.38,mass:Infinity,sheltered:this.sheltered,moveTo:()=>false});
    this.rabbits.forEach((actor,i)=>{
      if(this.mating?.fatherId===actor.data.id)return;
      const root=actor.rig.root,y=root.userData.baseY as number??root.position.y,sheltered=this.earth.isSheltered(actor.data.x,y,actor.data.z);
      bodies.push({id:1000+i,x:actor.data.x,y,z:actor.data.z,radius:.38*root.scale.x,mass:1,sheltered,
        moveTo:(x,z)=>{if(!valid(x,z,y,sheltered))return false;actor.moveTo(x,z,sheltered?this.earth.floorAt(x,z,y):this.groundAt(x,z));return true;}});
    });
    this.families.forEach((member,i)=>{
      const root=member.rig.root,y=root.userData.baseY as number??root.position.y;
      bodies.push({id:2000+i,x:root.position.x,y,z:root.position.z,radius:.34*root.scale.x,mass:1,sheltered:false,
        moveTo:(x,z)=>{if(!valid(x,z,y,false))return false;member.moveTo(x,z,this.groundAt(x,z));return true;}});
    });
    this.save.kits.filter(k=>k.alive).forEach(kit=>{
      const rig=this.kitMeshes.get(kit.id);if(!rig)return;
      const y=kit.y??kit.homeY,sheltered=this.earth.isSheltered(kit.x??kit.homeX,y,kit.z??kit.homeZ);
      bodies.push({id:3000+kit.id,x:kit.x??kit.homeX,y,z:kit.z??kit.homeZ,radius:Math.max(.17,.36*rig.root.scale.x),mass:.55,sheltered,
        moveTo:(x,z)=>{if(!valid(x,z,y,sheltered))return false;kit.x=x;kit.z=z;kit.y=sheltered?this.earth.floorAt(x,z,y):this.groundAt(x,z);
          rig.root.position.set(x,kit.y,z);rig.root.userData.baseY=kit.y;return true;}});
    });
    this.predators.forEach((predator,i)=>{
      const y=predator.root.position.y,sheltered=predator.underground;
      const radius=predator.kind==='bear'?1.15:predator.kind==='wolf'?.77:predator.kind==='snake'?.28:.62;
      bodies.push({id:4000+i,x:predator.x,y,z:predator.z,radius,mass:predator.kind==='bear'?7:3,sheltered,
        moveTo:(x,z)=>{if(!valid(x,z,y,sheltered))return false;predator.moveTo(x,z,sheltered?this.earth.floorAt(x,z,y):this.groundAt(x,z));return true;}});
    });
    this.wildlife.forEach((animal,i)=>{
      const radius=animal.kind==='moose'?1.1:animal.kind==='deer'?.74:animal.kind==='beaver'?.52:.34;
      bodies.push({id:5000+i,x:animal.x,y:animal.root.position.y,z:animal.z,radius,mass:animal.kind==='moose'?6:2,sheltered:false,
        moveTo:(x,z)=>{if(!valid(x,z,animal.root.position.y,false))return false;animal.x=x;animal.z=z;animal.root.position.set(x,this.groundAt(x,z),z);return true;}});
    });
    this.physics.resolve(bodies);
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
    const direction=this.view.forwardAt(),fx=direction.x,fz=direction.z;
    const dx = fx * forward - fz * right;
    const dz = fz * forward + fx * right;
    const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && p.energy > 8;
    const speed = (sprint ? 9.2 : 4.5) * (0.82 + p.genes.speed * 0.06) * (p.energy < 15 ? 0.75 : 1);
    const desired=Math.atan2(-dx,-dz);
    const turn=Math.atan2(Math.sin(desired-this.player.root.rotation.y),Math.cos(desired-this.player.root.rotation.y));
    this.player.root.rotation.y+=clamp(turn,-dt*8,dt*8);
    const facingX=-Math.sin(this.player.root.rotation.y),facingZ=-Math.cos(this.player.root.rotation.y);
    const speedScale=this.sheltered?0.68:1;
    const nx=clamp(p.x+facingX*speed*dt*speedScale,-103,103),nz=clamp(p.z+facingZ*speed*dt*speedScale,-103,103);
    if(this.earth.canMoveTo(nx,p.z,p.y,this.sheltered))p.x=nx;
    if(this.earth.canMoveTo(p.x,nz,p.y,this.sheltered))p.z=nz;
    if(this.elapsed>this.footstepAt){this.footstepAt=this.elapsed+(sprint?0.17:0.28);this.sound.play('step');}
    return true;
  }

  private settlePlayer(dt:number):void{
    const p=this.save.player,target=this.earth.floorAt(p.x,p.z,p.y);
    p.y+=clamp(target-p.y,-dt*3.5,dt*2.4);
  }

  private render(): void {
    const p=this.save.player;
    this.view.setLookEnabled(this.overlay.classList.contains('hidden')&&this.dialog.classList.contains('hidden')&&this.journal.classList.contains('hidden')&&this.settings.classList.contains('hidden'));
    const digging=this.player.root.userData.action==='dig'&&((this.player.root.userData.actionUntil as number|undefined)??0)>this.elapsed;
    const walking=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].some(code=>this.keys.has(code));
    this.view.update(p.x,p.z,p.y,this.sheltered?this.earth:undefined,this.elapsed,digging,walking);
    this.player.root.visible=!this.view.isFirstPerson;
    this.renderer.render(this.scene, this.camera);
  }

  private isNight(): boolean { const t = this.save.clock % 1440; return t < 300 || t >= 1260; }
  private season(): Season { return this.seasons.name(this.save.day); }
  private airTemperature(): number {
    return this.seasons.temperature(this.save.day,this.save.clock,this.save.weather)+this.world.temperatureOffset(this.save.player.x,this.save.player.z);
  }

  private nearestNest(radius=3): NestData | undefined {
    const p=this.save.player;
    return this.save.nests.filter(n=>Math.hypot(n.x-p.x,n.y-p.y,n.z-p.z)<radius)
      .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z))[0];
  }
  private nearestStash(radius=2.5):StashData|undefined{
    const p=this.save.player;
    return this.save.stashes.filter(s=>Math.hypot(s.x-p.x,s.y-p.y,s.z-p.z)<radius)
      .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z))[0];
  }
  private ensureFamilyStash(home:{x:number;y:number;z:number}):StashData{
    const nearby=this.save.stashes.find(s=>Math.hypot(s.x-home.x,s.y-home.y,s.z-home.z)<5);
    if(nearby)return nearby;
    const x=home.x+0.65,z=home.z+0.45;
    const stash:StashData={id:Math.max(0,...this.save.stashes.map(s=>s.id))+1,x,
      y:this.earth.isSheltered(home.x,home.y,home.z)?this.earth.floorAt(x,z,home.y):this.world.heightAt(x,z),z,
      food:{},materials:{grass:0,twigs:0,fur:0}};
    this.save.stashes.push(stash);this.addStash(stash);return stash;
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
      if (wasYoung && kit.age >= 3) {
        this.save.stats.grown++;kit.independent=true;kit.command=undefined;
        this.kitWander.forget(kit.id);
        this.removeKitModel(kit.id);
        const adult=createRabbit(kit.genes);adult.root.position.set(kit.x??kit.homeX,kit.y??kit.homeY,kit.z??kit.homeZ);
        this.kitMeshes.set(kit.id,adult);this.scene.add(adult.root);
        const angle=kit.id*2.4;kit.homeX=clamp(kit.homeX+Math.cos(angle)*22,-90,90);
        kit.homeZ=clamp(kit.homeZ+Math.sin(angle)*22,-90,90);kit.homeY=this.world.heightAt(kit.homeX,kit.homeZ);
        kit.nestId=undefined;this.sound.play('baby');
        this.toast(`${kit.name} вырос${kit.name.endsWith('а') ? 'ла' : ''} и отправился жить самостоятельно.`);
      }
      if (kit.age < 3) {
        kit.hunger = clamp(kit.hunger - dt * 0.08, 0, 100);
        const nest=this.save.nests.find(n=>n.id===kit.nestId);
        if(!nest && this.airTemperature()<9)kit.health=clamp(kit.health-dt*0.17*0.8,0,100);
        else if(nest&&!this.earth.isSheltered(nest.x,nest.y,nest.z)&&this.airTemperature()<0)kit.health=clamp(kit.health-dt*0.055*0.8,0,100);
        if (kit.hunger < 12) kit.health = clamp(kit.health - dt * 0.2*0.8, 0, 100);
        else if (kit.hunger > 65) kit.health = clamp(kit.health + dt * 0.04, 0, 100);
        if (kit.health <= 0) { kit.alive = false; this.removeKitModel(kit.id); this.toast(`${kit.name} не пережил трудные дни. Позаботься о других крольчатах.`); continue; }
      }
      const rig = this.kitMeshes.get(kit.id);
      if (rig) {
        const nest=this.save.nests.find(n=>n.id===kit.nestId);
        const home=nest??{x:kit.homeX,y:kit.homeY,z:kit.homeZ};
        rig.root.visible=true;
        if(rig.root.parent!==this.scene)this.scene.add(rig.root);
        const center=kit.independent?{x:kit.homeX,y:kit.homeY,z:kit.homeZ}:
          kit.command==='follow'?this.save.player:
          kit.command==='rest'&&!nest?{x:kit.stayX??kit.x??home.x,y:kit.stayY??kit.y??home.y,z:kit.stayZ??kit.z??home.z}:
          kit.command==='stay'&&kit.stayX!==undefined?{x:kit.stayX,y:kit.stayY??home.y,z:kit.stayZ??home.z}:home;
        const destination=kit.independent||!kit.command?this.kitWander.target(kit,center,this.elapsed,this.earth,this.groundAt):
          kit.command==='follow'?{x:center.x+Math.cos(kit.id*2.4)*0.85,y:center.y,z:center.z+Math.sin(kit.id*2.4)*0.85}:
          kit.command==='rest'?{x:center.x+Math.cos(kit.id*2.4)*0.3,y:center.y,z:center.z+Math.sin(kit.id*2.4)*0.3}:center;
        let targetX=destination.x,targetZ=destination.z;
        if(!kit.independent){
          const step=this.earth.nextStep({x:kit.x??home.x,y:kit.y??home.y,z:kit.z??home.z},destination);
          if(step){targetX=step.x;targetZ=step.z;}
        }
        const dx=targetX-(kit.x??home.x),dz=targetZ-(kit.z??home.z),distance=Math.hypot(dx,dz);
        const speed=kit.independent?2.4:kit.command==='follow'?Math.min(12,3+distance*1.3):kit.age<0.7?0.55:1.2;
        const step=Math.min(distance,speed*dt);
        if(distance>0.04){kit.x=(kit.x??home.x)+dx/distance*step;kit.z=(kit.z??home.z)+dz/distance*step;rig.root.rotation.y=Math.atan2(-dx,-dz);}
        const currentY=kit.y??home.y;
        kit.y=kit.independent?this.world.heightAt(kit.x??home.x,kit.z??home.z):
          this.earth.floorAt(kit.x??home.x,kit.z??home.z,currentY);
        rig.root.position.x=kit.x??home.x;rig.root.position.z=kit.z??home.z;
        rig.root.userData.baseY=kit.y;
        rig.root.scale.setScalar(kit.age < 3 ? (0.28 + kit.age * 0.095) * kit.genes.size : kit.genes.size);
        const mark=rig.root.getObjectByName('family-mark');
        if(mark){mark.rotation.y=this.elapsed*0.9;mark.position.y=Math.sin(this.elapsed*2+kit.id)*0.07;}
        if(distance>0.16)rig.root.userData.actionUntil=0;
        else if(kit.command==='rest')setRabbitAction(rig,'lie',this.elapsed+kit.id,0.35);
        else if(kit.command==='stay')setRabbitAction(rig,'sit',this.elapsed+kit.id,0.35);
        animateRabbit(rig,this.elapsed+kit.id,distance>0.14,false,dt);
      }
    }
  }

  private predatorAttack(kind: string): void {
    const p = this.save.player;
    p.health = clamp(p.health - (kind === 'hawk' ? 32:kind === 'wolf' ? 23:kind==='lynx'?21:kind==='weasel'?11:kind==='bear'?34:kind==='snake'?8:15)*0.8, 0, 100);
    if(kind==='snake')p.poison=clamp(p.poison+18,0,100);
    p.energy = clamp(p.energy - 13, 0, 100);
    this.sound.play('danger'); this.toast(`${kind === 'hawk'?'Сокол':kind === 'wolf' ? 'Волк' : kind === 'dog' ? 'Сторожевой пёс' :kind==='lynx'?'Рысь':kind==='weasel'?'Ласка':kind==='bear'?'Медведь':kind==='snake'?'Змея':'Лиса'} напал! Беги под деревья или в выкопанный ход.`);
  }

  private threatenKits(predator: Predator): void {
    if (predator.attackCooldown > 0) return;
    for(const nest of this.save.nests.filter(n=>!this.earth.isSheltered(n.x,n.y,n.z))){
      if(Math.hypot(predator.x-nest.x,predator.z-nest.z)>2)continue;
      const kit=this.save.kits.find(k=>k.alive&&k.age<3&&k.command!=='follow'&&k.nestId===nest.id);
      if(!kit)continue;
      kit.health=clamp(kit.health-24*0.8,0,100);predator.attackCooldown=9;
      this.sound.play('danger');this.toast(`Хищник нашёл наземное гнездо! ${kit.name} в опасности.`);return;
    }
  }

  private nearestPartner(radius = 3): PartnerTraits | undefined {
    const p = this.save.player;
    return this.save.partners.filter(r => {
      const actor=this.rabbits.find(a=>a.data.id===r.id);
      return Math.hypot(r.x-p.x,r.z-p.z)<radius&&Math.abs((actor?.rig.root.position.y??this.world.heightAt(r.x,r.z))-p.y)<1.5;
    }).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }

  private nearestKit(radius=2.5): KitData | undefined {
    const x=this.save.player.x,z=this.save.player.z;
    return this.save.kits.filter(k=>k.alive&&!k.independent).find(k=>{
      const mesh=this.kitMeshes.get(k.id)?.root;
      return mesh?.visible && Math.abs(mesh.position.y-this.save.player.y)<1.5 && Math.hypot(mesh.position.x-x,mesh.position.z-z)<radius;
    });
  }

  private nearestAnimal(radius=3):ForestAnimal|undefined{
    const p=this.save.player;
    if(this.sheltered)return;
    return this.wildlife.filter(a=>a.alive&&Math.hypot(a.x-p.x,a.z-p.z)<radius&&Math.abs(a.root.position.y-p.y)<1.5)
      .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  }

  private action(action: string): void {
    if (action === 'new') { this.newGame(); return; }
    if (action === 'load') { this.loadGame(); return; }
    if (!this.running) return;
    this.sound.unlock();
    if (action === 'save') { this.persist(true); return; }
    if (action === 'sound') { this.sound.muted = !this.sound.muted; this.toast(this.sound.muted ? 'Звук выключен' : 'Звук включён'); return; }
    if(action==='self-profile'){
      this.view.unlock();this.journal.classList.add('hidden');this.dialog.classList.remove('hidden');
      this.dialog.innerHTML=this.panels.selfProfile(this.save);return;
    }
    if(action==='mate-panel'){this.openMatePanel();return;}
    if(action==='mate-talk'){
      const mate=this.save.partners.find(p=>p.id===this.save.mateId);
      if(mate)this.openPartner(mate);return;
    }
    if(action==='mate-send'){this.sendMateMessage();return;}
    if(action.startsWith('mate-command:')){this.commandMate(action.slice(13) as MateCommand);return;}
    if(action==='camera'){
      const mode=this.view.toggleMode();this.digHeld=false;this.syncCameraUi();
      this.toast(mode==='first'?'Вид от первого лица: теперь можно копать ЛКМ.':'Вид от третьего лица. Для копания нажми B.');
      return;
    }
    if(action==='settings'){
      this.view.unlock();
      this.settings.classList.toggle('hidden');
      this.settings.innerHTML=`<div class="journal-head"><h2>Настройки</h2><button data-action="settings">×</button></div><button class="setting-row" data-action="toggle-controls">${this.showControls?'☑':'☐'} Показывать подсказку управления</button>`;
      return;
    }
    if(action==='toggle-controls'){
      this.showControls=!this.showControls;localStorage.setItem('lesnaya-nora-show-controls',String(this.showControls));
      this.controls.classList.toggle('hidden',!this.showControls);this.settings.innerHTML=`<div class="journal-head"><h2>Настройки</h2><button data-action="settings">×</button></div><button class="setting-row" data-action="toggle-controls">${this.showControls?'☑':'☐'} Показывать подсказку управления</button>`;return;
    }
    if (action === 'journal' || action === 'map') { this.toggleJournal(action); return; }
    if (action === 'close') { this.dialog.classList.add('hidden'); this.dialogPartner = undefined;this.dialogKit=undefined;this.dialogAnimal=undefined; return; }
    if (['talk','gift','court','divorce','ask-food','ask-home','ask-danger','compliment'].includes(action)) { this.partnerAction(action); return; }
    if (['child-follow','child-stay','child-rest'].includes(action)) { this.childAction(action);return;}
    if(['animal-observe','animal-food','animal-path'].includes(action)){this.animalAction(action);return;}
    if(action.startsWith('drop-material:')){
      const kind=action.slice(14) as MaterialKind;
      if(!['grass','twigs','fur'].includes(kind)||this.save.materials[kind]<=0)return;
      const p=this.save.player,forward=this.view.forwardAt(),x=p.x+forward.x*0.85,z=p.z+forward.z*0.85;
      this.save.materials[kind]--;
      this.items.drop(kind,x,this.sheltered?this.earth.floorAt(x,z,p.y):this.world.heightAt(x,z),z);
      this.dialog.classList.add('hidden');this.toast('Материал выброшен. Его можно поднять снова клавишей E.');return;
    }
    if(action.startsWith('drop:')){
      const kind=action.slice(5) as FoodKind;
      if(!(kind in FOOD)||this.save.inventory[kind]<=0)return;
      const p=this.save.player,forward=this.view.forwardAt();
      const x=p.x+forward.x*0.85,z=p.z+forward.z*0.85;
      this.save.inventory[kind]--;
      this.items.drop(kind,x,this.sheltered?this.earth.floorAt(x,z,p.y):this.world.heightAt(x,z),z);
      this.dialog.classList.add('hidden');this.sound.play('pickup');this.toast(`Ты выбросила ${FOOD[kind].label.toLowerCase()}. Предмет лежит на земле.`);return;
    }
    if(action.startsWith('consume:')||action.startsWith('consume-stash:')){
      const fromStash=action.startsWith('consume-stash:');
      const kind=action.slice(fromStash?14:8) as FoodKind;
      const stash=fromStash?this.nearestStash():undefined;
      if(!(kind in FOOD)||(fromStash?(stash?.food[kind]??0):this.save.inventory[kind])<=0)return;
      if(fromStash&&stash)stash.food[kind]=(stash.food[kind]??0)-1;
      else this.save.inventory[kind]--;
      const poisoned=this.survival.eat(kind);
      this.sound.play('eat');this.playAction('eat',1.5);
      this.toast(poisoned?`После ${FOOD[kind].label.toLowerCase()} тебе стало плохо. Возможно, еда ядовита.`:`Ты съела: ${FOOD[kind].label.toLowerCase()}.`);
      this.dialog.classList.add('hidden');return;
    }
    if (!this.overlay.classList.contains('hidden')) return;
    const p = this.save.player;
    if (action === 'hop') { if (this.hopCooldown <= 0) { this.hopCooldown = 0.4; this.sound.play('hop'); p.y+=0.25; } return; }
    if (action === 'interact') {
      if(!this.dialog.classList.contains('hidden')){this.dialog.classList.add('hidden');this.dialogPartner=undefined;this.dialogKit=undefined;this.dialogAnimal=undefined;return;}
      const child=this.nearestKit();if(child){this.openKit(child);return;}
      const partner = this.nearestPartner();
      if (partner) { this.openPartner(partner); return; }
      const animal=this.nearestAnimal();if(animal){this.openAnimal(animal);return;}
      const item=this.items.nearest(p.x,p.y,p.z);
      if(item){
        if(item.kind==='branch'){
          if(this.items.collect(item,this.save.clock)){this.save.materials.twigs++;this.sound.play('pickup');this.toast('Ты подняла сухую ветку для гнезда.');}
        }else if(item.kind==='grass'||item.kind==='twigs'||item.kind==='fur'){
          if(this.items.collect(item,this.save.clock)){this.save.materials[item.kind]++;this.sound.play('pickup');this.toast('Материал снова в багаже.');}
        }else{
          if(this.store.carried()>=this.store.capacity){this.toast('Багаж заполнен. Выброси лишнюю еду через G или сложи её в тайник.');return;}
          if(this.items.collect(item,this.save.clock)){this.save.inventory[item.kind]++;this.sound.play('pickup');this.toast(`Подобрано: ${FOOD[item.kind].label.toLowerCase()}.`);}
        }
        return;
      }
      if(this.sheltered){this.toast('Наведи прицел на земляную стену и нажми ЛКМ, чтобы копать.');return;}
      const r = this.world.nearestResource(p.x, p.z, 2.3);
      if (r) {
        if(this.store.carried()>=this.store.capacity){this.toast('Запасы в лапах переполнены. Сложи еду в тайник (K).');return;}
        this.world.harvest(r, this.save.clock); this.save.inventory[r.kind]++;
        if(r.kind==='clover')this.save.materials.grass++;
        if(r.kind==='berries'||r.kind==='mushroom')this.save.materials.twigs++;
        this.sound.play('pickup'); this.toast(`Собрано: ${FOOD[r.kind].label.toLowerCase()} ${FOOD[r.kind].emoji}${r.kind==='clover'?' и трава':r.kind==='berries'||r.kind==='mushroom'?' и ветки':''}`); return;
      }
      this.toast('Рядом нет животного или еды.'); return;
    }
    if (action === 'eat') {
      const items=(Object.keys(FOOD) as FoodKind[]).filter(k=>this.save.inventory[k]>0);
      const materials=(['grass','twigs','fur'] as MaterialKind[]).filter(k=>this.save.materials[k]>0);
      const stash=this.nearestStash();
      const stored=(Object.keys(FOOD) as FoodKind[]).filter(k=>(stash?.food[k]??0)>0);
      if(!items.length&&!stored.length&&!materials.length){this.toast('Запасы пусты. Найди растения или ветки и нажми E.');return;}
      this.dialogPartner=undefined;this.dialogKit=undefined;this.dialogAnimal=undefined;this.view.unlock();this.dialog.classList.remove('hidden');
      this.dialog.innerHTML=`<div class="dialog-top"><div><div class="eyebrow">МОИ ЗАПАСЫ</div><h2>Еда и багаж</h2></div><button data-action="close">×</button></div><p class="dialog-meta">Выбирай пищу внимательно. Лишнее можно выбросить и подобрать снова.</p><div class="dialog-choices">${items.map(k=>`<button data-action="consume:${k}">${FOOD[k].emoji} Съесть ${FOOD[k].label.toLowerCase()} · ${this.save.inventory[k]}</button><button data-action="drop:${k}">↘ Выбросить ${FOOD[k].label.toLowerCase()} · 1 шт.</button>`).join('')}${materials.map(k=>`<button data-action="drop-material:${k}">↘ Выбросить ${k==='twigs'?'ветку':k==='fur'?'пух':'траву'} · ${this.save.materials[k]}</button>`).join('')}${stored.map(k=>`<button data-action="consume-stash:${k}">${FOOD[k].emoji} ${FOOD[k].label} · из тайника ${stash?.food[k]}</button>`).join('')}</div>`;return;
    }
    if(action==='drink'){
      if(this.sheltered||!this.world.nearWater(p.x,p.z)){this.toast('Подойди к пруду или воде в болоте, чтобы попить.');return;}
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
      const n:NestData={id,x:p.x,y:p.y,z:p.z,quality:1};
      this.save.nests.push(n);this.addNest(n);this.sound.play('nest');this.toast(this.sheltered?'Тёплое гнездо готово под землёй.':'Гнездо готово. На поверхности крольчатам опаснее.');return;
    }
    if(action==='dig'||action==='dig-down'){
      if(!this.view.isFirstPerson){this.toast('Копать можно только от первого лица. Нажми B.');return;}
      if(action==='dig-down'&&!this.sheltered){this.toast('Сначала выкопай вход, затем спустись в него.');return;}
      if(this.elapsed<this.nextDigAt)return;
      if(p.energy<8){this.nextDigAt=this.elapsed+1;this.toast('Слишком мало сил для копания.');return;}
      if(((this.player.root.userData.actionUntil as number|undefined)??0)>this.elapsed)return;
      const result=this.earth.dig(this.camera,p.x,p.y,p.z,action==='dig-down');
      if(!result.success){this.nextDigAt=this.elapsed+0.55;this.toast(result.reason);return;}
      this.nextDigAt=this.elapsed+1.15;
      p.energy-=8;this.playAction('dig',1.15);this.sound.play('dig');this.toast(result.reason);return;
    }
    if(action==='roots'||action==='steal'){
      if(!this.sheltered){this.toast('Копай под растением, чтобы добраться до корня.');return;}
      const root=this.world.rootAt(p.x,p.z,this.earth.depthAt(p.x,p.y,p.z));
      if(!root||!root.available||('mesh' in root&&!root.mesh.visible)){this.toast('Здесь нет доступного корня. Копай ближе к растению.');return;}
      if(action==='steal'&&'tree' in root){this.toast('Древесный корень слишком крепок, его можно только погрызть.');return;}
      if(action==='steal'&&this.store.carried()>=this.store.capacity){this.toast('Запасы переполнены. Сложи часть еды в тайник.');return;}
      const kind=root.kind;
      if('tree' in root)this.world.gnawTreeRoot(root.id,this.save.clock);
      else this.world.harvest(root,this.save.clock);
      this.earth.refreshRoots();
      if(action==='roots'){
        p.hunger=clamp(p.hunger+('tree' in root?5:12),0,100);
        p.thirst=clamp(p.thirst+('tree' in root?0:4),0,100);
        this.playAction('eat',1.3);
        this.toast('tree' in root?'Ты погрызла жёсткое древесное корневище.':`Ты погрызла корень ${FOOD[kind].label.toLowerCase()}.`);
      }else{this.save.inventory[kind]++;this.sound.play('pickup');this.toast(`Ты утащила ${FOOD[kind].label.toLowerCase()} через подкоп.`);}
      return;
    }
    if(action==='bark'){
      if(this.sheltered||!this.world.gnawBark(p.x,p.z,this.save.clock)){this.toast('Подойди к дереву с доступной корой. Ему нужно время на восстановление.');return;}
      p.hunger=clamp(p.hunger+6,0,100);this.playAction('eat',1.4);this.toast('Ты погрызла кору дерева и немного утолила голод.');return;
    }
    if(action==='store'||action==='retrieve'){
      let stash=this.nearestStash();
      if(action==='store'&&!stash){
        stash={id:Math.max(0,...this.save.stashes.map(s=>s.id))+1,x:p.x,y:p.y,z:p.z,food:{}};
        this.save.stashes.push(stash);this.addStash(stash);
      }
      if(!stash){this.toast('Рядом нет тайника с припасами.');return;}
      const amount=action==='store'?this.store.deposit(stash):this.store.withdraw(stash);
      this.toast(amount?`${action==='store'?'Сложено':'Взято'} ${amount} предметов.`:'Сейчас нечего перекладывать.');return;
    }
    if (action === 'sleep') {
      if (!this.sheltered&&!this.nearestNest(2.5)) { this.toast('Спать можно в укрытом ходе или у гнезда.'); return; }
      this.save.clock += 330; p.age += 330 / 1440;
      const labour=this.care.advance(330);
      if(labour==='warning')this.toast('Скоро роды. Успей вернуться в гнездо внутри выкопанного хода!');
      if(labour==='birth')this.giveBirth();
      for (const kit of this.save.kits) if (kit.alive) kit.age += 330 / 1440;
      p.energy = clamp(p.energy + 65, 0, 100); p.hunger = clamp(p.hunger - 17, 0, 100);p.thirst=clamp(p.thirst-20,0,100); p.bladder = clamp(p.bladder + 15, 0, 100);p.bodyTemp=clamp(p.bodyTemp+1.5,28,39);
      p.health = 100; this.playAction('lie',2.8);this.toast('Ты выспалась. Здоровье полностью восстановилось.'); return;
    }
    if (action === 'poop') {
      if(p.bowel<12){this.toast('Пока нет потребности оставлять помёт.');return;}
      this.makeWaste(p.poison>40?'diarrhea':'pellets');p.bowel=0;
      this.playAction('defecate',1.8);this.toast('Готово. Оставленные шарики могут привлечь хищника.');return;
    }
    if (action === 'pee') {
      if(p.bladder<12){this.toast('Пока нет потребности помочиться.');return;}
      this.makeWaste('urine');p.bladder=0;
      this.playAction('defecate',1.5);this.toast('Готово. В норе лучше поддерживать чистоту.');return;
    }
    if(action==='groom'){this.survival.groom();this.playAction('groom',2.5);this.toast('Ты вылизала шерсть. Стало чище и спокойнее.');return;}
    if (action === 'feed') { this.feedKits(); return; }
    if(action==='feed-vegetables'){this.feedKits(true);return;}
  }

  private openPartner(p:PartnerTraits,line?:string):void {
    this.dialogPartner=p;this.dialogKit=undefined;this.dialogAnimal=undefined;this.view.unlock();this.journal.classList.add('hidden');
    this.dialog.classList.remove('hidden');
    this.dialog.innerHTML=this.panels.partner(p,this.compatibility(p),line,this.save.mateId===p.id);
  }

  private openMatePanel():void{
    const mate=this.save.partners.find(p=>p.id===this.save.mateId);
    if(!mate){this.toast('Партнёр пока не найден. Познакомься с кролами в лесу.');return;}
    this.view.unlock();this.journal.classList.add('hidden');this.dialog.classList.remove('hidden');
    this.dialog.innerHTML=this.panels.matePanel(this.save,mate);
  }

  private commandMate(command:MateCommand):void{
    if(!['forage','follow','stay','home'].includes(command)||this.save.mateId===undefined)return;
    this.save.mateCommand=command;
    if(command==='stay'){
      const actor=this.rabbits.find(r=>r.data.id===this.save.mateId);
      this.save.mateStay=actor?{x:actor.data.x,y:actor.rig.root.userData.baseY as number??this.groundAt(actor.data.x,actor.data.z),z:actor.data.z}:
        {x:this.save.player.x,y:this.save.player.y,z:this.save.player.z};
    }
    const line={follow:'Партнёр идёт за тобой.',stay:'Партнёр подождёт здесь.',forage:'Партнёр отправился собирать припасы.',home:'Партнёр возвращается домой.'}[command];
    this.sound.play('chirp');this.toast(line);this.openMatePanel();
  }

  private sendMateMessage():void{
    const mate=this.save.partners.find(p=>p.id===this.save.mateId);
    if(!mate)return;
    const text=this.dialog.querySelector<HTMLInputElement>('#mate-message')?.value.trim().slice(0,120);
    if(!text)return;
    const chat=this.save.mateMessages??=[];
    chat.push({from:'player',text,clock:this.save.clock});
    const reply=mate.temperament==='заботливый'?'Я рядом и помогу нашей семье.':
      mate.temperament==='осторожный'?'Я услышал тебя. Буду внимателен.':'Я тебя услышал. Скоро увидимся!';
    chat.push({from:'partner',text:reply,clock:this.save.clock});
    if(chat.length>20)chat.splice(0,chat.length-20);
    mate.trust=clamp(mate.trust+2,0,100);this.sound.play('chirp');this.openMatePanel();
  }

  private partnerAction(action: string): void {
    const p = this.dialogPartner; if (!p) return;
    let line='';
    if(action==='divorce'&&this.save.mateId===p.id){
      this.save.mateId=undefined;p.trust=clamp(p.trust-15,0,100);
      this.save.mateCommand='forage';this.save.mateStay=undefined;
      const actor=this.rabbits.find(r=>r.data.id===p.id);if(actor)this.markPartner(actor,false);
      this.openPartner(p,'Я уйду жить отдельно. Береги нашу семью.');this.persist(false);return;
    }
    if(action==='ask-home'){p.trust=clamp(p.trust+5,0,100);line=p.familySize>2?'У нас большая семья. Самое важное — возвращаться в гнездо до холодной ночи.':'Моя семья невелика, зато мы всегда держимся рядом с домом.';}
    if(action==='ask-food'){p.trust=clamp(p.trust+4,0,100);line='На лугу много клевера, а в огороде морковь. У пруда можно попить — только прислушивайся к шорохам.';}
    if(action==='ask-danger'){p.trust=clamp(p.trust+6,0,100);line='Лисы особенно смелеют в сумерках. Копай глубокие ходы и держи гнездо сухим.';}
    if(action==='compliment'){p.trust=clamp(p.trust+(p.preference==='bond'?13:8),0,100);line=p.temperament==='осторожный'?'Спасибо... Мне приятно, что ты это сказала.':'Ты тоже мне нравишься. Я рад нашей встрече!';}
    if (action === 'gift') {
      const kind = (Object.keys(FOOD) as FoodKind[]).find(k => this.save.inventory[k] > 0);
      if (!kind) { this.openPartner(p,'В твоих запасах пока нет подарка.'); return; }
      this.save.inventory[kind]--; p.trust = clamp(p.trust + (kind === 'carrot' || kind === 'cabbage' ? 21 : 13), 0, 100);
      this.sound.play('pickup'); line=`Спасибо за ${FOOD[kind].label.toLowerCase()}! Ты умеешь заботиться о близких.`;
    }
    if (action === 'court') {
      if(this.save.mateId!==undefined&&this.save.mateId!==p.id){this.openPartner(p,'Сначала реши, что делать с нынешним партнёром.');return;}
      if (this.save.pregnancy) { this.openPartner(p,'Ты уже ждёшь крольчат. Сейчас надо позаботиться о них.'); return; }
      const score = this.compatibility(p);
      if (score < 55) { p.trust = clamp(p.trust + 3, 0, 100); this.openPartner(p,'Я пока не готов. Давай ещё поговорим и лучше узнаем друг друга.'); return; }
      this.save.pregnancy = { fatherId: p.id, progress: 0 };
      this.save.mateId=p.id;
      this.save.mateCommand='forage';this.save.mateMessages=[];
      this.playAction('mate',3.1);this.mating={fatherId:p.id,until:this.elapsed+3.1};
      const actor=this.rabbits.find(r=>r.data.id===p.id);if(actor){setRabbitAction(actor.rig,'mate',this.elapsed+p.id,3.1);this.markPartner(actor,true);}
      this.sound.play('baby'); this.dialog.classList.add('hidden'); this.dialogPartner = undefined;
      this.toast(`Ты и ${p.name} стали парой. Скоро в семье появятся крольчата!`); return;
    }
    this.sound.play('chirp');this.openPartner(p,line);
  }

  private openKit(kit:KitData,line?:string):void {
    this.dialogKit=kit;this.dialogPartner=undefined;this.dialogAnimal=undefined;this.view.unlock();this.dialog.classList.remove('hidden');
    this.journal.classList.add('hidden');this.dialog.innerHTML=this.panels.kit(kit,line);
  }

  private childAction(action:string):void {
    const kit=this.dialogKit;if(!kit)return;
    if(kit.independent){this.dialog.classList.add('hidden');return;}
    kit.command=action==='child-follow'?'follow':action==='child-stay'?'stay':'rest';
    this.kitWander.forget(kit.id);
    const rig=this.kitMeshes.get(kit.id);
    if(rig)rig.root.userData.actionUntil=0;
    if(kit.command==='stay'||kit.command==='rest'){
      const pos=this.kitMeshes.get(kit.id)?.root.position;
      kit.stayX=kit.x??pos?.x;kit.stayZ=kit.z??pos?.z;kit.stayY=kit.y??pos?.y;
    }
    this.sound.play('baby');this.openKit(kit,action==='child-follow'?'Хорошо, пойду за тобой!':action==='child-stay'?'Я подожду здесь.':'Свернусь клубочком и отдохну.');
  }

  private openAnimal(animal:ForestAnimal,line?:string):void{
    this.dialogAnimal=animal;this.dialogPartner=undefined;this.dialogKit=undefined;
    this.view.unlock();this.journal.classList.add('hidden');this.dialog.classList.remove('hidden');
    this.dialog.innerHTML=this.panels.animal(animal,line);
  }

  private animalAction(action:string):void{
    const animal=this.dialogAnimal;if(!animal||!animal.alive){this.dialog.classList.add('hidden');return;}
    if(action==='animal-food'){
      const kind=(['clover','carrot','cabbage','berries'] as FoodKind[]).find(k=>this.save.inventory[k]>0);
      if(!kind){this.openAnimal(animal,'У тебя пока нет подходящего угощения.');return;}
      this.save.inventory[kind]--;animal.befriend(22);this.sound.play('eat');
      this.openAnimal(animal,`Животное осторожно взяло ${FOOD[kind].label.toLowerCase()} и стало спокойнее.`);return;
    }
    if(action==='animal-path'){
      const line=animal.kind==='moose'||animal.kind==='deer'?'По моим следам можно выйти к лугу. Но в открытом поле опасно: смотри в небо.':
        animal.kind==='beaver'?'У воды много сочных растений. Прислушивайся к плеску и не задерживайся на берегу.':
        'Под густыми деревьями легче укрыться и найти съедобную траву.';
      animal.befriend(4);this.openAnimal(animal,line);return;
    }
    animal.befriend(3);this.openAnimal(animal,animal.mood==='раненое'?'Оно бережёт раненую лапу и прислушивается к лесу.':'Оно отвечает тихим звуком и внимательно наблюдает за тобой.');
  }

  private giveBirth(): void {
    const pregnancy = this.save.pregnancy; if (!pregnancy) return;
    const father = this.save.partners.find(p => p.id === pregnancy.fatherId);
    if (!father) { this.save.pregnancy = null; return; }
    const count = this.rng.int(2, 5);
    const nest=this.care.birthNest();
    if(!nest){
      this.save.stats.stillborn=(this.save.stats.stillborn??0)+count;
      this.save.pregnancy=null;
      this.sound.play('baby');
      this.toast(`Роды начались вне подземного гнезда. К сожалению, ${count} крольчат родились мёртвыми. В следующий раз подготовь гнездо в норе заранее.`);
      this.persist(false);return;
    }
    const home=nest;
    for (let i = 0; i < count; i++) {
      const id = Math.max(0, ...this.save.kits.map(k => k.id)) + 1;
      const name = this.rng.pick(this.rng.chance(0.5) ? femaleNames : maleNames);
      const kit: KitData = { id, name, genes: this.factory.inherit(this.save.player.genes, father.genes), age: 0, hunger: 85, health: 100, father: father.name, homeX:home.x,homeY:home.y,homeZ:home.z,x:home.x+Math.cos(id*2.4)*0.7,y:home.y,z:home.z+Math.sin(id*2.4)*0.7,nestId:nest?.id,alive: true };
      this.save.kits.push(kit); this.addKit(kit);
    }
    this.save.stats.births += count; this.save.pregnancy = null;
    this.sound.play('baby'); this.toast(`Родились крольчата: ${count}! Они устроились в тёплом гнезде под землёй.`);
    this.persist(false);
  }

  private feedKits(vegetables=false): void {
    const p=this.save.player;
    const young = this.save.kits.filter(k => k.alive && k.age < 3 &&
      Math.hypot((k.x??k.homeX)-p.x,(k.y??k.homeY)-p.y,(k.z??k.homeZ)-p.z)<4);
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
    const x=this.save.player.x,z=this.save.player.z,y=this.sheltered?this.save.player.y:this.world.heightAt(x,z);
    this.waste.spawn(kind,x,y,z);
    this.save.player.dirtiness=clamp(this.save.player.dirtiness+(kind==='diarrhea'?18:kind==='urine'?8:3),0,100);
  }

  private compatibility(p:PartnerTraits):number{return clamp(partnerScore(p,this.save.player.genes)-this.save.player.dirtiness*0.22-this.save.player.poison*0.08,0,100);}

  private updateHud(threat = Infinity): void {
    const p=this.save.player;
    this.hudRenderer.render(this.save,this.world,this.earth,this.view.isFirstPerson,this.store,this.seasons,this.airTemperature(),threat,
      this.nearestPartner(),this.sheltered?undefined:this.world.nearestResource(p.x,p.z,2.3),this.nearestStash(),this.nearestKit(),this.nearestAnimal(),this.items.nearest(p.x,p.y,p.z));
  }

  private toggleJournal(mode:string):void {
    if(!this.journal.classList.contains('hidden')&&this.journal.dataset.mode===mode){this.journal.classList.add('hidden');return;}
    this.view.unlock();this.dialog.classList.add('hidden');this.dialogPartner=undefined;this.dialogKit=undefined;this.dialogAnimal=undefined;
    this.journal.dataset.mode=mode;this.journal.classList.remove('hidden');
    if(mode==='map'){
      this.journal.innerHTML='<div class="journal-head"><h2>Карта леса</h2><button data-action="map">×</button></div><p>Точка в центре — ты. Круги показывают знакомые места.</p>';
      this.journal.append(this.mapCanvas);this.panels.map(this.mapCanvas,this.world,this.save);
    }else this.journal.innerHTML=this.panels.journal(this.save,this.season());
  }

  private persist(notify: boolean): void {
    this.save.harvested = this.world.resources.filter(r => !r.available).map(r => r.id);
    try { this.saves.store(this.save); if (notify) { this.sound.play('save'); this.toast('Игра сохранена в этом браузере.'); } }
    catch { if (notify) this.toast('Не удалось сохранить игру: хранилище браузера недоступно.'); }
  }

  private toast(message: string): void {
    this.save?.messages.push(message); if (this.save?.messages.length > 30) this.save.messages.shift();
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
    this.toastBox.append(el); setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 350); }, 4100);
  }

  private gameOver(): void {
    this.running = false;
    this.view.unlock();
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="dialog-card"><div class="eyebrow">ЛЕС ПОМНИТ КАЖДУЮ ИСТОРИЮ</div><h2>История завершилась</h2><p>Ты прожила ${this.save.day} дней, дала жизнь ${this.save.stats.births} крольчатам и вырастила ${this.save.stats.grown} из них.</p><div class="dialog-actions"><button class="primary" data-action="new">Начать новую историю</button><button data-action="load">Вернуться к сохранению</button></div></div>`;
  }
}
