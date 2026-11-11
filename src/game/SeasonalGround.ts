import * as THREE from 'three';
import { ModelAssets } from './ModelAssets';
import type { Season } from './types';
import type { GraphicsSettings } from './GraphicsSettings';

export interface SeasonBlend {
  current: Season;
  next: Season;
  mix: number;
  progress: number;
}

const palette: Record<Season, readonly [number, number, number, number, number, number]> = {
  Весна: [0.9, 1.1, 0.9, 0, 0, 0],
  Лето: [1, 1, 1, 0, 0, 0],
  Осень: [1.22, 0.88, 0.71, 0, 0, 0],
  Зима: [0.32, 0.34, 0.36, 0.68, 0.66, 0.64],
};

/** Общий материал поверхности и краёв нор смешивает участки и сезоны без перестройки рельефа. */
export class SeasonalGround {
  readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  private readonly nextMap = { value: null as THREE.Texture | null };
  private readonly mix = { value: 0 };
  private readonly textureQuality = { value: 1 };
  private readonly scale = { value: new THREE.Vector3(1, 1, 1) };
  private readonly bias = { value: new THREE.Vector3() };
  private season?: Season;

  constructor() {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNextGround = this.nextMap;
      shader.uniforms.uGroundMix = this.mix;
      shader.uniforms.uGroundQuality = this.textureQuality;
      shader.uniforms.uGroundScale = this.scale;
      shader.uniforms.uGroundBias = this.bias;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGroundScale, uGroundBias;')
        .replace(
          '#include <color_vertex>',
          `
          #include <color_vertex>
          vColor.rgb = min(vec3(1.0), vColor.rgb * uGroundScale + uGroundBias);
        `,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `
          #include <common>
          #ifdef USE_MAP
          uniform sampler2D uNextGround;
          uniform float uGroundMix;
          uniform float uGroundQuality;

          float groundTile(vec2 cell) {
            return floor(fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453) * 10.0);
          }

          vec4 groundSample(sampler2D atlas, vec2 cell, vec2 uv, vec2 dx, vec2 dy) {
            float tile = groundTile(cell);
            vec2 slot = vec2(mod(tile, 4.0), 3.0 - floor(tile / 4.0));
            vec2 shift = vec2(tile * 0.17, tile * 0.31);
            vec2 at = (slot + 0.0625 + fract(uv + shift) * 0.875) * 0.25;
            return textureGrad(atlas, at, dx, dy);
          }

          vec4 groundRegion(sampler2D atlas, vec2 uv, vec2 cell, vec2 blend, vec2 dx, vec2 dy) {
            if (uGroundQuality < 0.5)
              return groundSample(atlas, vec2(0.0), uv, dx, dy);
            vec4 a = mix(groundSample(atlas, cell, uv, dx, dy),
                         groundSample(atlas, cell + vec2(1.0, 0.0), uv, dx, dy), blend.x);
            vec4 b = mix(groundSample(atlas, cell + vec2(0.0, 1.0), uv, dx, dy),
                         groundSample(atlas, cell + vec2(1.0), uv, dx, dy), blend.x);
            return mix(a, b, blend.y);
          }
          #endif
        `,
        )
        .replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
          vec2 region = vMapUv * 0.56;
          vec2 cell = floor(region);
          vec2 blend = smoothstep(vec2(0.12), vec2(0.88), fract(region));
          // Производные берутся до fract, чтобы на стыках повторов не было полос.
          vec2 dx = clamp(dFdx(vMapUv) * 0.21875, -0.012, 0.012);
          vec2 dy = clamp(dFdy(vMapUv) * 0.21875, -0.012, 0.012);
          vec4 surface = groundRegion(map, vMapUv, cell, blend, dx, dy);
          if (uGroundMix > 0.0)
            surface = mix(surface, groundRegion(uNextGround, vMapUv, cell, blend, dx, dy), uGroundMix);
          if (uGroundQuality > 1.5) {
            // Высокая частота рисунка видна вблизи и затухает до появления мерцания.
            vec2 detailUv = vMapUv * 4.0;
            float footprint = max(length(dFdx(detailUv)), length(dFdy(detailUv)));
            float detailFade = 1.0 - smoothstep(0.015, 0.045, footprint);
            if (detailFade > 0.0) {
              vec3 detail = groundSample(map, vec2(0.0), detailUv, dx * 4.0, dy * 4.0).rgb;
              float grain = dot(detail, vec3(0.2126, 0.7152, 0.0722)) - 0.7;
              surface.rgb *= 1.0 + grain * detailFade * 0.48;
            }
          }
          diffuseColor *= surface;
          #endif
        `,
        );
    };
  }

  setTextureQuality(quality: GraphicsSettings['textures']): void {
    this.textureQuality.value = { low: 0, medium: 1, high: 2 }[quality];
  }

  update(blend: SeasonBlend): void {
    if (this.season !== blend.current) {
      this.season = blend.current;
      const map = ModelAssets.shared.groundTexture(blend.current) ?? null;
      if (!!this.material.map !== !!map) this.material.needsUpdate = true;
      this.material.map = map;
      this.nextMap.value = ModelAssets.shared.groundTexture(blend.next) ?? map;
    }
    this.mix.value = blend.mix;
    const a = palette[blend.current],
      b = palette[blend.next];
    const value = (i: number) => THREE.MathUtils.lerp(a[i], b[i], blend.mix);
    this.scale.value.set(value(0), value(1), value(2));
    this.bias.value.set(value(3), value(4), value(5));
  }
}
