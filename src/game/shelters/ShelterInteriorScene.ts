import * as THREE from 'three';
import { INTERIOR_OUTLINE, type InteriorProfile } from './ShelterInterior';

/** Создаёт только посещаемый интерьер; владеет его декором, геометрией и материалами. */
export class ShelterInteriorScene {
  readonly scene = new THREE.Scene();
  private readonly geometry: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(profile: InteriorProfile) {
    this.scene.background = new THREE.Color(0x30271e);
    this.scene.add(new THREE.HemisphereLight(0xffe7bb, 0x76634b, 2.1));
    const light = new THREE.PointLight(0xffdda0, 45, 18);
    light.position.set(0, 2.5, 3);
    this.scene.add(light);
    const earth = this.material(0x71523a);
    const floor = this.material(0x95724b);
    const straw = this.material(0xb6a06a);
    const bone = this.material(0xddd1b4);
    const food = this.material(profile.decor === 'pantry' ? 0x738247 : 0x705137);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sphere = new THREE.SphereGeometry(1, 10, 7);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.geometry.push(box, sphere, cylinder);
    const shape = new THREE.Shape(
      INTERIOR_OUTLINE.map(([x, z]) => new THREE.Vector2(x * profile.scale, -z * profile.scale)),
    );
    const ground = new THREE.ShapeGeometry(shape);
    this.geometry.push(ground);
    const groundMesh = new THREE.Mesh(ground, floor);
    groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(groundMesh);
    for (let i = 0; i < INTERIOR_OUTLINE.length; i++) {
      const [x, z] = INTERIOR_OUTLINE[i];
      const [nx, nz] = INTERIOR_OUTLINE[(i + 1) % INTERIOR_OUTLINE.length];
      if (i === 0) continue;
      const wall = this.mesh(
        box,
        earth,
        ((x + nx) * profile.scale) / 2,
        1.35,
        ((z + nz) * profile.scale) / 2,
        Math.hypot(nx - x, nz - z) * profile.scale,
        2.7,
        0.15,
      );
      wall.rotation.y = -Math.atan2(nz - z, nx - x);
    }
    // Светлый проход читается как выход и остаётся свободным от декора.
    this.mesh(
      box,
      this.material(0xa9c49b, true),
      0,
      1,
      5 * profile.scale,
      2.3 * profile.scale,
      2,
      0.08,
    );
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.399;
      const bed = this.mesh(
        sphere,
        straw,
        Math.sin(angle) * 0.8 * profile.scale,
        0.06,
        (-4.2 + Math.cos(angle) * 0.55) * profile.scale,
        0.48,
        0.07,
        0.23,
      );
      bed.rotation.y = angle;
    }
    for (let i = 0; i < 9; i++) {
      const x = (3.7 + (i % 3) * 0.42) * profile.scale;
      const z = (-1 + Math.floor(i / 3) * 0.6) * profile.scale;
      if (profile.decor === 'bones') {
        const shaft = this.mesh(cylinder, bone, x, 0.12, z, 0.055, 0.65, 0.055);
        shaft.rotation.z = Math.PI / 2;
        shaft.rotation.y = i * 0.7;
        for (const side of [-1, 1])
          this.mesh(
            sphere,
            bone,
            x + Math.cos(i * 0.7) * side * 0.3,
            0.12,
            z - Math.sin(i * 0.7) * side * 0.3,
            0.12,
            0.1,
            0.11,
          );
      } else {
        const item = this.mesh(
          sphere,
          food,
          x,
          0.15,
          z,
          0.23,
          0.14,
          profile.decor === 'branches' ? 0.75 : 0.3,
        );
        item.rotation.y = i * 0.7;
      }
    }
  }

  dispose(): void {
    for (const geometry of this.geometry) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.scene.clear();
  }

  private material(color: number, emissive = false): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      side: THREE.DoubleSide,
      emissive: emissive ? color : 0,
      emissiveIntensity: 0.5,
    });
    this.materials.push(material);
    return material;
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    this.scene.add(mesh);
    return mesh;
  }
}
