import { Random } from './Random';
import { Predator, RabbitActor } from './Entities';
import type { SaveData } from './types';
import type { Underground } from './Underground';

export type BurrowEvent={type:'fox-entered'|'fox-attack'|'kit-attack';name?:string};

/** Surface animals use entrances and obey the burrow's depth and scent. */
export class BurrowTraffic {
  private visits=new Map<Predator,{burrowId:number;until:number;lastHit:number}>();
  constructor(private readonly rng:Random){}
  update(dt:number,time:number,night:boolean,predators:Predator[],rabbits:RabbitActor[],save:SaveData,current?:Underground):BurrowEvent[]{
    const events:BurrowEvent[]=[];
    for(const actor of rabbits){
      const b=current?.burrow;
      if(b&&current.level===0&&actor.data.trust>=55&&Math.hypot(actor.data.x-b.x,actor.data.z-b.z)<12){
        actor.rig.root.position.set(b.x+1.25,-6,b.z+1.1);
        actor.rig.root.userData.baseY=-6;
      }else actor.rig.root.userData.baseY=0;
    }
    for(const predator of predators){
      if(predator.kind!=='fox')continue;
      const visit=this.visits.get(predator);
      if(visit){
        const burrow=save.burrows.find(b=>b.id===visit.burrowId);
        if(!burrow||time>visit.until){this.visits.delete(predator);continue;}
        predator.root.position.set(burrow.x+Math.sin(time*0.8)*0.85,-6,burrow.z+Math.cos(time*0.8)*0.85);
        if(current?.burrow.id===burrow.id&&current.level===0&&save.underground&&Math.hypot(save.underground.x,save.underground.z)<2.5&&time-visit.lastHit>4){
          visit.lastHit=time;events.push({type:'fox-attack'});
        }
        const kit=save.kits.find(k=>k.alive&&k.age<3&&k.command!=='follow'&&k.burrowId===burrow.id&&k.nestId!==undefined&&save.nests.find(n=>n.id===k.nestId)?.level===0);
        if(kit&&time-visit.lastHit>5){visit.lastHit=time;kit.health=Math.max(0,kit.health-12);events.push({type:'kit-attack',name:kit.name});}
        continue;
      }
      if(!night)continue;
      const candidate=save.burrows.find(b=>b.depth<3&&Math.hypot(predator.x-b.x,predator.z-b.z)<2.6&&(
        save.kits.some(k=>k.alive&&k.age<3&&k.burrowId===b.id)||save.waste.some(w=>Math.hypot(w.x-b.x,w.z-b.z)<4)));
      if(candidate&&this.rng.chance(dt*0.12)){
        this.visits.set(predator,{burrowId:candidate.id,until:time+15,lastHit:time});
        events.push({type:'fox-entered'});
      }
    }
    return events;
  }
}
