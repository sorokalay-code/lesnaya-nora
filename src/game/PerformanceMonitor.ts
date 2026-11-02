import type {WebGLRenderer} from 'three';

/** Optional in-game measurements, enabled with F3 or ?profile=1. */
export class PerformanceMonitor {
  private readonly panel=document.createElement('pre');
  private samples:number[]=[];
  private updates:number[]=[];
  private renders:number[]=[];
  private nextRefresh=0;
  constructor(host:HTMLElement){
    this.panel.style.cssText='position:absolute;top:70px;left:50%;transform:translateX(-50%);z-index:1000;background:#10291ee8;color:#e8f4d8;padding:10px 14px;border-radius:8px;pointer-events:none;font:12px monospace';
    this.panel.hidden=new URLSearchParams(location.search).get('profile')!=='1';host.append(this.panel);
    window.addEventListener('keydown',event=>{if(event.code==='F3'){event.preventDefault();this.panel.hidden=!this.panel.hidden;}});
  }
  record(renderer:WebGLRenderer,frameMs:number,updateMs:number,renderMs:number):void{
    if(this.panel.hidden)return;
    this.samples.push(frameMs);this.updates.push(updateMs);this.renders.push(renderMs);
    if(this.samples.length>120){this.samples.shift();this.updates.shift();this.renders.shift();}
    const now=performance.now();if(now<this.nextRefresh||!this.samples.length)return;this.nextRefresh=now+500;
    const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
    const sorted=this.samples.slice().sort((a,b)=>a-b),p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))];
    this.panel.textContent=`FPS ${(1000/mean(this.samples)).toFixed(0)} | кадр p95 ${p95.toFixed(1)} мс\nCPU: логика ${mean(this.updates).toFixed(1)} / отправка рендера ${mean(this.renders).toFixed(1)} мс\nDraw calls ${renderer.info.render.calls} | треугольники ${renderer.info.render.triangles.toLocaleString('ru')}\nGPU-ресурсы: геометрия ${renderer.info.memory.geometries} / текстуры ${renderer.info.memory.textures}`;
  }
}
