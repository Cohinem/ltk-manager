import { Group } from "three";

/**
 * A group whose subtree skips the per-frame world matrix update while the group is hidden.
 *
 * A hidden subtree draws nothing, so its matrices go unread. The scene forces every world matrix
 * on each update, so the frame that shows the group again recomputes its subtree. Use it for a
 * group of many objects, such as a character's bones, that stays hidden for many frames.
 */
export class ShownGroup extends Group {
  override updateMatrixWorld(force?: boolean): void {
    if (!this.visible) return;
    super.updateMatrixWorld(force);
  }
}
