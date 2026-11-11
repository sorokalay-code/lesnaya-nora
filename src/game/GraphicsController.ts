import { PCFShadowMap, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { GRAPHICS_LEVELS, type GraphicsSettings } from './GraphicsSettings';
import { ModelAssets } from './ModelAssets';
import type { SceneLighting } from './session/SceneLighting';

/** Применяет настройки рендера и общих текстур при смене качества. */
export class GraphicsController {
  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
    private readonly lighting: SceneLighting,
    private readonly pixelRatioLimit: number,
  ) {
    renderer.shadowMap.type = PCFShadowMap;
  }

  apply(settings: GraphicsSettings, deviceRatio: number): void {
    const ratio =
      Math.min(deviceRatio, this.pixelRatioLimit) * GRAPHICS_LEVELS.resolution[settings.resolution];
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);

    const far = GRAPHICS_LEVELS.distance[settings.distance].far;
    if (this.camera.far !== far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }

    const shadowSize = Math.min(
      GRAPHICS_LEVELS.shadows[settings.shadows],
      this.renderer.capabilities.maxTextureSize,
    );
    this.renderer.shadowMap.enabled = shadowSize > 0;
    this.lighting.setShadowSize(shadowSize);

    const anisotropy = Math.min(
      GRAPHICS_LEVELS.textures[settings.textures],
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    ModelAssets.shared.setTextureAnisotropy(Math.max(1, anisotropy));
  }
}
