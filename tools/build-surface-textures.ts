import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { SURFACE_TEXTURES, type SurfaceTexture } from '../src/game/SurfaceMaterials';
import { hash2, smoothNoise } from '../src/game/Random';

const SIZE = 128;

function chunk(name: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(name, 4);
  data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, 8 + data.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return out;
}

/** Бесшовные нейтральные штрихи дополняют тёплую палитру моделей без фотошума и резких пятен. */
export function surfacePixel(kind: SurfaceTexture, x: number, y: number): [number, number, number] {
  x = ((x % SIZE) + SIZE) % SIZE;
  y = ((y % SIZE) + SIZE) % SIZE;
  const grain = hash2(x, y, 7561) - 0.5;
  const wave = Math.sin((x / SIZE) * Math.PI * 8 + Math.sin((y / SIZE) * Math.PI * 4));
  const soft = smoothNoise(x / 16, y / 16, 861) - 0.5;
  if (kind === 'coat') {
    const strand = Math.sin((x * Math.PI) / 2 + Math.sin((y * Math.PI) / 16) * 1.3);
    const value = 233 + strand * 9 + grain * 7;
    return [value, value, value];
  }
  if (kind === 'feather') {
    const value = 234 + Math.cos(((x + y) * Math.PI) / 8) * 10 + wave * 4;
    return [value, value, value];
  }
  if (kind === 'scales') {
    const row = Math.floor(y / 8);
    const arc = Math.sin((((x + row * 4) % 8) / 8) * Math.PI);
    const value = 224 + arc * 18 - Math.cos((y * Math.PI) / 4) * 7;
    return [value, value, value];
  }
  if (kind === 'chitin') {
    const value = 235 + wave * 6 + grain * 5;
    return [value, value, value];
  }
  if (kind === 'bark') {
    const groove = Math.pow((wave + 1) / 2, 6);
    return [119 - groove * 44 + grain * 9, 94 - groove * 38 + grain * 7, 68 - groove * 27];
  }
  if (kind === 'wood') {
    const rings = Math.sin(Math.hypot(x - 64, y - 64) * 0.8 + soft);
    return [182 + rings * 12, 151 + rings * 12, 108 + rings * 9];
  }
  const value = 156 + soft * 27 + grain * 13 + wave * 5;
  if (kind === 'rock_moss' && soft > 0) return [value * 0.64, value * 0.77, value * 0.47];
  if (kind === 'rock_slate') return [value * 0.8, value * 0.86, value * 0.91];
  return [value, value * 0.97, value * 0.89];
}

export function buildSurfaceTextures(): void {
  mkdirSync('public/textures', { recursive: true });
  for (const kind of SURFACE_TEXTURES) {
    const pixels = Buffer.alloc(SIZE * (SIZE * 4 + 1));
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
        const rgb = surfacePixel(kind, x, y);
        rgb.forEach(
          (value, channel) =>
            (pixels[offset + channel] = Math.round(Math.max(0, Math.min(255, value)))),
        );
        pixels[offset + 3] = 255;
      }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0);
    header.writeUInt32BE(SIZE, 4);
    header[8] = 8;
    header[9] = 6;
    writeFileSync(
      `public/textures/surface-${kind}.png`,
      Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(pixels)),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    );
  }
}
