import type { Object3D } from 'three';

interface GaitState {
  x: number;
  z: number;
  speed: number;
  clip: 'hop' | 'run' | 'jump';
  rate: number;
}

/** Связывает частоту заячьих прыжков со скоростью, не смешивая походку с физической дугой прыжка. */
export class RabbitGait {
  private static readonly states = new WeakMap<Object3D, GaitState>();

  static reset(root: Object3D): void {
    this.states.delete(root);
  }

  static update(
    root: Object3D,
    moving: boolean,
    frightened: boolean,
    jumping: boolean,
    dt: number,
  ): GaitState {
    let state = this.states.get(root);
    if (!state) {
      state = { x: root.position.x, z: root.position.z, speed: 3.6, clip: 'hop', rate: 1 };
      this.states.set(root, state);
    }
    const distance = Math.hypot(root.position.x - state.x, root.position.z - state.z);
    const scale = Math.max(0.2, root.scale.x);
    if (moving && dt > 0 && distance > 0.0001) {
      const measured = Math.min(16, distance / dt / scale);
      state.speed += (measured - state.speed) * (1 - Math.exp(-dt * 12));
    }
    state.x = root.position.x;
    state.z = root.position.z;
    if (!moving) state.speed = 3.6;

    // Гистерезис исключает постоянную смену клипов около порога бега.
    const running = frightened || state.speed > (state.clip === 'run' ? 5.2 : 6);
    state.clip = jumping ? 'jump' : running ? 'run' : 'hop';
    state.rate = jumping ? 1 : Math.max(0.65, Math.min(1.65, state.speed / (running ? 7.5 : 3.6)));
    return state;
  }
}
