import type { Group } from 'three';

/** Удерживает одного собеседника на месте и плавно разворачивает его к игроку. */
export class ConversationFocus {
  private root?: Group;

  select(root?: Group): void {
    if (this.root === root) return;
    if (this.root) this.root.userData.conversing = false;
    this.root = root;
    if (root) root.userData.conversing = true;
  }

  update(dt: number, player: { x: number; z: number }): void {
    if (!this.root) return;
    const desired = Math.atan2(
      -(player.x - this.root.position.x),
      -(player.z - this.root.position.z),
    );
    const turn = Math.atan2(
      Math.sin(desired - this.root.rotation.y),
      Math.cos(desired - this.root.rotation.y),
    );
    this.root.rotation.y += Math.max(-dt * 4, Math.min(dt * 4, turn));
  }
}
