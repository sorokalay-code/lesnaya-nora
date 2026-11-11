import * as THREE from 'three';
import { World } from '../World';
import { type SaveData } from '../types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const SKY_DAY = new THREE.Color(0xb6cdd3);
const SKY_GOLDEN_HOUR = new THREE.Color(0xddb38c);
const SKY_NIGHT = new THREE.Color(0x3d5667);
const SUN_DAY = new THREE.Color(0xfff3dc);
const SUN_GOLDEN_HOUR = new THREE.Color(0xffd6a4);
const SUN_NIGHT = new THREE.Color(0xb8c9ed);

/** Настраивает источники света и обновляет небо по времени суток, погоде и глубине. */
export class SceneLighting {
  private readonly sun = new THREE.DirectionalLight(0xfff3d2, 2);
  private readonly ambient = new THREE.HemisphereLight(0xd3e4ed, 0x56704d, 1.8);
  private readonly sky = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  reset(): void {
    this.scene.background = this.sky.copy(SKY_DAY);
    this.scene.add(this.camera);
    this.scene.add(this.ambient);
    this.sun.position.set(25, 45, 22);
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 38;
    this.sun.shadow.camera.far = 150;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  setShadowSize(size: number): void {
    const enabled = size > 0;
    const shadow = this.sun.shadow;
    if (this.sun.castShadow === enabled && (!enabled || shadow.mapSize.x === size)) return;

    this.sun.castShadow = enabled;
    // Three.js выделяет карту только при первом проходе. После смены размера нужна новая цель.
    shadow.map?.dispose();
    shadow.map = null;
    if (enabled) {
      shadow.mapSize.set(size, size);
      shadow.radius = size / 768;
      shadow.needsUpdate = true;
    }
  }

  update(save: SaveData, world: World, night: boolean, sheltered: boolean): void {
    const p = save.player;
    const sunAngle = ((save.clock % 1440) / 1440) * Math.PI * 2;
    const daylight = clamp(0.5 + 0.5 * Math.cos(sunAngle - Math.PI), 0.25, 1);
    this.sun.intensity = 0.45 + daylight * 1.55;
    this.ambient.intensity = 0.7 + daylight * 1.1;
    const ground = world.heightAt(p.x, p.z);
    this.sun.position.set(
      p.x + Math.cos(sunAngle) * 45,
      ground + Math.max(8, Math.cos(sunAngle - Math.PI) * 45),
      p.z + 22,
    );
    this.sun.target.position.set(p.x, ground, p.z);
    const hour = (save.clock % 1440) / 60;
    const morning = 1 - THREE.MathUtils.smoothstep(hour, 6.5, 10);
    const evening = THREE.MathUtils.smoothstep(hour, 17, 20);
    const golden = Math.max(morning, evening);
    const dark = Math.max(
      1 - THREE.MathUtils.smoothstep(hour, 4.5, 6.5),
      THREE.MathUtils.smoothstep(hour, 20, 22),
    );
    this.sun.color.copy(SUN_DAY).lerp(SUN_GOLDEN_HOUR, golden).lerp(SUN_NIGHT, dark);
    this.sky.copy(SKY_DAY).lerp(SKY_GOLDEN_HOUR, golden).lerp(SKY_NIGHT, dark);
    if (save.weather === 'snow') this.sky.setHex(night ? 0x556877 : 0xd4dfdf);
    if (save.weather === 'rain') this.sky.setHex(night ? 0x475b66 : 0x9eafb0);
    if (sheltered) this.sky.setHex(0x5c4e3e);
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(this.sky);
  }
}
