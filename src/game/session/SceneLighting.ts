import * as THREE from 'three';
import { World } from '../World';
import { type SaveData } from '../types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Настраивает источники света и обновляет небо по времени суток, погоде и глубине. */
export class SceneLighting {
  private readonly sun = new THREE.DirectionalLight(0xfff3d2, 2);
  private readonly ambient = new THREE.HemisphereLight(0xd3e4ed, 0x56704d, 1.8);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  reset(): void {
    this.scene.background = new THREE.Color(0xb9d3ba);
    this.scene.add(this.camera);
    this.scene.add(this.ambient);
    this.sun.position.set(25, 45, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 38;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
  }

  update(save: SaveData, world: World, night: boolean, sheltered: boolean): void {
    const p = save.player;
    const sunAngle = ((save.clock % 1440) / 1440) * Math.PI * 2;
    const daylight = clamp(0.5 + 0.5 * Math.cos(sunAngle - Math.PI), 0.25, 1);
    this.sun.intensity = 0.45 + daylight * 1.55;
    this.ambient.intensity = 0.7 + daylight * 1.1;
    this.sun.position.set(
      Math.cos(sunAngle) * 45,
      Math.max(8, Math.cos(sunAngle - Math.PI) * 45),
      22,
    );
    this.sun.target.position.set(p.x, world.heightAt(p.x, p.z), p.z);
    this.scene.add(this.sun.target);
    this.sun.position.x += p.x;
    this.sun.position.z += p.z;
    const hour = (save.clock % 1440) / 60;
    const clearSky = night ? 0x3d5667 : hour < 10 ? 0xe1c5a3 : hour >= 17 ? 0xd0aa8a : 0xb9d3ba;
    const sky = new THREE.Color(
      sheltered
        ? 0x5c4e3e
        : save.weather === 'snow'
          ? 0xd4dfdf
          : save.weather === 'rain'
            ? 0x9eafb0
            : clearSky,
    );
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(sky);
  }
}
