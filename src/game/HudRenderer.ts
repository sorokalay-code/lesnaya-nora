import type { Excavation } from './Excavation';
import type { FoodStore, SeasonSystem } from './Systems';
import { FOOD, type FoodKind, type KitData, type PartnerTraits, type SaveData, type StashData } from './types';
import type { Resource, World } from './World';

const fmt=(value:number)=>Math.round(value);

/** Read-only presenter: game rules never depend on HTML layout. */
export class HudRenderer {
  constructor(private readonly hud:HTMLElement,private readonly prompt:HTMLElement,private readonly info:HTMLElement){}

  render(save:SaveData,world:World,earth:Excavation,firstPerson:boolean,store:FoodStore,seasons:SeasonSystem,
    airTemperature:number,threat:number,partner?:PartnerTraits,resource?:Resource,stash?:StashData,child?:KitData):void{
    const p=save.player,underground=earth.isSheltered(p.x,p.y,p.z);
    const weather={clear:'☀ Ясно',rain:'☂ Дождь',mist:'☁ Туман',snow:'❄ Снег'}[save.weather];
    const biome=underground?`Под землёй · ${fmt(earth.depthAt(p.x,p.y,p.z))} м`:
      {forest:'Лес',meadow:'Луг',swamp:'Болото',garden:'Огород'}[world.biomeAt(p.x,p.z)];
    const bar=(label:string,value:number,color:string,icon:string)=>`<div class="stat"><span>${icon} ${label}</span><div class="meter"><i style="width:${fmt(value)}%;background:${color}"></i></div><b>${fmt(value)}</b></div>`;
    const foods=(Object.keys(FOOD) as FoodKind[]).filter(k=>save.inventory[k]>0)
      .map(k=>`<span title="${FOOD[k].label}">${FOOD[k].emoji} ${save.inventory[k]}</span>`).join('')||'<span>Пусто</span>';
    const young=save.kits.filter(k=>k.alive&&k.age<3);
    this.hud.innerHTML=`<div class="status-card"><div class="card-heading">СОСТОЯНИЕ <span>${underground?'● ПОД ЗЕМЛЁЙ':threat<8?'● ОПАСНОСТЬ':'● В ЛЕСУ'}</span></div>${bar('Сытость',p.hunger,'#bdcf79','✿')}${bar('Жажда',p.thirst,'#93bcca','◈')}${bar('Силы',p.energy,'#93c5ab','◆')}${bar('Здоровье',p.health,'#dc9f9a','♥')}${bar('Моча L',p.bladder,'#c7a8cc','◌')}${bar('Помёт P',p.bowel,'#bba586','●')}${bar('Чистота',100-p.dirtiness,'#e4c894','✧')}${p.poison>1?bar('Отравление',p.poison,'#b47b9c','☠'):''}<div class="temperature">Температура тела: <b>${p.bodyTemp.toFixed(1)}°</b> ${p.bodyTemp<34?'⚠ Переохлаждение':''}</div><div class="inventory"><b>ЕДА ${store.carried()}/${store.capacity} · МОЛОКО ${fmt(p.milk)}%</b><div>${foods}</div><small>Трава ${save.materials.grass} · ветки ${save.materials.twigs} · пух ${save.materials.fur}</small></div></div><div class="family-card"><div class="card-heading">МОЯ СЕМЬЯ</div><strong>${young.length} <small>крольчат</small></strong><span>${young.length?`${young.length} малышей нуждаются в заботе`:save.pregnancy?`Беременность: ${fmt(save.pregnancy.progress/1.2*100)}%`:save.mateId!==undefined?'Партнёр возвращается домой после поисков еды':'Найди партнёра и создай семью'}</span><div class="family-line"><span>Выросли: ${save.stats.grown}</span><span>Гнёзда: ${save.nests.length}</span></div></div>`;
    const minutes=Math.floor(save.clock%1440),clock=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    const hour=minutes/60,daypart=hour<5||hour>=21?'Ночь':hour<10?'Утро':hour<17?'День':'Вечер';
    this.info.innerHTML=`<span>◷ День ${save.day} · ${clock} · ${daypart}</span><span>✿ ${seasons.name(save.day)}</span><span>${weather} · ${fmt(airTemperature)}°C</span><span>⌁ ${biome}</span>`;
    const root=underground?world.rootAt(p.x,p.z,earth.depthAt(p.x,p.y,p.z)):undefined;
    const digHint=firstPerson?'ЛКМ — копать по прицелу · удерживай для продолжения':'<kbd>B</kbd> Переключись на вид от первого лица для копания';
    this.prompt.innerHTML=underground?`<span>${digHint} · иди по склону</span> ${root?.available&&(!('mesh' in root)||root.mesh.visible)?`&nbsp; <kbd>Q</kbd> Грызть корень ${'tree' in root?'':'&nbsp; <kbd>T</kbd> Унести растение'}`:''} ${stash?'&nbsp; <kbd>K/O</kbd> Тайник':''}`:
      child?`<kbd>E</kbd> Поговорить: ${child.name}`:partner?`<kbd>E</kbd> Поговорить: ${partner.name}`:
      resource?`<kbd>E</kbd> Собрать: ${FOOD[resource.kind].label}`:
      `${digHint} ${stash?'&nbsp; <kbd>K/O</kbd> Тайник':''} ${world.nearWater(p.x,p.z)?'&nbsp; <kbd>V</kbd> Пить воду':''}`;
  }
}
