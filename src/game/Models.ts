import * as THREE from 'three';
import { COAT_COLORS, type Genes, type PredatorKind } from './types';

const sphere = new THREE.SphereGeometry(1, 16, 12);
const cone = new THREE.ConeGeometry(1, 1, 8);

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

export interface RabbitRig { root: THREE.Group; leftEar: THREE.Group; rightEar: THREE.Group; paws: THREE.Group[]; tail: THREE.Mesh; head: THREE.Group; }

export function createRabbit(genes: Genes, baby = false): RabbitRig {
  const root = new THREE.Group();
  const s = (baby ? 0.55 : 1) * genes.size;
  root.scale.setScalar(s);
  const fur = new THREE.MeshStandardMaterial({ color: COAT_COLORS[genes.coat], roughness: 0.95 });
  const light = new THREE.MeshStandardMaterial({ color: 0xf7e8d6, roughness: 1 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xd88f9b, roughness: 0.9, side: THREE.DoubleSide });
  const eye = new THREE.MeshStandardMaterial({ color: 0x1d211b, roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  part(root, sphere, fur, [0, 0.52, 0], [0.4, 0.34, 0.61]);
  part(root, sphere, light, [0, 0.31, 0.27], [0.28, 0.16, 0.27]);
  const head = new THREE.Group(); head.position.set(0, 0.69, -0.44); root.add(head);
  part(head, sphere, fur, [0, 0, 0], [0.32, 0.3, 0.31]);
  part(head, sphere, light, [0, -0.11, -0.24], [0.19, 0.13, 0.16]);
  for (const side of [-1, 1]) {
    part(head, sphere, eye, [side * 0.235, 0.065, -0.175], [0.05, 0.064, 0.04]);
    part(head, sphere, shine, [side * 0.245 - 0.012, 0.087, -0.207], [0.014, 0.018, 0.008]);
    const ear = new THREE.Group(); ear.position.set(side * 0.17, 0.19, 0.065); head.add(ear);
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
    paws.push(paw);
  }
  const tail = part(root, sphere, light, [0, 0.54, 0.58], [0.17, 0.17, 0.17]);
  return { root, leftEar: root.userData.leftEar as THREE.Group, rightEar: root.userData.rightEar as THREE.Group, paws, tail, head };
}

export function animateRabbit(r: RabbitRig, time: number, moving: boolean, frightened = false): void {
  const hop = moving ? Math.abs(Math.sin(time * (frightened ? 18 : 12))) * 0.16 : 0;
  r.root.position.y = hop;
  r.leftEar.rotation.z = -0.12 + Math.sin(time * 3.1) * 0.09 + (frightened ? -0.14 : 0);
  r.rightEar.rotation.z = 0.12 - Math.sin(time * 2.7 + 1) * 0.09 + (frightened ? 0.14 : 0);
  r.head.rotation.x = Math.sin(time * 2) * 0.022;
  r.tail.rotation.y = Math.sin(time * 8) * 0.2;
  r.paws.forEach((paw, i) => { paw.rotation.x = moving ? Math.sin(time * 12 + (i % 2) * Math.PI) * 0.34 : 0; });
}

export function createPredator(kind: PredatorKind): THREE.Group {
  const root = new THREE.Group();
  const color = kind === 'fox' ? 0xb96732 : kind === 'wolf' ? 0x797d78 : 0x9a7859;
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const pale = new THREE.MeshStandardMaterial({ color: kind === 'wolf' ? 0xc5c5bd : 0xf4debd, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x292b26, roughness: 0.7 });
  const s = kind === 'wolf' ? 1.45 : kind === 'dog' ? 1.2 : 1;
  root.scale.setScalar(s);
  part(root, sphere, fur, [0, 0.65, 0], [0.38, 0.39, 0.82]);
  part(root, sphere, pale, [0, 0.48, -0.43], [0.3, 0.25, 0.32]);
  const head = new THREE.Group(); head.position.set(0, 0.82, -0.64); root.add(head);
  part(head, sphere, fur, [0, 0, 0], [0.29, 0.25, 0.35]);
  part(head, sphere, pale, [0, -0.1, -0.33], [0.2, 0.13, 0.29]);
  part(head, sphere, dark, [0, -0.075, -0.58], [0.09, 0.07, 0.07]);
  for (const side of [-1, 1]) {
    const e = part(head, cone, fur, [side * 0.19, 0.27, 0.06], [0.13, 0.35, 0.12]); e.rotation.z = side * 0.17;
    part(head, sphere, dark, [side * 0.22, 0.06, -0.22], [0.04, 0.04, 0.04]);
    for (const z of [-0.5, 0.5]) part(root, sphere, fur, [side * 0.27, 0.28, z], [0.13, 0.31, 0.13]);
  }
  const tail = part(root, sphere, fur, [0, 0.74, 0.85], [0.2, 0.2, 0.52]); tail.rotation.x = -0.5;
  part(root, sphere, pale, [0, 0.94, 1.17], [0.13, 0.13, 0.19]);
  return root;
}

export function makeBurrow(depth: number): THREE.Group {
  const root = new THREE.Group();
  const soil = new THREE.MeshStandardMaterial({ color: 0x7c5a3e, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 1 });
  part(root, sphere, soil, [0, 0.09, 0], [1.1 + depth * 0.13, 0.2, 0.95 + depth * 0.1]);
  part(root, sphere, dark, [0, 0.115, -0.35], [0.49, 0.08, 0.39]);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4;
    part(root, sphere, soil, [Math.sin(a) * 0.77, 0.18, Math.cos(a) * 0.62], [0.24, 0.17, 0.23]);
  }
  return root;
}
