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
import { createForestAnimal, type ForestAnimal, type WildlifeKind } from './Wildlife';
import { FOOD, type FoodKind, type KitData, type NestData, type PartnerTraits, type SaveData, type Season, type StashData, type Weather } from './types';

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
  private rng!: Random;
  private factory!: RabbitFactory;
  private world!: World;
  private player!: RabbitRig;
  private save!: SaveData;
  private rabbits: RabbitActor[] = [];
  private families: FamilyMember[] = [];
  private predators: Predator[] = [];
  private wildlife:ForestAnimal[]=[];
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
  private reticle!:HTMLElement;
  private cameraButton!:HTMLButtonElement;
  private digHeld=false;
  private nextDigAt=0;
  private readonly groundAt=(x:number,z:number)=>this.world.heightAt(x,z);

  constructor(private readonly app: HTMLElement) {
    this.view=new ViewCamera(this.camera,this.renderer.domElement);
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
    layer.innerHTML = `<div class="topbar"><div class="brand"><span class="brand-icon">✦</span><span>ЛЕСНАЯ НОРА<small>история дикой крольчихи</small></span></div><div id="world-info" class="world-info"></div><div class="top-actions"><button id="camera-button" data-action="camera" title="Переключить вид (B)">◉ 3-е лицо</button><button data-action="map" title="Карта (M)">◈ Карта</button><button data-action="journal" title="Дневник (J)">☰ Дневник</button><button data-action="save" title="Сохранить (F5)">▣ Сохранить</button><button data-action="sound" title="Звук">♪</button><button data-action="settings" title="Настройки">⚙</button></div></div>
      <div id="hud" class="hud"></div><div id="prompt" class="prompt"></div><div id="toast" class="toast-box"></div><div class="dig-reticle" aria-hidden="true">✦</div>
      <div id="controls" class="controls"><b>Управление</b><span>WASD — идти · Shift — бег · B — сменить вид · мышь — осмотреться · ЛКМ (вид от первого лица) — копать, удерживать для продолжения · Z — копать вниз</span><span>E — общаться/собрать · G — еда · V — пить · P — помёт · L — моча · Q/T — корни/унести растение · H — кора · C — вылизаться · N — гнездо · U — пух · R — сон · F — молоко · Y — овощи детям · K/O — запас как предмет</span></div>
      <div id="settings" class="settings-panel hidden"></div><div id="journal" class="journal hidden"></div><div id="dialog" class="dialog-panel hidden"></div><div id="overlay" class="overlay"></div>`;
    this.app.append(layer);
    this.overlay = layer.querySelector('#overlay')!; this.hud = layer.querySelector('#hud')!;
    this.prompt = layer.querySelector('#prompt')!; this.toastBox = layer.querySelector('#toast')!;
    this.hudRenderer=new HudRenderer(this.hud,this.prompt,layer.querySelector('#world-info')!);
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
      if(e.button!==0||!this.running||!this.overlay.classList.contains('hidden'))return;
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

  private newGame(): void {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const seasonIndex=Number(this.overlay.querySelector<HTMLSelectElement>('#start-season')?.value??0);
    const startDay=1+Math.max(0,Math.min(3,seasonIndex))*30;
    this.rng = new Random(seed + 53); this.factory = new RabbitFactory(this.rng);
    this.save = { version: 2, calendarVersion:2, seed, clock: (startDay-1)*1440+7*60, day: startDay,
      player: { x: 0, y:0, z: 0, genes: { coat: 'cream', ear: 1.1, speed: 3, vitality: 4, size: 1 }, hunger: 85, thirst: 85, bodyTemp: 38.5, energy: 90, bladder: 15, bowel:15, health: 100, age: 0, hidden: false,dirtiness:0,poison:0,milk:35 },
      inventory: { clover: 2, carrot: 0, cabbage: 0, mushroom: 0, berries: 0,toadstool:0,bitterleaf:0,acorn:0 },
      nests: [], stashes:[], materials: {grass:0,twigs:0,fur:0}, excavation:[], gnawedRoots:{}, kits: [],
      partners: this.factory.partners(16), harvested: [], pregnancy: null,
      stats: { births: 0, grown: 0, survived: 0, generations: 1 }, weather: 'clear', messages: [],waste:[] };
    this.setupWorld(); this.overlay.classList.add('hidden'); this.running = true; this.sound.unlock();
    this.toast('Исследуй лес, копай землю лапами и найди партнёра.');
  }

  private loadGame(): void {
    try {
      this.save=this.saves.load();
      this.rng=new Random(this.save.seed+53);this.factory=new RabbitFactory(this.rng);
      this.setupWorld();this.overlay.classList.add('hidden');this.running=true;this.sound.unlock();
      this.toast('История продолжена. Добро пожаловать домой!');
    } catch(err){this.toast(err instanceof Error?err.message:'Не удалось загрузить игру');}
  }

  private setupWorld(): void {
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
    this.waste=new WasteSystem(this.scene,this.save,w=>this.earth.isSheltered(w.x,w.y,w.z)?w.y:this.world.heightAt(w.x,w.z));
    this.player = createRabbit(this.save.player.genes); this.scene.add(this.player.root);
    this.rabbits = this.save.partners.map(p => { const actor = new RabbitActor(p, this.rng); actor.rig.root.position.y=this.world.heightAt(p.x,p.z);this.scene.add(actor.rig.root); return actor; });
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
    this.wildlife=[];
    for(const [kind,count] of [['deer',6],['squirrel',9],['hedgehog',8],['beaver',5],['moose',3]] as [WildlifeKind,number][]){
      for(let i=0;i<count;i++){
        let x=0,z=0;
        if(kind==='beaver'){
          const pond=this.rng.pick(this.world.waterSources);
          const angle=this.rng.range(0,Math.PI*2),distance=this.rng.range(4,7);
          x=pond.x+Math.sin(angle)*distance;z=pond.z+Math.cos(angle)*distance;
        }else for(let attempt=0;attempt<24;attempt++){
          x=this.rng.range(-90,90);z=this.rng.range(-90,90);
          const biome=this.world.biomeAt(x,z);
          if(Math.hypot(x,z)>9&&biome!=='garden'&&(kind==='deer'||biome==='forest'))break;
        }
        const animal=createForestAnimal(kind,x,z,this.rng);
        animal.root.position.set(x,this.world.heightAt(x,z),z);
        this.wildlife.push(animal);this.scene.add(animal.root);
      }
    }
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
  private get sheltered():boolean{return !!this.earth&&this.earth.isSheltered(this.save.player.x,this.save.player.y,this.save.player.z);}

  private addKit(k: KitData): void {
    const rig = createRabbit(k.genes, k.age < 3);
    k.x??=k.homeX+Math.cos(k.id*2.4)*0.7;k.z??=k.homeZ+Math.sin(k.id*2.4)*0.7;k.y??=k.homeY;
    rig.root.position.set(k.x,k.y,k.z);this.scene.add(rig.root); this.kitMeshes.set(k.id, rig);
  }

  private frame = (timestamp: number): void => {
    const dt = Math.min((timestamp - (this.lastFrame || timestamp)) / 1000, 0.05); this.lastFrame = timestamp;
    if (this.running && this.overlay.classList.contains('hidden')) this.update(dt);
    if (this.running) this.render();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
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
    if (this.save.pregnancy) {
      this.save.pregnancy.progress += dt * 6 / 1440;
      if (this.save.pregnancy.progress >= 1.2) this.giveBirth();
    }
    this.updateKits(dt);
    const mateFood=this.save.mateId===undefined?[]:this.world.resources.filter(r=>r.available&&r.kind!=='toadstool');
    for (const rabbit of this.rabbits){
      if(rabbit.data.id===this.save.mateId){
        const home=this.save.nests.find(n=>this.earth.isSheltered(n.x,n.y,n.z))??this.save.nests[0]??p;
        rabbit.updateMate(dt,this.elapsed,home,mateFood,this.earth,this.groundAt);
      }else rabbit.update(dt,this.elapsed,p.x,p.z,this.groundAt);
    }
    if(this.mating){
      const actor=this.rabbits.find(r=>r.data.id===this.mating!.fatherId);
      if(actor){actor.rig.root.position.set(p.x+Math.sin(this.player.root.rotation.y)*0.28,p.y+0.4,p.z+Math.cos(this.player.root.rotation.y)*0.28);actor.rig.root.rotation.y=this.player.root.rotation.y;}
      if(this.elapsed>=this.mating.until)this.mating=undefined;
    }
    for (const member of this.families)member.update(this.elapsed,dt,this.groundAt);
    let closestThreat = Infinity;
    for (const predator of this.predators) {
      if (predator.update(dt, this.elapsed, p.x, p.z, p.hidden, !night,this.groundAt,p.dirtiness/100,this.seasons.predatorActivity(this.save.day))) this.predatorAttack(predator.kind);
      this.threatenKits(predator);
      closestThreat = Math.min(closestThreat, Math.hypot(predator.x - p.x, predator.z - p.z));
    }
    for(const event of this.traffic.update(dt,this.elapsed,night,this.predators,this.rabbits,this.save,this.earth)){
      const animal=event.kind==='weasel'?'Ласка':'Лиса';
      if(event.type==='predator-entered')this.toast(`${animal} учуяла крольчат или отходы и пролезла в неглубокий ход!`);
      if(event.type==='predator-attack')this.predatorAttack(event.kind);
      if(event.type==='kit-attack')this.toast(`${animal} добралась до ${event.name}. Уведи малыша глубже и защити гнездо.`);
    }
    for(const animal of this.wildlife){
      animal.update(dt,this.elapsed,this.groundAt,this.predators);
      if(this.rng.chance(dt*0.055)){
        const food=this.world.nearestResource(animal.x,animal.z,1.6);
        if(food&&food.kind!=='toadstool'&&food.kind!=='bitterleaf')this.world.harvest(food,this.save.clock);
      }
    }
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
        this.kitMeshes.get(kit.id)?.root.removeFromParent();
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
        if (kit.health <= 0) { kit.alive = false; this.kitMeshes.get(kit.id)?.root.removeFromParent(); this.toast(`${kit.name} не пережил трудные дни. Позаботься о других крольчатах.`); continue; }
      }
      const rig = this.kitMeshes.get(kit.id);
      if (rig) {
        const nest=this.save.nests.find(n=>n.id===kit.nestId);
        const home=nest??{x:kit.homeX,y:kit.homeY,z:kit.homeZ};
        rig.root.visible=true;
        if(rig.root.parent!==this.scene)this.scene.add(rig.root);
        const a=kit.id*2.4;
        const wander=kit.independent?this.elapsed*0.18:kit.command==='rest'||kit.command==='stay'&&kit.stayX!==undefined?0:this.elapsed*0.35;
        const radius=kit.independent?3:kit.command==='rest'?0.4:kit.command==='stay'&&kit.stayX!==undefined?0.22:kit.command==='follow'?1.1:0.65;
        const center=kit.independent?{x:kit.homeX,y:kit.homeY,z:kit.homeZ}:
          kit.command==='follow'?this.save.player:
          kit.command==='rest'&&!nest?{x:kit.stayX??kit.x??home.x,y:kit.stayY??kit.y??home.y,z:kit.stayZ??kit.z??home.z}:
          kit.command==='stay'&&kit.stayX!==undefined?{x:kit.stayX,y:kit.stayY??home.y,z:kit.stayZ??home.z}:home;
        let targetX=center.x+Math.cos(a+wander)*radius,targetZ=center.z+Math.sin(a+wander)*radius;
        if(!kit.independent){
          const step=this.earth.nextStep({x:kit.x??home.x,y:kit.y??home.y,z:kit.z??home.z},center);
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

  private action(action: string): void {
    if (action === 'new') { this.newGame(); return; }
    if (action === 'load') { this.loadGame(); return; }
    if (!this.running) return;
    this.sound.unlock();
    if (action === 'save') { this.persist(true); return; }
    if (action === 'sound') { this.sound.muted = !this.sound.muted; this.toast(this.sound.muted ? 'Звук выключен' : 'Звук включён'); return; }
    if(action==='camera'){
      const mode=this.view.toggleMode();this.digHeld=false;this.syncCameraUi();
      this.toast(mode==='first'?'Вид от первого лица: теперь можно копать ЛКМ.':'Вид от третьего лица. Для копания нажми B.');
      return;
    }
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
    if (['talk','gift','court','divorce','ask-food','ask-home','ask-danger','compliment'].includes(action)) { this.partnerAction(action); return; }
    if (['child-follow','child-stay','child-rest'].includes(action)) { this.childAction(action);return;}
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
      if(!this.dialog.classList.contains('hidden')){this.dialog.classList.add('hidden');this.dialogPartner=undefined;this.dialogKit=undefined;return;}
      const child=this.nearestKit();if(child){this.openKit(child);return;}
      const partner = this.nearestPartner();
      if (partner) { this.openPartner(partner); return; }
      if(this.sheltered){this.toast('Наведи прицел на земляную стену и нажми ЛКМ, чтобы копать.');return;}
      const r = this.world.nearestResource(p.x, p.z, 2.3);
      if (r) {
        if(this.store.carried()>=this.store.capacity){this.toast('Запасы в лапах переполнены. Сложи еду в тайник (K).');return;}
        this.world.harvest(r, this.save.clock); this.save.inventory[r.kind]++;
        if(r.kind==='clover')this.save.materials.grass++;
        if(r.kind==='berries'||r.kind==='mushroom')this.save.materials.twigs++;
        this.sound.play('pickup'); this.toast(`Собрано: ${FOOD[r.kind].label.toLowerCase()} ${FOOD[r.kind].emoji}${r.kind==='clover'?' и трава':r.kind==='berries'||r.kind==='mushroom'?' и ветки':''}`); return;
      }
      this.toast('Рядом нет кролика или еды.'); return;
    }
    if (action === 'eat') {
      const items=(Object.keys(FOOD) as FoodKind[]).filter(k=>this.save.inventory[k]>0);
      const stash=this.nearestStash();
      const stored=(Object.keys(FOOD) as FoodKind[]).filter(k=>(stash?.food[k]??0)>0);
      if(!items.length&&!stored.length){this.toast('Запасы пусты. Найди растения и нажми E.');return;}
      this.dialogPartner=undefined;this.dialogKit=undefined;this.dialog.classList.remove('hidden');
      this.dialog.innerHTML=`<div class="dialog-top"><div><div class="eyebrow">МОИ ЗАПАСЫ</div><h2>Что съесть?</h2></div><button data-action="close">×</button></div><p class="dialog-meta">Некоторые лесные продукты могут быть опасными. Выбирай внимательно.</p><div class="dialog-choices">${items.map(k=>`<button data-action="consume:${k}">${FOOD[k].emoji} ${FOOD[k].label} · в лапах ${this.save.inventory[k]}</button>`).join('')}${stored.map(k=>`<button data-action="consume-stash:${k}">${FOOD[k].emoji} ${FOOD[k].label} · из тайника ${stash?.food[k]}</button>`).join('')}</div>`;return;
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
      this.toast(amount?`${action==='store'?'Сложено':'Взято'} ${amount} порций еды.`:'Сейчас нечего перекладывать.');return;
    }
    if (action === 'sleep') {
      if (!this.sheltered&&!this.nearestNest(2.5)) { this.toast('Спать можно в укрытом ходе или у гнезда.'); return; }
      this.save.clock += 330; p.age += 330 / 1440;
      if (this.save.pregnancy) { this.save.pregnancy.progress += 330 / 1440; if (this.save.pregnancy.progress >= 1.2) this.giveBirth(); }
      for (const kit of this.save.kits) if (kit.alive) kit.age += 330 / 1440;
      p.energy = clamp(p.energy + 65, 0, 100); p.hunger = clamp(p.hunger - 17, 0, 100);p.thirst=clamp(p.thirst-20,0,100); p.bladder = clamp(p.bladder + 15, 0, 100);p.bodyTemp=clamp(p.bodyTemp+1.5,28,39);
      p.health = clamp(p.health + 8, 0, 100); this.playAction('lie',2.8);this.toast('Ты выспалась в укромном месте. Прошло несколько часов.'); return;
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
    this.dialogPartner=p;this.dialogKit=undefined;this.journal.classList.add('hidden');
    this.dialog.classList.remove('hidden');
    this.dialog.innerHTML=this.panels.partner(p,this.compatibility(p),line,this.save.mateId===p.id);
  }

  private partnerAction(action: string): void {
    const p = this.dialogPartner; if (!p) return;
    let line='';
    if(action==='divorce'&&this.save.mateId===p.id){
      this.save.mateId=undefined;p.trust=clamp(p.trust-15,0,100);
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
      this.playAction('mate',3.1);this.mating={fatherId:p.id,until:this.elapsed+3.1};
      const actor=this.rabbits.find(r=>r.data.id===p.id);if(actor)setRabbitAction(actor.rig,'mate',this.elapsed+p.id,3.1);
      this.sound.play('baby'); this.dialog.classList.add('hidden'); this.dialogPartner = undefined;
      this.toast(`Ты и ${p.name} стали парой. Скоро в семье появятся крольчата!`); return;
    }
    this.sound.play('chirp');this.openPartner(p,line);
  }

  private openKit(kit:KitData,line?:string):void {
    this.dialogKit=kit;this.dialogPartner=undefined;this.dialog.classList.remove('hidden');
    this.journal.classList.add('hidden');this.dialog.innerHTML=this.panels.kit(kit,line);
  }

  private childAction(action:string):void {
    const kit=this.dialogKit;if(!kit)return;
    if(kit.independent){this.dialog.classList.add('hidden');return;}
    kit.command=action==='child-follow'?'follow':action==='child-stay'?'stay':'rest';
    const rig=this.kitMeshes.get(kit.id);
    if(rig)rig.root.userData.actionUntil=0;
    if(kit.command==='stay'||kit.command==='rest'){
      const pos=this.kitMeshes.get(kit.id)?.root.position;
      kit.stayX=kit.x??pos?.x;kit.stayZ=kit.z??pos?.z;kit.stayY=kit.y??pos?.y;
    }
    this.sound.play('baby');this.openKit(kit,action==='child-follow'?'Хорошо, пойду за тобой!':action==='child-stay'?'Я подожду здесь.':'Свернусь клубочком и отдохну.');
  }

  private giveBirth(): void {
    const pregnancy = this.save.pregnancy; if (!pregnancy) return;
    const father = this.save.partners.find(p => p.id === pregnancy.fatherId);
    if (!father) { this.save.pregnancy = null; return; }
    const nest=this.nearestNest(6);
    const home=nest??this.save.player;
    const count = this.rng.int(2, 5);
    for (let i = 0; i < count; i++) {
      const id = Math.max(0, ...this.save.kits.map(k => k.id)) + 1;
      const name = this.rng.pick(this.rng.chance(0.5) ? femaleNames : maleNames);
      const kit: KitData = { id, name, genes: this.factory.inherit(this.save.player.genes, father.genes), age: 0, hunger: 85, health: 100, father: father.name, homeX:home.x,homeY:home.y,homeZ:home.z,x:home.x+Math.cos(id*2.4)*0.7,y:home.y,z:home.z+Math.sin(id*2.4)*0.7,nestId:nest?.id, command:'stay',alive: true };
      this.save.kits.push(kit); this.addKit(kit);
    }
    this.save.stats.births += count; this.save.pregnancy = null;
    this.sound.play('baby'); this.toast(`Родились крольчата: ${count}! ${nest?'Они устроились в подготовленном гнезде.':'Для них срочно нужно тёплое гнездо.'}`);
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
      this.nearestPartner(),this.sheltered?undefined:this.world.nearestResource(p.x,p.z,2.3),this.nearestStash(),this.nearestKit());
  }

  private toggleJournal(mode:string):void {
    if(!this.journal.classList.contains('hidden')&&this.journal.dataset.mode===mode){this.journal.classList.add('hidden');return;}
    this.dialog.classList.add('hidden');this.dialogPartner=undefined;this.dialogKit=undefined;
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
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `<div class="dialog-card"><div class="eyebrow">ЛЕС ПОМНИТ КАЖДУЮ ИСТОРИЮ</div><h2>История завершилась</h2><p>Ты прожила ${this.save.day} дней, дала жизнь ${this.save.stats.births} крольчатам и вырастила ${this.save.stats.grown} из них.</p><div class="dialog-actions"><button class="primary" data-action="new">Начать новую историю</button><button data-action="load">Вернуться к сохранению</button></div></div>`;
  }
}
