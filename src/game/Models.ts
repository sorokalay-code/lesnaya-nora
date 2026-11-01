import * as THREE from 'three';
import { COAT_COLORS, type Genes, type PredatorKind } from './types';

const sphere = new THREE.SphereGeometry(1, 16, 12);
const cone = new THREE.ConeGeometry(1, 1, 8);

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

export interface RabbitRig { root: THREE.Group; body: THREE.Mesh; leftEar: THREE.Group; rightEar: THREE.Group; paws: THREE.Group[]; eyes: THREE.Mesh[]; tail: THREE.Mesh; head: THREE.Group; }
export type RabbitAction='eat'|'defecate'|'lie'|'sit'|'mate'|'groom'|'pluck'|'nurse'|'dig';
export function setRabbitAction(r:RabbitRig,action:RabbitAction,time:number,duration:number):void{
  r.root.userData.action=action;r.root.userData.actionUntil=time+duration;
}

export function createRabbit(genes: Genes, baby = false): RabbitRig {
  const root = new THREE.Group();
  const s = (baby ? 0.55 : 1) * genes.size;
  root.scale.setScalar(s);
  const fur = new THREE.MeshStandardMaterial({ color: COAT_COLORS[genes.coat], roughness: 0.95 });
  const light = new THREE.MeshStandardMaterial({ color: 0xf7e8d6, roughness: 1 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd88f9b, roughness: 0.9, side: THREE.DoubleSide });
  const eye = new THREE.MeshStandardMaterial({ color: 0x1d211b, roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const body = part(root, sphere, fur, [0, 0.52, 0], [0.4, 0.34, 0.61]);
  part(root, sphere, light, [0, 0.31, 0.27], [0.28, 0.16, 0.27]);
  part(root, sphere, light, [0, 0.68, -0.28], [0.23, 0.22, 0.22]);
  for (const side of [-1,1]) part(root, sphere, light, [side*0.29,0.63,0.32],[0.09,0.07,0.16]);
  const head = new THREE.Group(); head.position.set(0, 0.69, -0.44); root.add(head);
  if(baby)head.scale.setScalar(1.12);
  part(head, sphere, fur, [0, 0, 0], [0.32, 0.3, 0.31]);
  part(head, sphere, light, [0, -0.11, -0.24], [0.19, 0.13, 0.16]);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, sphere, eye, [side * 0.235, 0.065, -0.175], [0.05, 0.064, 0.04]));
    part(head, sphere, shine, [side * 0.245 - 0.012, 0.087, -0.207], [0.014, 0.018, 0.008]);
    part(head, sphere, light, [side*0.12,-0.105,-0.25],[0.125,0.08,0.13]);
    const ear = new THREE.Group(); ear.position.set(side * 0.17, 0.19, 0.065); head.add(ear);
    if(baby)ear.scale.setScalar(0.72);
    ear.rotation.z = side * -0.12;
    part(ear, sphere, fur, [0, genes.ear * 0.31, 0], [0.115, genes.ear * 0.42, 0.07]);
    part(ear, sphere, pink, [0, genes.ear * 0.31, -0.059], [0.067, genes.ear * 0.33, 0.019]);
    if (side === -1) root.userData.leftEar = ear; else root.userData.rightEar = ear;
  }
  part(head, sphere, pink, [0, -0.08, -0.36], [0.063, 0.045, 0.045]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const pts = [new THREE.Vector3(side * 0.08, -0.11, -0.32), new THREE.Vector3(side * (0.37 + i * 0.02), -0.09 + (i - 1) * 0.07, -0.35)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe8e3d8 })); head.add(line);
    }
  }
  const paws: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const rear of [false, true]) {
    const paw = new THREE.Group(); paw.position.set(side * 0.3, 0.23, rear ? 0.39 : -0.35); root.add(paw);
    part(paw, sphere, fur, [0, -0.07, rear ? 0.07 : -0.05], [rear ? 0.2 : 0.13, 0.17, rear ? 0.23 : 0.16]);
    for(let toe=0;toe<3;toe++) part(paw,sphere,light,[(toe-1)*(rear?0.1:0.075),-0.19,rear?-0.11:-0.18],[0.038,0.025,0.06]);
    paws.push(paw);
  }
  const tail = part(root, sphere, light, [0, 0.54, 0.58], [0.17, 0.17, 0.17]);
  return { root, body, leftEar: root.userData.leftEar as THREE.Group, rightEar: root.userData.rightEar as THREE.Group, paws, eyes, tail, head };
}

export function animateRabbit(r: RabbitRig, time: number, moving: boolean, frightened = false, dt = 1/60): void {
  const state = r.root.userData as { motion?: number; phase?: number;action?:RabbitAction;actionUntil?:number };
  const action=state.actionUntil!==undefined&&time<state.actionUntil?state.action:undefined;
  if(!action)state.action=undefined;
  if(action)moving=false;
  state.motion = THREE.MathUtils.damp(state.motion ?? 0, moving ? 1 : 0, 7, dt);
  state.phase = (state.phase ?? 0) + dt * (frightened ? 17 : 11) * Math.max(0.15, state.motion);
  const motion = state.motion, phase = state.phase;
  const lift = Math.pow(Math.max(0, Math.sin(phase)), 1.5) * 0.18 * motion;
  const poseY=action==='lie'||action==='nurse'?-0.17:action==='sit'||action==='defecate'?-0.08:action==='mate'?0.23:action==='dig'?-0.11+Math.sin(time*14)*0.035:0;
  const baseY=(r.root.userData.baseY as number|undefined)??0;
  r.root.position.y = baseY+lift+poseY;
  r.root.rotation.x=THREE.MathUtils.damp(r.root.rotation.x,action==='mate'?-0.18:action==='defecate'?0.08:action==='dig'?0.16:0,8,dt);
  r.body.scale.y = THREE.MathUtils.damp(r.body.scale.y, (action==='lie'||action==='nurse'?0.27:0.34) * (1 - Math.max(0,Math.sin(phase)) * 0.07 * motion), 9, dt);
  const headTarget=action==='eat'?0.4+Math.sin(time*10)*0.07:action==='groom'?0.26+Math.sin(time*7)*0.12:action==='pluck'?-0.25:action==='sit'?-0.14:action==='dig'?0.26+Math.sin(time*14)*0.08:Math.sin(time * 1.7) * 0.035 + Math.sin(phase) * 0.04 * motion;
  r.head.rotation.x = THREE.MathUtils.damp(r.head.rotation.x,headTarget,6,dt);
  r.head.rotation.y=THREE.MathUtils.damp(r.head.rotation.y,action==='groom'?Math.sin(time*4)*0.35:action==='pluck'?0.5:0,6,dt);
  r.leftEar.rotation.z = THREE.MathUtils.damp(r.leftEar.rotation.z, -0.12 + Math.sin(time * 2.2) * 0.035 - motion * 0.08 - (frightened ? 0.14 : 0), 5, dt);
  r.rightEar.rotation.z = THREE.MathUtils.damp(r.rightEar.rotation.z, 0.12 + Math.sin(time * 2.4 + 1) * 0.035 + motion * 0.08 + (frightened ? 0.14 : 0), 5, dt);
  r.tail.rotation.y = Math.sin(time * 4) * 0.13;
  r.paws.forEach((paw, i) => {
    const rear = i % 2 === 1;
    let target = Math.sin(phase + (i < 2 ? 0 : Math.PI) + (rear ? 0.7 : 0)) * (rear ? 0.42 : 0.55) * motion;
    if(action==='groom'&&i<2)target=-0.75+Math.sin(time*9+i)*0.25;
    if(action==='pluck'&&i<2)target=-0.45+Math.sin(time*8+i)*0.15;
    if(action==='eat'&&i<2)target=-0.32+Math.sin(time*8+i)*0.05;
    if(action==='dig')target=i%2===0?-0.7+Math.sin(time*15+i*2.1)*0.55:-0.32+Math.sin(time*15+i*2.1)*0.42;
    if(action==='defecate'&&i>=2)target=0.35;
    if(action==='mate')target=Math.sin(time*11+i)*0.22;
    paw.rotation.x = THREE.MathUtils.damp(paw.rotation.x, target, 12, dt);
    paw.position.y = 0.23 + Math.max(0, Math.sin(phase + i * Math.PI * 0.5)) * 0.055 * motion+(action==='dig'&&i%2===0?Math.max(0,Math.sin(time*15+i*2.1))*0.09:0);
  });
  const blink = Math.sin(time * 0.63 + r.root.id) > 0.997 ? 0.09 : 1;
  r.eyes.forEach(e => { e.scale.y = THREE.MathUtils.damp(e.scale.y, 0.064 * blink, 18, dt); });
}

export function createPredator(kind: PredatorKind): THREE.Group {
  const root = new THREE.Group();
  if(kind==='snake'){
    const skin=new THREE.MeshStandardMaterial({color:0x627447,roughness:0.9});
    for(let i=0;i<8;i++)part(root,sphere,skin,[Math.sin(i*0.65)*0.18,0.13,0.75-i*0.23],[0.18-i*0.012,0.13,0.22]);
    part(root,sphere,skin,[0,0.2,-1.03],[0.25,0.15,0.23]);
    for(const side of [-1,1])part(root,sphere,new THREE.MeshBasicMaterial({color:0x1c2118}),[side*0.17,0.28,-1.17],[0.035,0.035,0.035]);
    root.userData.legs=[];return root;
  }
    if(kind==='bear'){
      const fur=new THREE.MeshStandardMaterial({color:0x624532,roughness:1});
      const light=new THREE.MeshStandardMaterial({color:0x9a7050,roughness:1});
      const muzzle=new THREE.MeshStandardMaterial({color:0xb49170,roughness:1});
      const black=new THREE.MeshStandardMaterial({color:0x211b19,roughness:0.7});
      root.scale.setScalar(1.55);
      part(root,sphere,fur,[0,0.77,0.14],[0.68,0.67,0.86]);
      part(root,sphere,light,[0,1.12,-0.28],[0.65,0.53,0.53]);
      part(root,sphere,fur,[0,1.04,-0.71],[0.53,0.46,0.44]);
      part(root,sphere,muzzle,[0,0.82,-1.08],[0.34,0.22,0.32]);
      part(root,sphere,black,[0,0.85,-1.35],[0.16,0.1,0.1]);
      const legs:THREE.Group[]=[];
      for(const side of [-1,1]){
        part(root,sphere,fur,[side*0.43,1.36,-0.65],[0.18,0.19,0.1]);
        part(root,sphere,light,[side*0.43,1.37,-0.72],[0.09,0.1,0.04]);
        part(root,sphere,black,[side*0.35,1.09,-1.02],[0.045,0.05,0.045]);
        for(const z of [-0.4,0.64]){
          const leg=new THREE.Group();leg.position.set(side*0.48,0.62,z);root.add(leg);
          part(leg,sphere,fur,[0,-0.28,0],[0.23,0.38,0.23]);
          part(leg,sphere,black,[0,-0.52,-0.13],[0.24,0.09,0.31]);
          legs.push(leg);
        }
      }
      part(root,sphere,fur,[0,0.72,1.01],[0.14,0.13,0.14]);
      root.userData.legs=legs;return root;
    }
  const color = kind === 'fox' ? 0xb96732 : kind === 'wolf' ? 0x797d78 : kind==='lynx'?0xb98e60:kind==='weasel'?0x8e6245:0x9a7859;
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const pale = new THREE.MeshStandardMaterial({ color: kind === 'wolf' ? 0xc5c5bd : 0xf4debd, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x292b26, roughness: 0.7 });
  const s = kind === 'wolf' ? 1.45 : kind === 'dog' ? 1.2 : kind==='lynx'?1.07:1;
  root.scale.set(kind==='weasel'?0.67:s,kind==='weasel'?0.58:s,kind==='weasel'?1.15:s);
  part(root, sphere, fur, [0, 0.65, 0], [0.38, 0.39, 0.82]);
  part(root, sphere, pale, [0, 0.48, -0.43], [0.3, 0.25, 0.32]);
  const head = new THREE.Group(); head.position.set(0, 0.82, -0.64); root.add(head);
  part(head, sphere, fur, [0, 0, 0], [0.29, 0.25, 0.35]);
  part(head, sphere, pale, [0, -0.1, -0.33], [0.2, 0.13, 0.29]);
  part(head, sphere, dark, [0, -0.075, -0.58], [0.09, 0.07, 0.07]);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const e = part(head, cone, fur, [side * 0.19, 0.27, 0.06], [0.13, kind==='lynx'?0.44:0.35, 0.12]); e.rotation.z = side * 0.17;
    if(kind==='lynx')part(head,cone,dark,[side*0.19,0.53,0.06],[0.045,0.16,0.05]);
    part(head, sphere, dark, [side * 0.22, 0.06, -0.22], [0.04, 0.04, 0.04]);
    for (const z of [-0.5, 0.5]) {
      const leg = new THREE.Group(); leg.position.set(side*0.27,0.45,z); root.add(leg);
      part(leg,sphere,fur,[0,-0.18,0],[0.13,0.31,0.13]);
      part(leg,sphere,dark,[0,-0.4,-0.09],[0.14,0.06,0.18]); legs.push(leg);
    }
  }
  const tail = part(root, sphere, kind==='lynx'?dark:fur, [0, 0.74, 0.85], kind==='lynx'?[0.14,0.15,0.21]:[0.2,0.2,kind==='weasel'?0.7:0.52]); tail.rotation.x = -0.5;
  if(kind!=='lynx')part(root, sphere, pale, [0, 0.94, kind==='weasel'?1.33:1.17], [0.13, 0.13, 0.19]);
  root.userData.legs = legs;
  return root;
}

export function animatePredator(root: THREE.Group, time: number, running: boolean, dt: number): void {
  const legs = root.userData.legs as THREE.Group[];
  for(let i=0;i<legs.length;i++) legs[i].rotation.x = THREE.MathUtils.damp(legs[i].rotation.x, Math.sin(time*(running?14:6)+i*Math.PI*0.7)*(running?0.55:0.24), 9, dt);
}

export function createHawk():THREE.Group{
  const root=new THREE.Group();
  root.scale.setScalar(1.7);
  const brown=new THREE.MeshStandardMaterial({color:0x735443,roughness:0.9});
  const pale=new THREE.MeshStandardMaterial({color:0xd9c29c,roughness:0.9});
  const gold=new THREE.MeshStandardMaterial({color:0xd7a649,roughness:0.7});
  part(root,sphere,brown,[0,0,0],[0.42,0.26,0.78]);
  part(root,sphere,pale,[0,-0.13,-0.25],[0.3,0.16,0.45]);
  part(root,sphere,brown,[0,0.15,-0.55],[0.29,0.25,0.3]);
  const beak=part(root,cone,gold,[0,0.04,-0.9],[0.12,0.28,0.12]);beak.rotation.x=-Math.PI/2;
  const dark=new THREE.MeshStandardMaterial({color:0x1b1a19});
  for(const side of [-1,1])part(root,sphere,dark,[side*0.2,0.2,-0.73],[0.045,0.045,0.04]);
  const wings:THREE.Group[]=[];
  for(const side of [-1,1]){
    const wing=new THREE.Group();wing.position.set(side*0.29,0,0);root.add(wing);
    const panel=part(wing,sphere,brown,[side*0.95,0,0.1],[1.1,0.09,0.33]);panel.rotation.y=side*0.15;
    for(let i=0;i<4;i++)part(wing,sphere,pale,[side*(1.1+i*0.16),0,0.32],[0.3,0.035,0.18]);
    wings.push(wing);
  }
  root.userData.wings=wings;
  return root;
}

export function makeStash():THREE.Group{
  const root=new THREE.Group();
  const straw=new THREE.MeshStandardMaterial({color:0xa88157,roughness:1});
  const food=new THREE.MeshStandardMaterial({color:0xc98548,roughness:1});
  part(root,sphere,straw,[0,0.13,0],[0.55,0.16,0.45]);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    const stick=part(root,new THREE.CylinderGeometry(0.025,0.035,0.75,5),straw,[Math.cos(a)*0.37,0.18,Math.sin(a)*0.32],[1,1,1]);
    stick.rotation.x=Math.PI/2;stick.rotation.y=a;
  }
  for(let i=0;i<4;i++)part(root,sphere,food,[(i-1.5)*0.2,0.26,(i%2)*0.18-0.08],[0.13,0.11,0.11]);
  return root;
}

export function makeNest(): THREE.Group {
  const root = new THREE.Group();
  const straw = new THREE.MeshStandardMaterial({color:0xbd9a63,roughness:1});
  const twig = new THREE.MeshStandardMaterial({color:0x71543d,roughness:1});
  const fur = new THREE.MeshStandardMaterial({color:0xe5dac0,roughness:1});
  part(root,sphere,straw,[0,0.08,0],[0.86,0.16,0.75]);
  part(root,sphere,fur,[0,0.16,0],[0.55,0.1,0.47]);
  for(let i=0;i<14;i++) {
    const a=i*Math.PI*2/14;
    const branch=part(root,new THREE.CylinderGeometry(0.025,0.035,0.62,4),twig,[Math.cos(a)*0.65,0.2,Math.sin(a)*0.55],[1,1,1]);
    branch.rotation.z=Math.PI/2; branch.rotation.y=a;
  }
  return root;
}
