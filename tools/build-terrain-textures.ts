import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { Random } from '../src/game/Random';

type RGB = readonly [number, number, number];
const directory = 'public/textures';
mkdirSync(directory, { recursive: true });

function png(name: string, width: number, height: number, rgba: Buffer): void {
  const chunk = (type: string, data: Buffer) => {
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length);
    output.write(type, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++)
    rgba.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  writeFileSync(
    `${directory}/${name}.png`,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function terrain(
  name: string,
  seed: number,
  base: RGB,
  fleck: RGB,
  density: number,
  size: number,
): void {
  const side = 128;
  const pixels = Buffer.alloc(side * side * 4);
  const rng = new Random(seed);
  const tau = (Math.PI * 2) / side;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const noise =
        8 * Math.sin((2 * x + 3 * y) * tau) +
        5 * Math.cos((7 * x - 4 * y) * tau) +
        rng.range(-9, 9);
      const offset = (y * side + x) * 4;
      base.forEach((value, i) => (pixels[offset + i] = Math.min(255, Math.max(0, value + noise))));
      pixels[offset + 3] = 255;
    }
  }

  for (let n = 0; n < density; n++) {
    const cx = rng.int(0, side - 1),
      cy = rng.int(0, side - 1);
    const rx = rng.int(1, size),
      ry = rng.int(1, size);
    const opacity = rng.range(0.25, 0.8);
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const amount = opacity * Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2);
        const offset = (((cy + y + side) % side) * side + ((cx + x + side) % side)) * 4;
        fleck.forEach((value, i) => (pixels[offset + i] += (value - pixels[offset + i]) * amount));
      }
    }
  }
  png(name, side, side, pixels);
}

terrain('ground-spring', 41, [224, 236, 218], [128, 172, 105], 270, 4);
terrain('ground-summer', 42, [222, 230, 198], [171, 180, 112], 370, 3);
terrain('ground-autumn', 43, [229, 211, 176], [171, 104, 49], 250, 6);
terrain('ground-winter', 44, [246, 250, 254], [170, 190, 213], 140, 7);
terrain('soil-spring', 51, [197, 177, 148], [102, 88, 68], 170, 4);
terrain('soil-summer', 52, [227, 203, 165], [157, 132, 100], 320, 3);
terrain('soil-autumn', 53, [206, 177, 145], [121, 92, 64], 240, 5);
terrain('soil-winter', 54, [211, 211, 210], [142, 145, 154], 105, 6);

const cell = 64;
const atlasWidth = cell * 4;
const atlas = Buffer.alloc(atlasWidth * cell * 4);

function leaf(panel: number, cx: number, cy: number, rx: number, ry: number, color: RGB): void {
  for (let y = Math.max(1, Math.floor(cy - ry)); y < Math.min(cell - 1, cy + ry); y++) {
    for (let x = Math.max(1, Math.floor(cx - rx)); x < Math.min(cell - 1, cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      const offset = (y * atlasWidth + cell * panel + x) * 4;
      color.forEach((value, i) => (atlas[offset + i] = value));
      atlas[offset + 3] = 255;
    }
  }
}

const rng = new Random(415);
for (let i = 0; i < 15; i++) {
  const base = rng.range(15, 48),
    tip = rng.range(5, 59),
    height = rng.range(24, 53);
  const color: RGB = [rng.int(67, 117), rng.int(112, 158), rng.int(34, 62)];
  for (let j = 0; j <= height; j++) {
    const t = j / height;
    leaf(0, base + (tip - base) * t * t, 62 - j, 0.8 + 2 * (1 - t), 1.8, color);
  }
}

for (let stem = -1; stem <= 1; stem++) {
  for (let y = 10; y < 62; y++) {
    const x = 32 + stem * (62 - y) * 0.35;
    leaf(1, x, y, 1.5, 2, [76, 116, 46]);
    if (y % 5 !== 0) continue;
    const width = ((y - 6) * (62 - y)) / 72 + 2;
    leaf(1, x - width / 2, y, width, 2.8, [92, 151, 56]);
    leaf(1, x + width / 2, y - 2, width, 2.4, [117, 170, 66]);
  }
}

for (const [x, y] of [
  [16, 29],
  [33, 14],
  [48, 23],
]) {
  for (let row = y; row < 62; row++) {
    const stemX = x + ((32 - x) * (row - y)) / (62 - y);
    leaf(2, stemX, row, 1.5, 2, [80, 133, 50]);
    if (row % 13 === 0) leaf(2, stemX + 3, row, 5, 2.6, [119, 159, 57]);
  }
  for (let petal = 0; petal < 6; petal++) {
    const angle = (petal * Math.PI) / 3;
    leaf(2, x + Math.cos(angle) * 5, y + Math.sin(angle) * 5, 3.5, 3.8, [211, 174, 235]);
  }
  leaf(2, x, y, 3.4, 3.5, [248, 213, 106]);
}
png('ground-cover', atlasWidth, cell, atlas);
