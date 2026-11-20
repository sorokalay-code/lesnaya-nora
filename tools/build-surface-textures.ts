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
  if (kind === 'roe-deer') {
    const strand = Math.sin((x * Math.PI) / 2 + Math.sin((y * Math.PI) / 16) * 1.3);
    const mottling = smoothNoise(x / 7, y / 7, 1289) - 0.5;
    const value = 230 + strand * 7 + grain * 5 + mottling * 9;
    return [value, value, value];
  }
  if (kind === 'frog') {
    const mottling = smoothNoise(x / 8, y / 8, 2917) - 0.5;
    const flecks = hash2(Math.floor(x / 4), Math.floor(y / 4), 3911) - 0.5;
    const value = 226 + mottling * 22 + flecks * 12 + grain * 7;
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
  if (kind === 'earth') {
    const px = (x / SIZE) * Math.PI * 2;
    const py = (y / SIZE) * Math.PI * 2;
    const mottling =
      Math.sin(px * 3 + Math.sin(py * 2) * 1.4) + Math.cos(py * 4 + Math.sin(px * 5) * 0.8);
    const grit = Math.sin(px * 24 + Math.sin(py * 8) * 1.6) * Math.sin(py * 16);
    const value = 137 + mottling * 6 + grit * 4;
    return [value * 1.05, value * 0.84, value * 0.64];
  }
  if (kind === 'leaf-litter') {
    const cellSize = 32;
    const px = (x / SIZE) * Math.PI * 2;
    const py = (y / SIZE) * Math.PI * 2;
    const ground = 106 + Math.sin(px * 4 + Math.cos(py * 3)) * 8;
    const color: [number, number, number] = [ground, ground * 0.81, ground * 0.58];
    const leaves = [
      [147, 119, 67],
      [121, 113, 61],
      [164, 132, 78],
      [110, 95, 54],
    ] as const;
    for (let cellY = Math.floor(y / cellSize) - 1; cellY <= Math.floor(y / cellSize) + 1; cellY++) {
      for (
        let cellX = Math.floor(x / cellSize) - 1;
        cellX <= Math.floor(x / cellSize) + 1;
        cellX++
      ) {
        const tileX = ((cellX % 4) + 4) % 4;
        const tileY = ((cellY % 4) + 4) % 4;
        const seed = tileY * 4 + tileX;
        const centerX = cellX * cellSize + hash2(seed, 1, 8723) * cellSize;
        const centerY = cellY * cellSize + hash2(seed, 2, 8723) * cellSize;
        const angle = hash2(seed, 3, 8723) * Math.PI;
        const dx = x - centerX;
        const dy = y - centerY;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
        const length = 9 + hash2(seed, 4, 8723) * 7;
        const width = 2.5 + hash2(seed, 5, 8723) * 2.5;
        const distance = (along / length) ** 2 + (across / width) ** 2;
        if (distance >= 1) continue;

        const source = leaves[Math.floor(hash2(seed, 6, 8723) * leaves.length)];
        const blend = Math.min(0.94, (1 - distance) * 2.4);
        const vein = Math.abs(across) < 0.8 && Math.abs(along) < length * 0.75;
        for (let channel = 0; channel < 3; channel++) {
          const target = source[channel] + (vein ? 16 : 0);
          color[channel] += (target - color[channel]) * blend;
        }
      }
    }
    return color;
  }
  if (kind === 'straw') {
    const px = (x / SIZE) * Math.PI * 2;
    const py = (y / SIZE) * Math.PI * 2;
    const fibers = Math.sin(px * 32 + Math.sin(py * 6) * 1.1);
    const value = 210 + fibers * 13 + Math.cos(py * 3) * 4;
    return [value, value * 0.87, value * 0.62];
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
