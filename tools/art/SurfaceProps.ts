import * as THREE from 'three';

/** Округлый валун с мягкими сколами; рисунок гранита, сланца и мха задаётся общей текстурой. */
export function createRockModel(kind: 'granite' | 'moss' | 'slate'): THREE.Group {
  const root = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 12, 8);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const shape = 1 + Math.sin(x * 4 + z * 3) * Math.sin(y * 5) * 0.09;
    positions.setXYZ(
      i,
      x * shape * (kind === 'slate' ? 1.3 : 1),
      y * shape * (kind === 'slate' ? 0.35 : 0.72),
      z * shape * 0.9,
    );
  }
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeVertexNormals();
  root.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ name: `surface_rock_${kind}`, roughness: 1 }),
    ),
  );
  return root;
}

/** Единичное по длине бревно: общая кора и отдельные торцы с годовыми кольцами. */
export function createLogModel(): THREE.Group {
  const root = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ name: 'surface_bark', roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ name: 'surface_wood', roughness: 1 });
  const body = new THREE.CylinderGeometry(0.18, 0.24, 1, 16, 5, true);
  const positions = body.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const variation = 1 + Math.sin(positions.getY(i) * 8 + positions.getX(i) * 20) * 0.035;
    positions.setXYZ(
      i,
      positions.getX(i) * variation,
      positions.getY(i),
      positions.getZ(i) * variation,
    );
  }
  body.computeVertexNormals();
  root.add(new THREE.Mesh(body, bark));
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(side === 1 ? 0.18 : 0.24, 16), wood);
    end.rotation.x = (-side * Math.PI) / 2;
    end.position.y = side * 0.5;
    root.add(end);
  }
  return root;
}
