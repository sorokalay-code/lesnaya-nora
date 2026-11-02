import type { World } from './World';
import type { KitData, PartnerTraits, SaveData, Season } from './types';
import type { ForestAnimal, WildlifeKind } from './Wildlife';
import { FamilyCare } from './FamilyCare';

const fmt=(value:number)=>Math.round(value);
const coatName=(coat:string)=>({cream:'кремовый',brown:'бурый',gray:'серый',black:'чёрный',white:'белый'} as Record<string,string>)[coat]||coat;
export const animalNames:Record<WildlifeKind,string>={deer:'Олень',squirrel:'Белка',hedgehog:'Ёж',beaver:'Бобр',moose:'Лось'};
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Dialog and journal views are kept apart from rules and interaction state. */
export class PanelRenderer {
  selfProfile(save:SaveData):string{
    const p=save.player;
    return `<div class="dialog-top"><div><div class="eyebrow">МОЯ КРОЛЬЧИХА</div><h2>Твоя история</h2></div><button data-action="close">×</button></div><p class="dialog-meta">Окрас: ${coatName(p.genes.coat)} · возраст ${p.age.toFixed(1)} игровых дней</p><div class="gene-list"><span>Здоровье ${fmt(p.health)}%</span><span>Силы ${fmt(p.energy)}%</span><span>Сытость ${fmt(p.hunger)}%</span><span>Молоко ${fmt(p.milk)}%</span></div><p class="speech">${save.pregnancy?'Ты ждёшь крольчат. Для родов нужно гнездо внутри выкопанной земли.':'Лес полон тропинок и новых встреч.'}</p>`;
  }
  matePanel(save:SaveData,partner:PartnerTraits):string{
    const command=save.mateCommand??'forage';
    const chat=(save.mateMessages??[]).slice(-6).map(m=>`<p><b>${m.from==='player'?'Ты':escapeHtml(partner.name)}:</b> ${escapeHtml(m.text)}</p>`).join('');
    const button=(key:string,label:string,shortcut:number)=>`<button class="${command===key?'primary':''}" data-action="mate-command:${key}" aria-pressed="${command===key}"><kbd>${shortcut}</kbd> ${label}</button>`;
    return `<div class="dialog-top"><div><div class="eyebrow">МОЯ СЕМЬЯ</div><h2>${escapeHtml(partner.name)}</h2></div><button data-action="close">×</button></div><p class="dialog-shortcuts">1–4 — приказы · Enter — написать · Esc — вернуться в лес</p><p class="dialog-meta">Партнёр · ${partner.temperament} · доверие ${fmt(partner.trust)}/100</p><p class="speech">«Я рядом. Скажи, чем помочь нашей семье.»</p><div class="dialog-choices">${button('follow','Иди за мной',1)}${button('stay','Жди здесь',2)}${button('forage','Найди припасы для тайника',3)}${button('home','Вернись домой',4)}<button data-action="mate-talk">Поговорить о семье</button></div><div class="mate-chat">${chat}</div><input id="mate-message" class="mate-message" maxlength="120" placeholder="Написать партнёру..." aria-label="Сообщение партнёру"><div class="dialog-choices"><button data-action="mate-send">Передать сообщение ↵ Enter</button></div>`;
  }
  animal(animal:ForestAnimal,line?:string):string{
    const greeting={deer:'Олень остановился и прислушался к шорохам.',squirrel:'Белка зацокала и спрыгнула на нижнюю ветку.',hedgehog:'Ёж осторожно выглянул из травы.',beaver:'Бобр приветственно шлёпнул хвостом.',moose:'Лось спокойно склонил голову.'}[animal.kind];
    return `<div class="dialog-top"><div><div class="eyebrow">ВСТРЕЧА В ЛЕСУ</div><h2>${animalNames[animal.kind]}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??greeting}»</p><p class="dialog-meta">${animal.mood} · здоровье ${fmt(animal.health)}/${fmt(animal.maxHealth)} · доверие ${fmt(animal.trust)}/100</p><div class="dialog-choices"><button data-action="animal-observe">Как ты себя чувствуешь?</button><button data-action="animal-path">Где искать еду и укрытие?</button><button data-action="animal-food">Угостить едой</button></div>`;
  }
  partner(p:PartnerTraits,score:number,line?:string,paired=false):string{
    const preference={speed:'быстроту',vitality:'здоровье','rare-coat':'редкий окрас',bond:'близость и доверие'}[p.preference];
    return `<div class="dialog-top"><div><div class="eyebrow">ЛЕСНОЙ РАЗГОВОР</div><h2>${p.name}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??(paired?'Я вернулся домой. Рад тебя видеть!':p.temperament==='осторожный'?'Сначала давай узнаем друг друга получше.':'Рад тебя видеть! Что хочешь узнать?')}»</p><p class="dialog-meta">${paired?'Твой партнёр · ':''}${p.temperament} крол · семья: ${p.familySize} · ценит ${preference}</p><div class="gene-list"><span>Окрас: ${coatName(p.genes.coat)}</span><span>Скорость: ${'◆'.repeat(p.genes.speed)}</span><span>Здоровье: ${'◆'.repeat(p.genes.vitality)}</span><span>Доверие: ${fmt(p.trust)}/100</span><span>Совместимость: ${fmt(score)}/100</span></div><div class="dialog-choices"><button data-action="ask-home">Как живёт твоя семья?</button><button data-action="ask-food">Где искать еду и воду?</button><button data-action="ask-danger">Чего ты опасаешься?</button><button data-action="compliment">Ты мне нравишься</button><button data-action="gift">Подарить еду</button><button class="primary" data-action="court">${paired?'Планировать новых крольчат':'Предложить создать семью'}</button>${paired?'<button data-action="divorce">Разойтись</button>':''}</div>`;
  }
  kit(kit:KitData,line?:string):string{
    return `<div class="dialog-top"><div><div class="eyebrow">МОЯ СЕМЬЯ</div><h2>${kit.name}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??(kit.age<3?'Мама, побудь со мной!':'Я уже вырос, но мне всё ещё хорошо рядом с тобой.')}»</p><p class="dialog-meta">${kit.age<3?'Крольчонок':'Взрослый кролик'} · сытость ${fmt(kit.hunger)}% · здоровье ${fmt(kit.health)}%</p><div class="dialog-choices"><button data-action="child-follow">Иди за мной</button><button data-action="child-stay">Жди здесь</button><button data-action="child-rest">Отдыхай в гнезде</button></div>`;
  }
  journal(save:SaveData,season:Season):string{
    const kits=save.kits.filter(k=>k.alive).map(k=>`<div class="kit-row"><b>${k.name}</b><span>${k.independent?'взрослый · живёт самостоятельно':`малыш · рост ${FamilyCare.growth(k).progress}% · сытость ${fmt(k.hunger)}% · здоровье ${fmt(k.health)}%`} · отец ${k.father}</span></div>`).join('')||'<p>Пока крольчат нет. Знакомься с кролами в лесу.</p>';
    const stashes=save.stashes.map(s=>`<div class="kit-row"><b>Тайник ${s.id}</b><span>Еда: ${Object.values(s.food).reduce((sum,n)=>sum+(n??0),0)} · ветки: ${s.materials?.twigs??0} · трава: ${s.materials?.grass??0} · пух: ${s.materials?.fur??0}</span></div>`).join('');
    return `<div class="journal-head"><h2>Лесной дневник</h2><button data-action="journal">×</button></div><div class="journal-stat"><span>День ${save.day}</span><span>${season}</span><span>Родились: ${save.stats.births}</span><span>Выросли: ${save.stats.grown}</span><span>Не выжили при родах: ${save.stats.stillborn??0}</span></div><h3>Семья</h3><p>${save.mateId===undefined?'Партнёра пока нет.':`Партнёр: ${save.partners.find(p=>p.id===save.mateId)?.name??'крол'}.`}</p>${kits}<h3>Раскопки и запасы</h3>${stashes}<p>Выкопано участков: ${save.excavation.length}. Максимальная глубина — 50 м. Гнёзд: ${save.nests.length}. Роды безопасны только в гнезде внутри выкопанного хода.</p><h3>Как выжить</h3><p>Зимой пищи мало — осенью складывай её в тайник клавишей K. G позволяет есть из тайника или выбросить лишний продукт. Ветки лежат под деревьями, собери их клавишей E. Tab открывает команды партнёру и сообщения; 1–4 дают приказы, Enter позволяет написать, Esc возвращает управление. ЛКМ копает землю, Z копает вниз. Под растениями можно грызть корни (Q), у деревьев — кору (H). Вылизывай шерсть (C) после загрязнения.</p>`;
  }
  map(canvas:HTMLCanvasElement,world:World,save:SaveData):void{
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const s=420,step=7;ctx.clearRect(0,0,s,s);
    for(let y=0;y<s;y+=step)for(let x=0;x<s;x+=step){
      const wx=(x/s-0.5)*220,wz=(y/s-0.5)*220;
      ctx.fillStyle={forest:'#426e51',meadow:'#88a969',swamp:'#5d8c80',garden:'#b69b66'}[world.biomeAt(wx,wz)];ctx.fillRect(x,y,step,step);
    }
    for(const l of world.landmarks){
      const x=(l.x/220+0.5)*s,y=(l.z/220+0.5)*s;
      ctx.fillStyle='#f8e9cc';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
      ctx.font='11px sans-serif';ctx.fillText(l.label,x+8,y+4);
    }
    for(const node of save.excavation){
      if(node.y<world.heightAt(node.x,node.z)-0.5)continue;
      ctx.fillStyle='#513d2b';ctx.beginPath();ctx.arc((node.x/220+0.5)*s,(node.z/220+0.5)*s,3,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#fff';ctx.strokeStyle='#24382b';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc((save.player.x/220+0.5)*s,(save.player.z/220+0.5)*s,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
}
