import type { InputController } from './InputController';

/** Композит ввода: принимает контроллеры устройств и управляет их жизненным циклом. */
export class GameInputController {
  constructor(private readonly controllers: readonly InputController[]) {}

  clear(): void {
    for (const controller of this.controllers) controller.reset();
  }

  dispose(): void {
    for (const controller of this.controllers) controller.dispose();
  }
}
