import type { Group } from 'three';
import { AnimalHighlight } from './AnimalHighlight';

/** Удерживает, выделяет и плавно разворачивает одного собеседника к игроку. */
export class ConversationFocus {
  private root?: Group;
  private highlight?: AnimalHighlight;

  select(root?: Group): void {
    if (this.root === root) return;
    if (this.root) this.root.userData.conversing = false;
    this.root = root;
    if (root) this.highlight ??= new AnimalHighlight();
    this.highlight?.select(root);
    if (root) root.userData.conversing = true;
  }

  dispose(): void {
    this.select();
    this.highlight?.dispose();
    this.highlight = undefined;
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
