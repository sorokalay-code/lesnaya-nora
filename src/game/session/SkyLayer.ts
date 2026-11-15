import * as THREE from 'three';
import { hash2 } from '../Random';

const CLOUD_MAP_SIZE = 128;
const OCTAVES = [
  { cells: 5, weight: 0.56 },
  { cells: 10, weight: 0.27 },
  { cells: 20, weight: 0.12 },
  { cells: 40, weight: 0.05 },
];

function cloudMap(): THREE.DataTexture {
  const density = new Uint8Array(CLOUD_MAP_SIZE ** 2);
  for (let z = 0; z < CLOUD_MAP_SIZE; z++) {
    for (let x = 0; x < CLOUD_MAP_SIZE; x++) {
      let value = 0;
      for (const { cells, weight } of OCTAVES) {
        const u = (x / CLOUD_MAP_SIZE) * cells;
        const v = (z / CLOUD_MAP_SIZE) * cells;
        const ix = Math.floor(u);
        const iz = Math.floor(v);
        const tx = THREE.MathUtils.smoothstep(u - ix, 0, 1);
        const tz = THREE.MathUtils.smoothstep(v - iz, 0, 1);
        // Соседняя ячейка за краем совпадает с первой, чтобы ветер не показывал шов.
        const nx = (ix + 1) % cells;
        const nz = (iz + 1) % cells;
        const seed = 30811 + cells;
        const top = THREE.MathUtils.lerp(hash2(ix, iz, seed), hash2(nx, iz, seed), tx);
        const bottom = THREE.MathUtils.lerp(hash2(ix, nz, seed), hash2(nx, nz, seed), tx);
        value += THREE.MathUtils.lerp(top, bottom, tz) * weight;
      }
      density[z * CLOUD_MAP_SIZE + x] = Math.round(value * 255);
    }
  }
  const texture = new THREE.DataTexture(density, CLOUD_MAP_SIZE, CLOUD_MAP_SIZE, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Рисует небо на дальней границе кадра, затрачивая один вызов отрисовки. */
export class SkyLayer {
  private readonly uniforms = {
    skyProjection: { value: new THREE.Matrix4() },
    cloudMap: { value: cloudMap() },
    skyHorizon: { value: new THREE.Color() },
    skyZenith: { value: new THREE.Color() },
    skySunColor: { value: new THREE.Color() },
    skySunDir: { value: new THREE.Vector3() },
    cloudOffset: { value: new THREE.Vector2() },
    cloudCover: { value: 0 },
    sunVisibility: { value: 0 },
    daylight: { value: 0 },
  };
  readonly mesh: THREE.Mesh;

  constructor(camera: THREE.Camera) {
    this.uniforms.skyProjection.value = camera.projectionMatrixInverse;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        depthWrite: false,
        toneMapped: false,
        vertexShader: `
        uniform mat4 skyProjection;
        varying vec3 skyRay;

        void main() {
          vec3 ray = (skyProjection * vec4(position.xy, 1.0, 1.0)).xyz;
          // Обратное вращение камеры без её смещения: небо остаётся на бесконечности.
          skyRay = vec3(dot(viewMatrix[0].xyz, ray), dot(viewMatrix[1].xyz, ray), dot(viewMatrix[2].xyz, ray));
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
        fragmentShader: `
        uniform sampler2D cloudMap;
        uniform vec3 skyHorizon;
        uniform vec3 skyZenith;
        uniform vec3 skySunColor;
        uniform vec3 skySunDir;
        uniform vec2 cloudOffset;
        uniform float cloudCover;
        uniform float sunVisibility;
        uniform float daylight;
        varying vec3 skyRay;

        void main() {
          vec3 direction = normalize(skyRay);
          float height = max(direction.y, 0.0);
          vec3 sky = mix(skyHorizon, skyZenith, smoothstep(0.0, 0.84, height));
          float sunDot = dot(direction, skySunDir);
          float glow = pow(max(sunDot, 0.0), 17.0) * sunVisibility;
          sky = mix(sky, skySunColor, glow * 0.30);
          float diskEdge = max(fwidth(sunDot), 0.000015);
          float disk = smoothstep(0.9996 - diskEdge, 0.9996 + diskEdge, sunDot) * sunVisibility;
          sky = mix(sky, mix(skySunColor, vec3(1.0), 0.55), disk);

          vec2 uv = direction.xz * (0.71 / (height + 0.29)) + cloudOffset;
          float density = texture2D(cloudMap, uv).r;
          float threshold = mix(0.57, 0.30, cloudCover);
          float cover = smoothstep(threshold - 0.025, threshold + 0.13, density);
          cover = mix(cover, 1.0, cloudCover * cloudCover * 0.94);
          float lit = texture2D(cloudMap, uv - skySunDir.xz * 0.022).r;
          float shade = clamp(0.8 - density * 0.34 + (density - lit) * 0.9, 0.22, 0.9);
          vec3 cloud = mix(skyZenith * 0.71, mix(vec3(0.97), skySunColor, 0.23), daylight);
          cloud *= mix(0.63, shade + 0.27, daylight) * (1.0 - cloudCover * 0.34);
          sky = mix(sky, cloud, cover * smoothstep(0.025, 0.22, height));

          gl_FragColor = vec4(sky, 1.0);
          #include <colorspace_fragment>
        }
      `,
      }),
    );
    this.mesh.name = 'weather-sky';
    this.mesh.frustumCulled = false;
    // Рисуется после непрозрачного мира. Глубина отсекает закрытое землёй и деревьями небо.
    this.mesh.renderOrder = Infinity;
    camera.add(this.mesh);
  }

  update(
    clock: number,
    horizon: THREE.Color,
    zenith: THREE.Color,
    sunColor: THREE.Color,
    sunDirection: THREE.Vector3,
    daylight: number,
    cloudCover: number,
    sunVisibility: number,
  ): void {
    const uniforms = this.uniforms;
    uniforms.skyHorizon.value.copy(horizon);
    uniforms.skyZenith.value.copy(zenith);
    uniforms.skySunColor.value.copy(sunColor);
    uniforms.skySunDir.value.copy(sunDirection);
    uniforms.daylight.value = daylight;
    uniforms.cloudCover.value = cloudCover;
    uniforms.sunVisibility.value = sunVisibility;
    uniforms.cloudOffset.value.set((clock * 0.00032) % 1, (clock * 0.00013) % 1);
  }
}
