import type { Object3D } from 'three';

/** Временный запрет управления принадлежит самой модели; флаг не хранит ссылки на другие сессии. */
export class AnimalRestraint {
  static active(root: Object3D): boolean {
    return root.userData?.hawkHeld === true;
  }

  static hold(root: Object3D): void {
    root.userData.hawkHeld = true;
    root.userData.jumpHeight = 0;
    root.userData.jumpPitch = 0;
    root.userData.jumping = false;
    delete root.userData.action;
    delete root.userData.actionUntil;
  }

  static release(root: Object3D): void {
    delete root.userData.hawkHeld;
  }
}
