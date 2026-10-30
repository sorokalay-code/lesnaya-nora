import { FOOD, type FoodKind, type SaveData } from './types';

/** Browser persistence plus migration from the earlier local-burrow format. */
export class SaveRepository {
  constructor(private readonly key='lesnaya-nora-save-v1'){}
  exists():boolean {try{return !!localStorage.getItem(this.key);}catch{return false;}}
  store(save:SaveData):void{localStorage.setItem(this.key,JSON.stringify(save));}
  load():SaveData{
    const raw=localStorage.getItem(this.key);if(!raw)throw new Error('Сохранение не найдено');
    const parsed=JSON.parse(raw) as SaveData;
    if(parsed.version!==1||!Number.isFinite(parsed.seed)||!Array.isArray(parsed.burrows)||!Array.isArray(parsed.partners))throw new Error('Файл сохранения повреждён');
    parsed.player.thirst??=85;parsed.player.bodyTemp??=38.5;
    parsed.player.dirtiness??=0;parsed.player.poison??=0;parsed.player.milk??=35;
    for(const kind of Object.keys(FOOD) as FoodKind[])parsed.inventory[kind]??=0;
    parsed.waste??=[];parsed.harvested??=[];
    parsed.gnawedRoots??={};
    parsed.burrows.forEach(b=>{b.storedFood??={};});
    parsed.nests??=[];parsed.materials??={grass:0,twigs:0,fur:0};parsed.underground??=null;
    parsed.kits.forEach(k=>{k.command??='stay';});
    if(!parsed.excavation){
      parsed.excavation=[];
      for(const b of parsed.burrows){
        for(const cell of b.cells?.length?b.cells:['0:0,0','0:0,1','0:1,0','0:-1,0','0:0,-1']){
          const [level,position]=cell.includes(':')?cell.split(':'):['0',cell];
          const [x,z]=position.split(',').map(Number);
          parsed.excavation.push(`${level}:${Math.round(b.x/2)+x},${Math.round(b.z/2)+z}`);
        }
      }
      for(const nest of parsed.nests)if(nest.burrowId!==null){
        const b=parsed.burrows.find(v=>v.id===nest.burrowId);
        if(b){nest.x+=b.x;nest.z+=b.z;}
      }
      if(parsed.underground){
        const b=parsed.burrows.find(v=>v.id===parsed.underground?.burrowId);
        if(b){parsed.underground.x+=b.x;parsed.underground.z+=b.z;}
      }
      for(const kit of parsed.kits)if((kit.stayY??0)<-3)kit.stayY=undefined;
    }
    if(parsed.underground){parsed.underground.level??=0;parsed.player.x=parsed.underground.x;parsed.player.z=parsed.underground.z;}
    return parsed;
  }
}
