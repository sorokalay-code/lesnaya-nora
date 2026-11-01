import type { SaveData } from './types';

/** Version 2 is intentionally independent of the previous burrow saves. */
export class SaveRepository {
  constructor(private readonly key='lesnaya-nora-save-v2'){}
  exists():boolean{try{return !!localStorage.getItem(this.key);}catch{return false;}}
  store(save:SaveData):void{localStorage.setItem(this.key,JSON.stringify(save));}
  load():SaveData{
    const raw=localStorage.getItem(this.key);if(!raw)throw new Error('Новое сохранение не найдено');
    const data=JSON.parse(raw) as SaveData;
    if(data.version!==2||!Number.isFinite(data.seed)||!Array.isArray(data.excavation)||!Array.isArray(data.nests)||!Array.isArray(data.stashes)||!Number.isFinite(data.player?.y))
      throw new Error('Сохранение новой версии повреждено');
    if(!Number.isFinite(data.player.bowel))data.player.bowel=15;
    if(data.mateId===undefined&&data.pregnancy)data.mateId=data.pregnancy.fatherId;
    if(data.calendarVersion!==2){
      const oldDay=Math.max(1,data.day),oldCycle=Math.floor((oldDay-1)/24);
      const season=Math.floor(((oldDay-1)%24)/6),within=(oldDay-1)%6;
      const newDay=oldCycle*120+season*30+within*5+1;
      data.clock+=(newDay-oldDay)*1440;data.day=newDay;data.calendarVersion=2;
    }
    for(const kit of data.kits)if(kit.age>=3&&!kit.independent){
      kit.independent=true;kit.command=undefined;
      kit.homeX+=Math.cos(kit.id*2.4)*22;kit.homeZ+=Math.sin(kit.id*2.4)*22;
      kit.nestId=undefined;
    }
    return data;
  }
}
