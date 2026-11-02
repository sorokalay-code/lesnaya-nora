import { readFileSync, readdirSync } from 'node:fs';
const rows = readdirSync('public/models')
  .filter((name) => name.endsWith('.glb'))
  .map((file) => {
    const data = readFileSync(`public/models/${file}`),
      length = data.readUInt32LE(12),
      gltf = JSON.parse(data.subarray(20, 20 + length).toString());
    let meshes = 0,
      triangles = 0;
    for (const node of gltf.nodes ?? []) {
      if (node.mesh === undefined) continue;
      for (const part of gltf.meshes[node.mesh].primitives) {
        meshes++;
        triangles += gltf.accessors[part.indices ?? part.attributes.POSITION].count / 3;
      }
    }
    return {
      model: file.replace('.glb', ''),
      meshes,
      triangles,
      materials: gltf.materials?.length ?? 0,
      KiB: Math.round(data.length / 1024),
    };
  });
console.table(rows.sort((a, b) => b.triangles - a.triangles));
