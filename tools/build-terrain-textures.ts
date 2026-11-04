import { forestLitter } from './art/ForestLitter';
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
  seed: number,
  base: RGB,
  fleck: RGB,
  density: number,
  size: number,
  side = 128,
): Buffer {
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
  return pixels;
}

const profiles = [
  {
    name: 'spring',
    base: [224, 236, 218],
    fleck: [128, 172, 105],
    stem: [98, 156, 64],
    petals: [
      [245, 229, 182],
      [197, 165, 233],
      [248, 200, 217],
    ],
  },
  {
    name: 'summer',
    base: [222, 230, 198],
    fleck: [171, 180, 112],
    stem: [66, 139, 44],
    petals: [
      [250, 216, 79],
      [173, 122, 232],
      [246, 124, 151],
    ],
  },
  {
    name: 'autumn',
    base: [229, 211, 176],
    fleck: [171, 104, 49],
    stem: [163, 137, 60],
    petals: [
      [178, 137, 73],
      [159, 101, 54],
      [198, 157, 88],
    ],
  },
  {
    name: 'winter',
    base: [246, 250, 254],
    fleck: [170, 190, 213],
    stem: [150, 127, 99],
    petals: [
      [166, 139, 105],
      [143, 112, 83],
      [180, 154, 120],
    ],
  },
] as const;

type Profile = (typeof profiles)[number];

function atlas(
  name: string,
  cell: number,
  sample: (variant: number) => Buffer,
  padding = 0,
  count = 10,
): void {
  const columns = count > 16 ? 8 : 4;
  const width = cell * columns;
  const height = cell * 4;
  const pixels = Buffer.alloc(width * height * 4);
  const interior = cell - padding * 2;
  for (let variant = 0; variant < count; variant++) {
    const tile = sample(variant);
    const originX = (variant % columns) * cell;
    const originY = Math.floor(variant / columns) * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const source =
          (((y - padding + interior) % interior) * interior +
            ((x - padding + interior) % interior)) *
          4;
        const dest = ((originY + y) * width + originX + x) * 4;
        tile.copy(pixels, dest, source, source + 4);
      }
    }
  }
  png(name, width, height, pixels);
}

for (const [season, profile] of profiles.entries()) {
  atlas(
    `ground-${profile.name}`,
    128,
    (variant) => {
      const shade = ((variant % 5) - 2) * 3;
      const [r, g, b] = profile.base;
      return terrain(
        41 + season * 100 + variant,
        [r + shade, g + shade, b + shade],
        profile.fleck,
        145 + ((variant * 73 + season * 44) % 250),
        3 + ((variant + season) % 5),
        112,
      );
    },
    8,
  );
  atlas(
    `cover-${profile.name}`,
    64,
    (variant) => (variant < 10 ? plant(profile, variant, season) : forestLitter(variant - 10)),
    0,
    30,
  );
}

png('soil-spring', 128, 128, terrain(51, [197, 177, 148], [102, 88, 68], 170, 4));
png('soil-summer', 128, 128, terrain(52, [227, 203, 165], [157, 132, 100], 320, 3));
png('soil-autumn', 128, 128, terrain(53, [206, 177, 145], [121, 92, 64], 240, 5));
png('soil-winter', 128, 128, terrain(54, [211, 211, 210], [142, 145, 154], 105, 6));

function plant(profile: Profile, variant: number, season: number): Buffer {
  const side = 64;
  const pixels = Buffer.alloc(side * side * 4);
  const rng = new Random(415 + variant * 13 + season * 137);
  const winter = profile.name === 'winter';
  const fern = variant >= 4 && variant < 7;
  const flower = variant >= 7;
  const dot = (cx: number, cy: number, rx: number, ry: number, color: RGB) => {
    for (let y = Math.max(2, Math.floor(cy - ry)); y < Math.min(62, cy + ry); y++) {
      for (let x = Math.max(2, Math.floor(cx - rx)); x < Math.min(62, cx + rx); x++) {
        const distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (distance > 1) continue;
        const offset = (y * side + x) * 4;
        color.forEach((value, i) => (pixels[offset + i] = value));
        pixels[offset + 3] = 255;
      }
    }
  };

  const stems = winter ? 2 + (variant % 4) : fern || flower ? 3 + (variant % 3) : 8 + variant * 2;
  const heightScale = [0.82, 1, 0.78, 0.69][season];
  for (let i = 0; i < stems; i++) {
    const start = rng.range(22, 42),
      tip = rng.range(7, 57);
    const height = rng.range(23, 52) * heightScale;
    const shade = rng.range(-17, 17);
    const [r, g, b] = profile.stem;
    const stem: RGB = [r + shade, g + shade, b + shade];
    for (let j = 0; j <= height; j++) {
      const t = j / height;
      const x = start + (tip - start) * t * t;
      const y = 61 - j;
      const width = winter ? 0.85 : fern || flower ? 1.35 : 0.7 + 2.4 * (1 - t);
      dot(x, y, width, 1.8, stem);
      if (!winter && (fern || flower) && j % (fern ? 5 : 12) === 4 && t < 0.9) {
        const leaf = (fern ? 6 : 4) * Math.sin(t * Math.PI) + 1;
        dot(x - leaf, y + 1, leaf, 2, stem);
        dot(x + leaf, y - 1, leaf, 2, stem);
      }
    }
    if (flower && !winter) {
      const y = 61 - height;
      const petalColor = profile.petals[variant - 7];
      const petals = profile.name === 'autumn' ? 3 : 4 + (variant % 3);
      const radius = profile.name === 'summer' ? 5 : 3.6;
      for (let j = 0; j < petals; j++) {
        const angle = (j * Math.PI * 2) / petals;
        dot(
          tip + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius,
          radius * 0.64,
          radius * 0.7,
          petalColor,
        );
      }
      dot(tip, y, 2.5, 2.5, profile.name === 'autumn' ? [134, 101, 52] : [245, 197, 76]);
    }
  }
  return pixels;
}
