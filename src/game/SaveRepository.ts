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
    return data;
  }
}
