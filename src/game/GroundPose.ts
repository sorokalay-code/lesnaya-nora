import { Quaternion, Vector3, type Group, type Object3D } from 'three';

type HeightAt = (x: number, z: number) => number;
interface Contact {
  active: boolean;
  x: number;
  z: number;
  heightAt: HeightAt;
  halfWidth: number;
  halfLength: number;
}

const UP = new Vector3(0, 1, 0);
const RABBIT_FEET = { halfWidth: 0.16, halfLength: 0.41 };

/** Ставит лапы на опорную плоскость, наклоняя только модель внутри физического корня. */
export class GroundPose {
  private static readonly contacts = new WeakMap<Group, Contact>();
  private static readonly neutral = new WeakMap<Object3D, { pose: Quaternion; y: number }>();
  private static readonly normal = new Vector3();
  private static readonly tilt = new Quaternion();

  static contact(root: Group, x: number, z: number, heightAt: HeightAt, feet = RABBIT_FEET): void {
    const previous = this.contacts.get(root);
    if (previous) {
      previous.active = true;
      previous.x = x;
      previous.z = z;
      previous.heightAt = heightAt;
      previous.halfWidth = feet.halfWidth * root.scale.x;
      previous.halfLength = feet.halfLength * root.scale.x;
    } else {
      this.contacts.set(root, {
        active: true,
        x,
        z,
        heightAt,
        halfWidth: feet.halfWidth * root.scale.x,
        halfLength: feet.halfLength * root.scale.x,
      });
    }
  }

  static present(root: Group): void {
    const contact = this.contacts.get(root);
    const model = root.children[0];
    if (!model || (!contact?.active && !this.neutral.has(model))) return;

    let neutral = this.neutral.get(model);
    if (!neutral) {
      neutral = { pose: model.quaternion.clone(), y: model.position.y };
      this.neutral.set(model, neutral);
    }
    model.quaternion.copy(neutral.pose);
    model.position.y = neutral.y;
    if (!contact?.active) return;

    // Сведения об опоре действуют только до ближайшей анимации, в нору и в воздух не переносятся.
    contact.active = false;
    if (root.userData.jumping || root.userData.swimming) return;

    const { x, z, heightAt, halfWidth, halfLength } = contact;
    const yaw = root.rotation.y;
    const sideX = Math.cos(yaw) * halfWidth;
    const sideZ = -Math.sin(yaw) * halfWidth;
    const backX = Math.sin(yaw) * halfLength;
    const backZ = Math.cos(yaw) * halfLength;
    const backRight = heightAt(x + backX + sideX, z + backZ + sideZ);
    const backLeft = heightAt(x + backX - sideX, z + backZ - sideZ);
    const frontRight = heightAt(x - backX + sideX, z - backZ + sideZ);
    const frontLeft = heightAt(x - backX - sideX, z - backZ - sideZ);
    const side = (backRight + frontRight - backLeft - frontLeft) / (4 * halfWidth);
    const back = (backRight + backLeft - frontRight - frontLeft) / (4 * halfLength);
    this.normal.set(-side, 1, -back).normalize();
    this.tilt.setFromUnitVectors(UP, this.normal);
    model.quaternion.premultiply(this.tilt);

    // На гребне и в ложбине четыре лапы могут быть не в одной плоскости.
    const center = heightAt(x, z);
    const average = (backRight + backLeft + frontRight + frontLeft) / 4;
    const twist = Math.abs(backRight + frontLeft - backLeft - frontRight) / 4;
    model.position.y += Math.max(0, Math.min(average - center + twist, halfWidth)) / root.scale.y;
  }
}
