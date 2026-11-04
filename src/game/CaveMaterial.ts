import * as THREE from 'three';

/** Смешивает три проекции грунта: пол использует XZ, стены — XY и ZY. */
export function caveMaterial(texture?: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0x80694e,
    map: texture ?? null,
    roughness: 1,
    side: THREE.BackSide,
  });
  material.onBeforeCompile = (shader) => {
    const varyings = 'varying vec3 vCavePosition; varying vec3 vCaveNormal;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + varyings)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCavePosition = position; vCaveNormal = normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + varyings)
      .replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec3 weights = pow(abs(normalize(vCaveNormal)), vec3(4.0));
          weights /= dot(weights, vec3(1.0));
          vec3 p = vCavePosition * 0.45;
          diffuseColor *= texture2D(map, p.zy) * weights.x
                        + texture2D(map, p.xz) * weights.y
                        + texture2D(map, p.xy) * weights.z;
        #endif
        `,
      );
  };
  return material;
}
