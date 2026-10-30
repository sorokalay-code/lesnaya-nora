import type { BurrowSystem } from './BurrowSystem';
import type { FoodStore, SeasonSystem } from './Systems';
import { FOOD, type BurrowData, type FoodKind, type KitData, type PartnerTraits, type SaveData } from './types';
import type { Resource, World } from './World';

const fmt=(value:number)=>Math.round(value);

/** Read-only presenter: game rules never depend on HTML layout. */
export class HudRenderer {
  constructor(private readonly hud:HTMLElement,private readonly prompt:HTMLElement,private readonly info:HTMLElement){}

  render(save:SaveData,world:World,burrows:BurrowSystem,store:FoodStore,seasons:SeasonSystem,
    airTemperature:number,threat:number,partner?:PartnerTraits,resource?:Resource,entrance?:BurrowData,child?:KitData):void{
    const p=save.player,underground=burrows.underground;
    const weather={clear:'☀ Ясно',rain:'☂ Дождь',mist:'☁ Туман',snow:'❄ Снег'}[save.weather];
    const biome=underground?`Под землёй · ${burrows.earth.depth(burrows.level)} м`:
      {forest:'Лес',meadow:'Луг',swamp:'Болото',garden:'Огород'}[world.biomeAt(p.x,p.z)];
    const bar=(label:string,value:number,color:string,icon:string)=>`<div class="stat"><span>${icon} ${label}</span><div class="meter"><i style="width:${fmt(value)}%;background:${color}"></i></div><b>${fmt(value)}</b></div>`;
    const foods=(Object.keys(FOOD) as FoodKind[]).filter(k=>save.inventory[k]>0)
      .map(k=>`<span title="${FOOD[k].label}">${FOOD[k].emoji} ${save.inventory[k]}</span>`).join('')||'<span>Пусто</span>';
    const young=save.kits.filter(k=>k.alive&&k.age<3);
    this.hud.innerHTML=`<div class="status-card"><div class="card-heading">СОСТОЯНИЕ <span>${underground?'● ПОД ЗЕМЛЁЙ':threat<8?'● ОПАСНОСТЬ':'● В ЛЕСУ'}</span></div>${bar('Сытость',p.hunger,'#bdcf79','✿')}${bar('Жажда',p.thirst,'#93bcca','◈')}${bar('Силы',p.energy,'#93c5ab','◆')}${bar('Здоровье',p.health,'#dc9f9a','♥')}${bar('Нужда',p.bladder,'#c7a8cc','◌')}${bar('Чистота',100-p.dirtiness,'#e4c894','✧')}${p.poison>1?bar('Отравление',p.poison,'#b47b9c','☠'):''}<div class="temperature">Температура тела: <b>${p.bodyTemp.toFixed(1)}°</b> ${p.bodyTemp<34?'⚠ Переохлаждение':''}</div><div class="inventory"><b>ЕДА ${store.carried()}/${store.capacity} · МОЛОКО ${fmt(p.milk)}%</b><div>${foods}</div><small>Трава ${save.materials.grass} · ветки ${save.materials.twigs} · пух ${save.materials.fur}</small></div></div><div class="family-card"><div class="card-heading">МОЯ СЕМЬЯ</div><strong>${save.kits.filter(k=>k.alive).length} <small>крольчат</small></strong><span>${young.length?`${young.length} малышей нуждаются в заботе`:save.pregnancy?`Беременность: ${fmt(save.pregnancy.progress/1.2*100)}%`:'Найди партнёра и создай семью'}</span><div class="family-line"><span>Выросли: ${save.stats.grown}</span><span>Гнёзда: ${save.nests.length}</span></div></div>`;
    const minutes=Math.floor(save.clock%1440),clock=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    this.info.innerHTML=`<span>◷ День ${save.day} · ${clock}</span><span>✿ ${seasons.name(save.day)}</span><span>${weather} · ${fmt(airTemperature)}°C</span><span>⌁ ${biome}</span>`;
    const root=underground?world.rootAt(p.x,p.z,burrows.earth.depth(burrows.level)):undefined;
    this.prompt.innerHTML=underground?`<kbd>B</kbd> Копать &nbsp; <kbd>Z/X</kbd> Глубже/выше (до 50 м) &nbsp; ${burrows.nearestExit()?'<kbd>H</kbd> Наверх':''} ${root?.available&&(!('mesh' in root)||root.mesh.visible)?`&nbsp; <kbd>Q</kbd> Грызть корень ${'tree' in root?'':'&nbsp; <kbd>T</kbd> Унести растение'}`:''}`:
      child?`<kbd>E</kbd> Поговорить: ${child.name}`:partner?`<kbd>E</kbd> Поговорить: ${partner.name}`:
      resource?`<kbd>E</kbd> Собрать: ${FOOD[resource.kind].label}`:entrance?'<kbd>H</kbd> Спуститься &nbsp; <kbd>R</kbd> Спать &nbsp; <kbd>K/O</kbd> Припасы':
      `<kbd>B</kbd> Выкопать вход ${world.nearWater(p.x,p.z)?'&nbsp; <kbd>V</kbd> Пить воду':''}`;
  }
}
