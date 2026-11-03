import * as THREE from 'three';

/** Отмечает одного собеседника кольцом и ромбом; владеет только собственными ресурсами. */
export class AnimalHighlight {
  private readonly marker = new THREE.Group();
  // Отметки рисуются после непрозрачной земли; проверка глубины скрывает их за стенами.
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0xffd45c,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  private readonly ringGeometry = new THREE.RingGeometry(0.88, 1, 48);
  private readonly pointerGeometry = new THREE.OctahedronGeometry(0.14);
  private readonly ring = new THREE.Mesh(this.ringGeometry, this.material);
  private readonly pointer = new THREE.Mesh(this.pointerGeometry, this.material);

  constructor() {
    this.marker.name = 'conversation-highlight';
    this.ring.rotation.x = -Math.PI / 2;
    this.marker.add(this.ring, this.pointer);
  }

  select(root?: THREE.Group): void {
    this.marker.removeFromParent();
    if (!root) return;

    // Границы читаются только при смене цели, до добавления отметки: её собственная
    // геометрия не увеличивает размер выделения. Материалы и LOD животного не меняются.
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(root);
    const scale = root.getWorldScale(new THREE.Vector3());
    const origin = root.getWorldPosition(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(0.45, Math.max(size.x, size.z) * 0.6);
    const height = bounds.isEmpty() ? 1.8 : bounds.max.y - origin.y;
    this.marker.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
    this.ring.position.y = 0.035;
    this.ring.scale.setScalar(radius);
    this.pointer.position.y = height + 0.32;
    root.add(this.marker);
  }

  dispose(): void {
    this.marker.removeFromParent();
    this.ringGeometry.dispose();
    this.pointerGeometry.dispose();
    this.material.dispose();
  }
}
