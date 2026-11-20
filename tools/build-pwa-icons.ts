import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type Color = readonly [number, number, number];
const background: Color = [29, 48, 36];
const fur: Color = [237, 226, 200];
const ear: Color = [196, 145, 130];

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function pixel(x: number, y: number): Color {
  if (ellipse(x, y, 0.43, 0.59, 0.012, 0.018) || ellipse(x, y, 0.57, 0.59, 0.012, 0.018)) {
    return background;
  }
  if (ellipse(x, y, 0.5, 0.66, 0.022, 0.015)) return ear;
  if (ellipse(x, y, 0.5, 0.6, 0.205, 0.17)) return fur;
  if (ellipse(x, y, 0.405, 0.36, 0.032, 0.12) || ellipse(x, y, 0.595, 0.36, 0.032, 0.12)) {
    return ear;
  }
  if (ellipse(x, y, 0.405, 0.36, 0.065, 0.165) || ellipse(x, y, 0.595, 0.36, 0.065, 0.165)) {
    return fur;
  }
  return background;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

/** Рисует непрозрачный PNG; силуэт помещается в безопасную область maskable-иконки. */
function icon(size: number): Buffer {
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const samples = [
        pixel((x + 0.25) / size, (y + 0.25) / size),
        pixel((x + 0.75) / size, (y + 0.25) / size),
        pixel((x + 0.25) / size, (y + 0.75) / size),
        pixel((x + 0.75) / size, (y + 0.75) / size),
      ];
      for (let channel = 0; channel < 3; channel++) {
        rows[y * (size * 3 + 1) + 1 + x * 3 + channel] = Math.round(
          samples.reduce((sum, color) => sum + color[channel], 0) / samples.length,
        );
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, icon(size));
writeFileSync('public/icons/apple-touch-icon.png', icon(180));
