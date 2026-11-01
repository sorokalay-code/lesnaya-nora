import type { World } from './World';
import type { KitData, PartnerTraits, SaveData, Season } from './types';

const fmt=(value:number)=>Math.round(value);
const coatName=(coat:string)=>({cream:'кремовый',brown:'бурый',gray:'серый',black:'чёрный',white:'белый'} as Record<string,string>)[coat]||coat;

/** Dialog and journal views are kept apart from rules and interaction state. */
export class PanelRenderer {
  partner(p:PartnerTraits,score:number,line?:string,paired=false):string{
    const preference={speed:'быстроту',vitality:'здоровье','rare-coat':'редкий окрас',bond:'близость и доверие'}[p.preference];
    return `<div class="dialog-top"><div><div class="eyebrow">ЛЕСНОЙ РАЗГОВОР</div><h2>${p.name}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??(paired?'Я вернулся домой. Рад тебя видеть!':p.temperament==='осторожный'?'Сначала давай узнаем друг друга получше.':'Рад тебя видеть! Что хочешь узнать?')}»</p><p class="dialog-meta">${paired?'Твой партнёр · ':''}${p.temperament} крол · семья: ${p.familySize} · ценит ${preference}</p><div class="gene-list"><span>Окрас: ${coatName(p.genes.coat)}</span><span>Скорость: ${'◆'.repeat(p.genes.speed)}</span><span>Здоровье: ${'◆'.repeat(p.genes.vitality)}</span><span>Доверие: ${fmt(p.trust)}/100</span><span>Совместимость: ${fmt(score)}/100</span></div><div class="dialog-choices"><button data-action="ask-home">Как живёт твоя семья?</button><button data-action="ask-food">Где искать еду и воду?</button><button data-action="ask-danger">Чего ты опасаешься?</button><button data-action="compliment">Ты мне нравишься</button><button data-action="gift">Подарить еду</button><button class="primary" data-action="court">${paired?'Планировать новых крольчат':'Предложить создать семью'}</button>${paired?'<button data-action="divorce">Разойтись</button>':''}</div>`;
  }
  kit(kit:KitData,line?:string):string{
    return `<div class="dialog-top"><div><div class="eyebrow">МОЯ СЕМЬЯ</div><h2>${kit.name}</h2></div><button data-action="close" aria-label="Закрыть">×</button></div><p class="speech">«${line??(kit.age<3?'Мама, побудь со мной!':'Я уже вырос, но мне всё ещё хорошо рядом с тобой.')}»</p><p class="dialog-meta">${kit.age<3?'Крольчонок':'Взрослый кролик'} · сытость ${fmt(kit.hunger)}% · здоровье ${fmt(kit.health)}%</p><div class="dialog-choices"><button data-action="child-follow">Иди за мной</button><button data-action="child-stay">Жди здесь</button><button data-action="child-rest">Отдыхай в гнезде</button></div>`;
  }
  journal(save:SaveData,season:Season):string{
    const kits=save.kits.filter(k=>k.alive).map(k=>`<div class="kit-row"><b>${k.name}</b><span>${k.independent?'взрослый · живёт самостоятельно':`малыш · сытость ${fmt(k.hunger)}% · здоровье ${fmt(k.health)}%`} · отец ${k.father}</span></div>`).join('')||'<p>Пока крольчат нет. Знакомься с кролами в лесу.</p>';
    const stashes=save.stashes.map(s=>`<div class="kit-row"><b>Тайник ${s.id}</b><span>Еды ${Object.values(s.food).reduce((sum,n)=>sum+(n??0),0)} порций</span></div>`).join('');
    return `<div class="journal-head"><h2>Лесной дневник</h2><button data-action="journal">×</button></div><div class="journal-stat"><span>День ${save.day}</span><span>${season}</span><span>Родились: ${save.stats.births}</span><span>Выросли: ${save.stats.grown}</span></div><h3>Семья</h3><p>${save.mateId===undefined?'Партнёра пока нет.':`Партнёр: ${save.partners.find(p=>p.id===save.mateId)?.name??'крол'}.`}</p>${kits}<h3>Раскопки и запасы</h3>${stashes}<p>Выкопано участков: ${save.excavation.length}. Максимальная глубина — 50 м. Гнёзд: ${save.nests.length}. Лисы и ласки могут проникнуть в неглубокие ходы по запаху.</p><h3>Как выжить</h3><p>Зимой пищи мало — осенью складывай её в тайник клавишей K. G позволяет есть из соседнего тайника. ЛКМ копает землю по прицелу, Z копает вниз, мышь вращает камеру. Под растениями можно грызть корни (Q) и уносить овощи (T), у деревьев — кору (H). Вылизывай шерсть (C) после загрязнения.</p>`;
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
