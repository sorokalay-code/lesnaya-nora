import * as THREE from 'three';
import type { Excavation } from './Excavation';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export type CameraMode = 'first' | 'third';

/** Управляет видами от первого и третьего лица, захватом мыши и коллизиями камеры. */

export class ViewCamera {
  private touchMode = false;
  private yaw = 0.3;
  private pitch = 0.27;
  private distance = 7.5;
  private currentMode: CameraMode = 'third';
  private modeChanged = false;
  private readonly canvas: HTMLCanvasElement;
  private fallbackPointer?: { x: number; y: number };
  private edgeX = 0;
  private edgeY = 0;
  private lastLookTime = 0;
  private lookEnabled = true;
  private fallbackPaused = false;
  private paws = new THREE.Group();
  private pawGroups: THREE.Group[] = [];

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas;
    this.buildPaws();
    this.camera.add(this.paws);
    this.paws.visible = false;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerleave', () => {
      this.fallbackPointer = undefined;
      this.edgeX = this.edgeY = 0;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      if (!this.lookEnabled) return;

      const dx = this.isLocked
        ? e.movementX
        : this.fallbackPointer
          ? e.clientX - this.fallbackPointer.x
          : 0;
      const dy = this.isLocked
        ? e.movementY
        : this.fallbackPointer
          ? e.clientY - this.fallbackPointer.y
          : 0;
      this.yaw -= dx * 0.006;
      this.pitch = clamp(this.pitch + dy * 0.004, -0.3, 1.1);
      if (!this.isLocked && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
        this.fallbackPointer = { x: e.clientX, y: e.clientY };
        const rect = canvas.getBoundingClientRect();
        this.edgeX = e.clientX < rect.left + 12 ? -1 : e.clientX > rect.right - 12 ? 1 : 0;
        this.edgeY = e.clientY < rect.top + 12 ? -1 : e.clientY > rect.bottom - 12 ? 1 : 0;
      } else this.edgeX = this.edgeY = 0;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = clamp(this.distance + e.deltaY * 0.01, 2.5, 13);
      },
      { passive: false },
    );
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  get mode(): CameraMode {
    return this.currentMode;
  }

  get isFirstPerson(): boolean {
    return this.currentMode === 'first';
  }

  get isLocked(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.canvas;
  }

  setTouchMode(touch: boolean): void {
    this.touchMode = touch;
    this.fallbackPointer = undefined;
    this.edgeX = this.edgeY = 0;
    if (touch && this.isLocked) this.unlock();
  }

  lookBy(dx: number, dy: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.004, -0.3, 1.1);
  }

  lock(): void {
    this.fallbackPaused = false;
    this.lookEnabled = true;
    this.canvas.classList?.remove('look-paused');
    if (this.touchMode) return;

    if (!this.isLocked) void this.canvas.requestPointerLock?.().catch(() => {});
  }

  unlock(): void {
    this.fallbackPaused = true;
    this.lookEnabled = false;
    this.edgeX = this.edgeY = 0;
    this.fallbackPointer = undefined;
    this.canvas.classList?.add('look-paused');
    if (this.isLocked) document.exitPointerLock?.();
  }

  setLookEnabled(enabled: boolean): void {
    this.lookEnabled = enabled && !this.fallbackPaused;
    if (!this.lookEnabled) {
      this.edgeX = this.edgeY = 0;
      this.fallbackPointer = undefined;
    }
  }

  setMode(mode: CameraMode): void {
    if (this.currentMode === mode) return;

    this.currentMode = mode;
    this.modeChanged = true;
    this.paws.visible = mode === 'first';
    this.camera.fov = mode === 'first' ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  toggleMode(): CameraMode {
    this.setMode(this.isFirstPerson ? 'third' : 'first');
    return this.currentMode;
  }

  forwardAt(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  snap(x: number, y: number, z: number, underground: boolean): void {
    this.camera.position.set(
      x,
      y + (this.isFirstPerson ? 0.78 : underground ? 1.1 : 4),
      z + (this.isFirstPerson ? 0 : underground ? 0.8 : 6),
    );
    this.modeChanged = true;
  }

  private buildPaws(): void {
    const fur = new THREE.MeshBasicMaterial({ color: 0xf3e7cf }),
      pad = new THREE.MeshBasicMaterial({ color: 0xd99fa8 });
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * 0.33, -0.75, -1.2);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), fur);
      paw.scale.set(0.12, 0.16, 0.23);
      group.add(paw);
      for (let i = -1; i <= 1; i++) {
        const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), pad);
        toe.position.set(i * 0.065, -0.045, -0.18);
        toe.scale.set(0.032, 0.025, 0.048);
        group.add(toe);
      }

      this.paws.add(group);
      this.pawGroups.push(group);
    }
  }

  private animatePaws(time: number, digging: boolean, moving: boolean): void {
    this.pawGroups.forEach((paw, i) => {
      const phase = time * (digging ? 17 : 10) + i * Math.PI;
      paw.position.y = -0.75 + (digging ? 0.18 : moving ? 0.035 : 0) * Math.max(0, Math.sin(phase));
      paw.position.z = -1.2 - (digging ? 0.18 : moving ? 0.05 : 0) * Math.max(0, Math.sin(phase));
      paw.rotation.x = digging
        ? -0.32 + Math.sin(phase) * 0.22
        : moving
          ? Math.sin(phase) * 0.08
          : 0;
    });
  }

  update(
    x: number,
    z: number,
    groundY: number,
    earth?: Excavation,
    time = 0,
    digging = false,
    moving = false,
  ): void {
    if (this.lookEnabled && !this.isLocked) {
      const step = clamp(time - this.lastLookTime, 0, 0.05);
      this.yaw -= this.edgeX * step * 1.4;
      this.pitch = clamp(this.pitch + this.edgeY * step * 0.65, -0.3, 1.1);
    }

    this.lastLookTime = time;
    this.animatePaws(time, digging, moving);
    if (this.isFirstPerson) {
      const eye = earth ? 0.7 : 0.82,
        cos = Math.cos(this.pitch);
      this.camera.position.set(x, groundY + eye, z);
      this.camera.lookAt(
        x - Math.sin(this.yaw) * cos,
        groundY + eye - Math.sin(this.pitch),
        z - Math.cos(this.yaw) * cos,
      );
      this.modeChanged = false;
      return;
    }

    const underground = !!earth,
      shallow = !!earth && earth.depthAt(x, groundY, z) < 1.15 && earth.nearOpening(x, z, 2);
    const distance = underground ? Math.min(this.distance, shallow ? 3.7 : 2.35) : this.distance;
    const pitch = underground ? clamp(this.pitch, -0.18, 0.28) : this.pitch;
    const target = new THREE.Vector3(x, groundY + (underground ? 0.7 : 0.65), z);
    const planar = Math.cos(pitch) * distance;
    let wanted = new THREE.Vector3(
      x + Math.sin(this.yaw) * planar,
      groundY + (underground ? 0.75 : 1.5) + Math.sin(pitch) * distance,
      z + Math.cos(this.yaw) * planar,
    );
    if (earth) {
      wanted = earth.cameraPoint(target, wanted);
      if (this.modeChanged || !earth.contains(this.camera.position))
        this.camera.position.copy(wanted);
      else
        this.camera.position.copy(
          earth.cameraPoint(target, this.camera.position.clone().lerp(wanted, 0.35)),
        );
    } else if (this.modeChanged) this.camera.position.copy(wanted);
    else this.camera.position.lerp(wanted, 0.13);

    this.camera.lookAt(target);
    this.modeChanged = false;
  }
}
