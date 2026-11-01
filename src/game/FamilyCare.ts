import type { Excavation } from './Excavation';
import type { KitData, NestData, SaveData } from './types';

export type PregnancyEvent='none'|'warning'|'birth';

/** Advances pregnancy and validates the physical birth place. */
export class FamilyCare {
  constructor(private readonly save:SaveData,private readonly earth:Excavation){}

  advance(minutes:number):PregnancyEvent{
    const pregnancy=this.save.pregnancy;
    if(!pregnancy)return 'none';
    pregnancy.progress+=minutes/1440;
    if(!pregnancy.warned&&pregnancy.progress>=0.9){
      pregnancy.warned=true;
      // A long sleep cannot skip both the warning and the birth in one action.
      pregnancy.progress=Math.min(pregnancy.progress,1.18);
      return 'warning';
    }
    return pregnancy.progress>=1.2?'birth':'none';
  }

  birthNest(radius=2.3):NestData|undefined{
    const p=this.save.player;
    if(!this.earth.isSheltered(p.x,p.y,p.z))return;
    return this.save.nests.filter(n=>this.earth.isSheltered(n.x,n.y,n.z)&&Math.hypot(n.x-p.x,n.y-p.y,n.z-p.z)<=radius)
      .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z))[0];
  }

  static growth(kit:KitData):{progress:number;daysLeft:number;feedsNeeded:number;food:string}{
    return{progress:Math.min(100,Math.round(kit.age/3*100)),daysLeft:Math.max(0,Math.ceil(3-kit.age)),
      feedsNeeded:Math.ceil(Math.max(0,85-kit.hunger)/(kit.age<0.8?35:26)),food:kit.age<0.8?'молоко':'молоко или овощи'};
  }
}
