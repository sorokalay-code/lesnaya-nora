import * as THREE from 'three';
import { denFloor, DEN_DEPTH, DEN_HALF_WIDTH, DEN_HEIGHT } from './WolfDen';

const ARCH_STEPS = 16;
const earth = new THREE.Color('#66513b');
const moss = new THREE.Color('#52623c');
const clay = new THREE.Color('#493624');
const shadow = new THREE.Color('#251c16');

/** Строит общую модель земляного логова с открытым сводом, полом и задней стенкой. */
export function wolfDenModel(): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  type Vertex = { x: number; y: number; z: number; color: THREE.Color };
  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    for (const { x, y, z, color } of [a, b, c]) {
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  };
  const join = (a: Vertex[], b: Vertex[]) => {
    for (let i = 0; i < ARCH_STEPS; i++) {
      triangle(a[i], a[i + 1], b[i]);
      triangle(a[i + 1], b[i + 1], b[i]);
    }
  };
  const arch = (z: number, width: number, height: number, base: number, outside: boolean) =>
    Array.from({ length: ARCH_STEPS + 1 }, (_, i): Vertex => {
      const angle = (i * Math.PI) / ARCH_STEPS;
      const crown = Math.sin(angle);
      const irregularity = 0.95 + 0.035 * Math.sin(i * 0.8 + z) + 0.015 * Math.cos(i * 1.8 - z);
      const color = outside
        ? earth.clone().lerp(moss, 0.85 * crown * irregularity)
        : clay.clone().lerp(shadow, Math.min(0.86, z / 3 + crown * 0.16));
      return {
        x: Math.cos(angle) * width,
        y: base + crown * height * irregularity,
        z,
        color: color.multiplyScalar(0.87 + 0.13 * irregularity),
      };
    });

  const front = arch(0, DEN_HALF_WIDTH, DEN_HEIGHT + 0.65, -0.58, true);
  const crest = arch(1.5, DEN_HALF_WIDTH, DEN_HEIGHT + 0.76, -0.58, true);
  const rear = arch(DEN_DEPTH, DEN_HALF_WIDTH * 0.9, 0.37, -0.58, true);
  const lip = arch(-0.05, 1.35, 1.82, denFloor(0), false);
  const inner = arch(1.08, 1.43, 1.7, denFloor(1.08), false);
  const end = arch(3.05, 1.35, 1.45, denFloor(3.05), false);
  join(front, crest);
  join(crest, rear);
  join(front, lip);
  join(lip, inner);
  join(inner, end);
  for (let i = 0; i < ARCH_STEPS; i++) {
    triangle(end[i], end[i + 1], { x: 0, y: denFloor(3.05), z: 3.1, color: shadow });
  }
  for (const [a, b] of [
    [lip, inner],
    [inner, end],
  ]) {
    triangle(a[0], b[0], a[ARCH_STEPS]);
    triangle(b[0], b[ARCH_STEPS], a[ARCH_STEPS]);
  }

  // Камни укрепляют края устья. Они входят в тот же меш, чтобы не добавлять вызовы рендера.
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const vertices = rock.getAttribute('position');
  const granite = new THREE.Color('#65645b');
  for (const [x, y, z, scale] of [
    [-1.72, 0.25, 0.23, 0.76],
    [1.81, 0.34, 0.31, 0.69],
    [-2.05, -0.12, 1.38, 0.49],
    [1.9, 0.09, 1.66, 0.53],
  ]) {
    for (let i = 0; i < vertices.count; i += 3) {
      const color = granite.clone().lerp(moss, 0.24 + (i % 7) * 0.045);
      const corner = (index: number): Vertex => ({
        x: x + vertices.getX(index) * scale,
        y: y + vertices.getY(index) * scale * 0.97,
        z: z + vertices.getZ(index) * scale * 1.23,
        color,
      });
      triangle(corner(i), corner(i + 1), corner(i + 2));
    }
  }
  rock.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
