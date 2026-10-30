import * as THREE from 'three';
import type { BurrowData } from './types';

const key = (x: number, z: number) => `${x},${z}`;

export class Underground {
  readonly scene:THREE.Scene;
  readonly group=new THREE.Group();
  private walls = new Map<string, THREE.Mesh>();
  private open = new Set<string>();
  private allCells = new Set<string>();
  private marker: THREE.Mesh;
  readonly limit = 10;
  readonly step = 2;

  constructor(readonly burrow: BurrowData, readonly level=0,scene?:THREE.Scene,private readonly gardenAt?:(x:number,z:number)=>boolean) {
    this.scene=scene??new THREE.Scene();
    this.group.position.set(burrow.x,-6-level*3,burrow.z);
    this.scene.add(this.group);
    const caveColor=[0x655748,0x5e5144,0x51463b][level];
    const amb = new THREE.HemisphereLight(0xffe6bd, caveColor, 2.8); this.group.add(amb);
    const lamp = new THREE.PointLight(0xffdfaa, 70, 26); lamp.position.set(0, 4, 0); this.group.add(lamp);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshStandardMaterial({ color: 0x806d56, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.03; floor.receiveShadow = true; this.group.add(floor);
    const geo = new THREE.BoxGeometry(1.96, 1.85, 1.96);
    const colors = [0x79634c, 0x8b7358, 0x6f5d4d, 0x92785c];
    for (let z = -this.limit; z <= this.limit; z++) for (let x = -this.limit; x <= this.limit; x++) {
      const material = new THREE.MeshStandardMaterial({ color: colors[Math.abs(x * 17 + z * 31) % colors.length], roughness: 1 });
      const block = new THREE.Mesh(geo, material); block.position.set(x * this.step, 0.91, z * this.step);
      block.castShadow = true; block.receiveShadow = true; this.walls.set(key(x, z), block); this.group.add(block);
    }
    const cells = burrow.cells?.length ? burrow.cells : ['0:0,0', '0:0,1', '0:1,0', '0:-1,0', '0:0,-1'];
    this.allCells=new Set(cells.map(cell=>cell.includes(':')?cell:`0:${cell}`));
    for (const cell of this.allCells) {
      const [floor,position] = cell.split(':');if(Number(floor)!==this.level)continue;
      const [x, z] = position.split(',').map(Number); this.openCell(x, z);
    }
    this.burrow.cells = [...this.allCells];
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.12, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd6ae75 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.07;ring.visible=this.open.has(key(0,0)); this.group.add(ring);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.07, 16), new THREE.MeshBasicMaterial({ color: 0x3d332b }));
    shaft.position.y = 0.045;shaft.visible=ring.visible; this.group.add(shaft);
    this.marker = new THREE.Mesh(new THREE.BoxGeometry(1.98, 1.88, 1.98), new THREE.MeshBasicMaterial({ color: 0xffd177, transparent: true, opacity: 0.15, depthWrite: false }));
    this.marker.visible = false; this.group.add(this.marker);
  }

  private openCell(x: number, z: number): void {
    if (Math.abs(x) > this.limit || Math.abs(z) > this.limit) return;
    const id = key(x, z); this.open.add(id);this.allCells.add(`${this.level}:${id}`);
    const wall = this.walls.get(id); if (wall) { wall.removeFromParent(); this.walls.delete(id); }
    if(this.level===0&&this.gardenAt?.(this.burrow.x+x*this.step,this.burrow.z+z*this.step)){
      const root=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.85,7),new THREE.MeshStandardMaterial({color:0xc8753d}));
      root.rotation.x=Math.PI;root.position.set(x*this.step,1.38,z*this.step);this.group.add(root);
    }
  }

  private syncCells():void{for(const cell of this.burrow.cells??[])this.allCells.add(cell.includes(':')?cell:`0:${cell}`);}
  openShaftCell(x:number,z:number):void{this.syncCells();this.openCell(Math.round(x/this.step),Math.round(z/this.step));this.burrow.cells=[...this.allCells];}

  canMove(x: number, z: number): boolean {
    const gx = Math.round(x / this.step), gz = Math.round(z / this.step);
    return this.open.has(key(gx, gz)) && Math.abs(x - gx * this.step) < 0.83 && Math.abs(z - gz * this.step) < 0.83 ||
      this.open.has(key(gx, gz)) && (this.open.has(key(gx + Math.sign(x - gx * this.step), gz)) || Math.abs(x - gx * this.step) < 0.83) &&
      (this.open.has(key(gx, gz + Math.sign(z - gz * this.step))) || Math.abs(z - gz * this.step) < 0.83);
  }

  digAhead(x: number, z: number, facing: number): { x: number; z: number; success: boolean; reason?: string } {
    this.syncCells();
    const tx = Math.round((x - Math.sin(facing) * 1.65) / this.step);
    const tz = Math.round((z - Math.cos(facing) * 1.65) / this.step);
    if (Math.abs(tx) > this.limit || Math.abs(tz) > this.limit) return { x: tx, z: tz, success: false, reason: 'Дальше слишком плотная порода.' };
    if (this.open.has(key(tx, tz))) return { x: tx, z: tz, success: false, reason: 'Здесь уже проложен ход. Повернись к земляной стене.' };
    const neighbor = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz]) => this.open.has(key(tx+dx,tz+dz)));
    if (!neighbor) return { x: tx, z: tz, success: false, reason: 'Копай стену рядом с существующим ходом.' };
    this.openCell(tx, tz); this.burrow.cells = [...this.allCells];
    return { x: tx, z: tz, success: true };
  }

  updateMarker(x: number, z: number, facing: number): void {
    const tx = Math.round((x - Math.sin(facing) * 1.65) / this.step);
    const tz = Math.round((z - Math.cos(facing) * 1.65) / this.step);
    this.marker.visible = this.walls.has(key(tx, tz));
    this.marker.position.set(tx * this.step, 0.91, tz * this.step);
  }

  isEntrance(x: number, z: number): boolean { return Math.hypot(x, z) < 1.3; }
  isOpen(x: number, z: number): boolean { return this.open.has(key(Math.round(x / this.step), Math.round(z / this.step))); }
  hasCell(level:number,x:number,z:number):boolean {this.syncCells();return this.allCells.has(`${level}:${key(Math.round(x/this.step),Math.round(z/this.step))}`);}
  makeShaft(level:number,x:number,z:number):void {this.syncCells();this.allCells.add(`${level}:${key(Math.round(x/this.step),Math.round(z/this.step))}`);this.burrow.cells=[...this.allCells];}
}
