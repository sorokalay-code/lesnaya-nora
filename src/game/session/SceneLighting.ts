import * as THREE from 'three';
import type { World } from '../World';
import type { SaveData, Weather } from '../types';
import { SkyLayer } from './SkyLayer';

const SKY_DAY = new THREE.Color(0xc3dce0);
const SKY_DAY_ZENITH = new THREE.Color(0x599abf);
const SKY_GOLDEN_HOUR = new THREE.Color(0xe6aa77);
const SKY_GOLDEN_ZENITH = new THREE.Color(0x6585a5);
const SKY_NIGHT = new THREE.Color(0x354961);
const SKY_NIGHT_ZENITH = new THREE.Color(0x101d38);
const SKY_OVERCAST_DAY = new THREE.Color(0xadbcc0);
const SKY_OVERCAST_NIGHT = new THREE.Color(0x384553);
const SUN_DAY = new THREE.Color(0xfff3dc);
const SUN_GOLDEN_HOUR = new THREE.Color(0xffd6a4);
const SUN_NIGHT = new THREE.Color(0xb8c9ed);
const CLOUD_COVER: Record<Weather, number> = {
  clear: 0.15,
  cloudy: 0.94,
  rain: 1,
  mist: 0.6,
  snow: 0.98,
};

/** Настраивает источники света и обновляет небо по времени суток, погоде и глубине. */
export class SceneLighting {
  private readonly sun = new THREE.DirectionalLight(0xfff3d2, 2);
  private readonly ambient = new THREE.HemisphereLight(0xd3e4ed, 0x56704d, 1.8);
  private readonly sky = new THREE.Color();
  private readonly zenith = new THREE.Color();
  private readonly overcast = new THREE.Color();
  private readonly sunDirection = new THREE.Vector3();
  private readonly skyLayer: SkyLayer;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    // Камера и её слой неба переживают очистку сцены при загрузке другого мира.
    this.skyLayer = new SkyLayer(camera);
  }

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
    const hour = (save.clock % 1440) / 60;
    const phase = ((hour - 13) / 24) * 2 * Math.PI;
    const noon = Math.cos(phase);
    this.sunDirection.set(-Math.sin(phase), 0.83 * noon + 0.4, 0.4 * noon).normalize();
    const daylight = THREE.MathUtils.clamp(0.5 + noon * 0.5, 0.25, 1);
    const cover = CLOUD_COVER[save.weather];
    const directLight = (0.45 + daylight * 1.55) * (1 - cover * 0.48);
    this.sun.intensity = directLight;
    this.ambient.intensity = 0.7 + daylight * (1.1 + cover * 0.16);
    const ground = world.heightAt(p.x, p.z);
    this.sun.position.set(
      p.x + this.sunDirection.x * 55,
      ground + Math.max(8, this.sunDirection.y * 55),
      p.z + this.sunDirection.z * 55,
    );
    this.sun.target.position.set(p.x, ground, p.z);
    const sunUp = THREE.MathUtils.smoothstep(this.sunDirection.y, -0.018, 0.058);
    const golden = (1 - THREE.MathUtils.smoothstep(this.sunDirection.y, 0.12, 0.56)) * sunUp;
    const dark = Math.max(
      1 - THREE.MathUtils.smoothstep(hour, 4.5, 6.5),
      THREE.MathUtils.smoothstep(hour, 20, 22),
    );
    this.sun.color.copy(SUN_DAY).lerp(SUN_GOLDEN_HOUR, golden).lerp(SUN_NIGHT, dark);
    this.overcast.copy(SKY_OVERCAST_DAY).lerp(SKY_OVERCAST_NIGHT, dark);
    if (save.weather === 'snow') this.overcast.setHex(night ? 0x556877 : 0xd4dfdf);
    if (save.weather === 'rain') this.overcast.setHex(night ? 0x475b66 : 0x9eafb0);
    this.sky
      .copy(SKY_DAY)
      .lerp(SKY_GOLDEN_HOUR, golden)
      .lerp(SKY_NIGHT, dark)
      .lerp(this.overcast, cover ** 2);
    this.zenith
      .copy(SKY_DAY_ZENITH)
      .lerp(SKY_GOLDEN_ZENITH, golden)
      .lerp(SKY_NIGHT_ZENITH, dark)
      .lerp(this.overcast, cover ** 2 * 0.89);
    this.skyLayer.mesh.visible = !sheltered;
    if (sheltered) this.sky.setHex(0x5c4e3e);
    else
      this.skyLayer.update(
        save.clock,
        this.sky,
        this.zenith,
        this.sun.color,
        this.sunDirection,
        1 - dark,
        cover,
        sunUp * (1 - THREE.MathUtils.smoothstep(cover, 0.55, 0.92)),
      );
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(this.sky);
  }
}
