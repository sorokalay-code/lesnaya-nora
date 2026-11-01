import type { Excavation } from './Excavation';
import type { GroundHeight } from './Entities';
import { Random } from './Random';
import type { KitData } from './types';

type Point={x:number;y:number;z:number};

/** Gives each kit a separate, persistent short-term destination instead of orbiting a nest. */
export class KitWander {
  private readonly targets=new Map<number,{point:Point;until:number}>();
  constructor(private readonly rng:Random){}

  target(kit:KitData,home:Point,time:number,earth:Excavation,groundAt:GroundHeight):Point{
    const current={x:kit.x??home.x,y:kit.y??home.y,z:kit.z??home.z};
    const previous=this.targets.get(kit.id);
    if(previous&&time<previous.until&&Math.hypot(previous.point.x-current.x,previous.point.z-current.z)>0.3)return previous.point;
    let point=home;
    for(let attempt=0;attempt<16;attempt++){
      const angle=this.rng.range(0,Math.PI*2),radius=this.rng.range(0.5,kit.independent?7:3.1);
      const x=home.x+Math.cos(angle)*radius,z=home.z+Math.sin(angle)*radius;
      const y=kit.independent?groundAt(x,z):earth.floorAt(x,z,home.y);
      if(!kit.independent&&earth.isSheltered(home.x,home.y,home.z)&&!earth.isSheltered(x,y,z))continue;
      if(!kit.independent&&!earth.canMoveTo(x,z,current.y,earth.isSheltered(current.x,current.y,current.z)))continue;
      point={x,y,z};break;
    }
    this.targets.set(kit.id,{point,until:time+this.rng.range(3,8)});
    return point;
  }
  forget(id:number):void{this.targets.delete(id);}
}
