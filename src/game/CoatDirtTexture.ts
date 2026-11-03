import * as THREE from 'three';

/** Одна повторяемая RGBA-текстура разводов для всей семьи; не создаёт мешей и не зависит от кадров. */
export class CoatDirtTexture {
  private static shared?: THREE.DataTexture;

  static get texture(): THREE.DataTexture {
    if (this.shared) return this.shared;
    const size = 128,
      pixels = new Uint8Array(size * size * 4);
    const hash = (x: number, y: number) => {
      const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    const noise = (x: number, y: number, scale: number) => {
      const px = (x / size) * scale,
        py = (y / size) * scale,
        ix = Math.floor(px),
        iy = Math.floor(py);
      const fx = px - ix,
        fy = py - iy,
        sx = fx * fx * (3 - 2 * fx),
        sy = fy * fy * (3 - 2 * fy);
      const at = (a: number, b: number) => hash((a + scale) % scale, (b + scale) % scale);
      return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx),
        THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx),
        sy,
      );
    };
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          mask = noise(x, y, 5) * 0.72 + noise(x, y, 17) * 0.28;
        const yellow = noise(x + 31, y, 7),
          grain = hash(x, y) * 18;
        pixels[i] = 55 + yellow * 78 + grain;
        pixels[i + 1] = 41 + yellow * 63 + grain;
        pixels[i + 2] = 20 + yellow * 16 + grain * 0.3;
        pixels[i + 3] = Math.min(255, Math.max(0, (mask - 0.14) * 360));
      }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name = 'coat-stain-overlay';
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this.shared = texture;
    return texture;
  }
}
