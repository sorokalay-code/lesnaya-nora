/** Общий контракт контроллеров устройств для сброса и освобождения ввода. */
export interface InputController {
  reset(): void;
  dispose(): void;
}
