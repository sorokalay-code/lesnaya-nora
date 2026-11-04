type Point = readonly [number, number];
type RGB = readonly [number, number, number];
const SIDE = 64;

export function forestLitter(variant: number): Buffer {
  const pixels = Buffer.alloc(SIDE * SIDE * 4);
  const fill = (color: RGB, contains: (x: number, y: number) => boolean) => {
    for (let y = 2; y < 62; y++) {
      for (let x = 2; x < 62; x++) {
        if (!contains(x + 0.5, y + 0.5)) continue;
        const at = (y * SIDE + x) * 4;
        pixels.set([...color, 255], at);
      }
    }
  };
  const polygon = (points: Point[], color: RGB) =>
    fill(color, (x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i],
          [bx, by] = points[j];
        if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
      }
      return inside;
    });
  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: RGB) =>
    fill(color, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1);
  const stroke = (a: Point, b: Point, width: number, color: RGB) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    fill(color, (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      return (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2 < width * width;
    });
  };

  if (variant < 5) {
    const shades: RGB[] = [
      [132, 142, 142],
      [156, 121, 103],
      [92, 103, 121],
      [180, 174, 149],
      [116, 124, 106],
    ];
    const [r, g, b] = shades[variant];
    const top = 13 + ((variant * 7) % 14);
    const peak: Point = [24 + variant * 3, top];
    const left: Point = [6 + variant, 47],
      right: Point = [57 - variant, 50];
    polygon([left, peak, [48 + variant, top + 12], right, [46, 61], [15, 61]], [r, g, b]);
    polygon([peak, [48 + variant, top + 12], right, [29, 47]], [r - 24, g - 22, b - 20]);
    polygon([left, [29, 47], right, [46, 61], [15, 61]], [r - 43, g - 40, b - 36]);
    if (variant === 4) ellipse(27, 38, 12, 4, [109, 139, 65]);
    if (variant === 3) stroke([21, 43], [49, 32], 1.1, [207, 202, 179]);
  } else if (variant < 10) {
    const i = variant - 5;
    const colors: RGB[] = [
      [186, 134, 50],
      [166, 76, 44],
      [151, 150, 64],
      [184, 102, 47],
      [139, 92, 55],
    ];
    const silhouettes: Point[][] = [
      [
        [9, 34],
        [21, 19],
        [40, 15],
        [55, 23],
        [49, 39],
        [30, 48],
        [16, 45],
      ],
      [
        [9, 37],
        [19, 29],
        [16, 19],
        [28, 24],
        [33, 9],
        [40, 21],
        [54, 16],
        [50, 31],
        [57, 39],
        [42, 44],
        [26, 43],
      ],
      [
        [8, 35],
        [21, 24],
        [41, 18],
        [56, 13],
        [49, 28],
        [38, 40],
        [20, 44],
      ],
      [
        [8, 38],
        [19, 27],
        [29, 26],
        [36, 15],
        [50, 17],
        [56, 29],
        [48, 41],
        [31, 47],
        [19, 46],
      ],
      [
        [8, 41],
        [17, 30],
        [22, 22],
        [31, 26],
        [41, 15],
        [53, 18],
        [51, 34],
        [39, 46],
        [21, 49],
      ],
    ];
    polygon(silhouettes[i], colors[i]);
    stroke([5, 46], [46, 25], 1.1, [109, 79, 39]);
    stroke([25, 36], [24, 28], 0.6, [119, 83, 46]);
    stroke([33, 32], [39, 39], 0.6, [119, 83, 46]);
  } else if (variant < 14) {
    const wood: RGB = [116, 82, 52];
    if (variant === 13) {
      polygon(
        [
          [9, 41],
          [21, 24],
          [48, 18],
          [55, 35],
          [40, 45],
          [16, 48],
        ],
        wood,
      );
      stroke([16, 43], [48, 23], 1.6, [161, 120, 75]);
      stroke([25, 44], [51, 31], 1, [78, 55, 39]);
    } else {
      const end: Point = [57, 18 + (variant - 10) * 7];
      stroke([7, 50], [29, 37], 2.8, wood);
      stroke([29, 37], end, 2.2, wood);
      if (variant !== 10) stroke([29, 37], [37, 19], 1.6, wood);
      if (variant === 12) stroke([39, 35], [49, 47], 1.3, wood);
      stroke([10, 48], [27, 37], 0.7, [178, 131, 78]);
    }
  } else if (variant < 17) {
    const i = variant - 14;
    ellipse(32, 39 + i, 17 + i, 21 - i, [97, 62, 37]);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const x = 22 + col * 9 + (row % 2) * 3;
        ellipse(x, 25 + row * 7, 4 + i, 3, [139 + i * 9, 90 + row * 3, 49 + i * 5]);
      }
    }
  } else if (variant === 17) {
    ellipse(32, 44, 13, 16, [164, 105, 49]);
    ellipse(30, 32, 15, 7, [107, 79, 51]);
    stroke([31, 29], [33, 21], 1.5, [105, 75, 44]);
    ellipse(28, 44, 2, 7, [193, 134, 66]);
  } else if (variant === 18) {
    polygon(
      [
        [9, 41],
        [14, 27],
        [25, 24],
        [30, 34],
        [39, 24],
        [51, 30],
        [55, 42],
        [43, 50],
        [18, 50],
      ],
      [143, 101, 61],
    );
    ellipse(23, 38, 8, 5, [194, 151, 91]);
    ellipse(43, 40, 7, 5, [184, 140, 83]);
  } else {
    for (let i = 0; i < 10; i++) {
      stroke(
        [32, 34],
        [8 + ((i * 17) % 50), 14 + ((i * 23) % 38)],
        0.85,
        i % 2 ? [142, 120, 66] : [103, 104, 52],
      );
    }
  }

  return pixels;
}
