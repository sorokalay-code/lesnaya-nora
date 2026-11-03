import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const material = new THREE.MeshStandardMaterial({
  name: 'eye',
  color: 0x674323,
  roughness: 0.24,
  vertexColors: true,
});

/** Один меш глаза с цветами вершин заменяет три отрисовки радужки, зрачка и блика. */
export function createRabbitEye(low: boolean): THREE.Mesh {
  const build = (position: THREE.Vector3, scale: THREE.Vector3, colour: number) => {
    const geometry = new THREE.SphereGeometry(1, low ? 6 : 8, low ? 4 : 6);
    geometry.scale(scale.x, scale.y, scale.z).translate(position.x, position.y, position.z);
    const colours = new Float32Array(geometry.attributes.position.count * 3);
    colours.fill(colour);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    return geometry;
  };
  const parts = [
    build(new THREE.Vector3(), new THREE.Vector3(0.05, 0.063, 0.037), 0.8),
    build(new THREE.Vector3(0, 0, -0.033), new THREE.Vector3(0.026, 0.045, 0.014), 0.015),
    build(new THREE.Vector3(-0.015, 0.019, -0.05), new THREE.Vector3(0.012, 0.014, 0.007), 1),
  ];
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('Не удалось объединить глаз кролика.');
  parts.forEach((part) => part.dispose());
  const eye = new THREE.Mesh(geometry, material);
  eye.name = 'Iris';
  return eye;
}
