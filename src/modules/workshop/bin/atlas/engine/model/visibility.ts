import { labelOf } from "./layers";
import { momentOf } from "./moments";
import type { ViewTree } from "./tree";
import type { ViewElement } from "./view";

/**
 * The scenes a view rests with off, per "A preview that looks like the game" in
 * docs/plans/atlas-ui-editor.md.
 *
 * A view whose file switches any scene on leaves the rest to its controller's events, so those
 * start off. A view whose file switches none on has its controller switch every scene, so all of
 * them start shown. The controller's moment switches its own scenes over either.
 */
export function restingHiddenScenes(tree: ViewTree): ReadonlySet<string> {
  const scenes = [...tree.scenes.values()];
  const anyEnabled = scenes.some((scene) => scene.enabled);
  const moment = momentOf(tree.view.class);

  const hidden = new Set<string>();
  for (const scene of scenes) {
    const name = labelOf(scene.label, scene.path, scene.key);
    const off = moment.hide.includes(name) || (anyEnabled && !scene.enabled);
    if (off && !moment.show.includes(name)) hidden.add(scene.key);
  }
  return hidden;
}

/**
 * The scenes the preview draws with off: the resting ones, or none while every disabled thing is
 * shown, with each scene the reader `flipped` switched the other way.
 */
export function hiddenScenesOf(
  tree: ViewTree,
  flipped: ReadonlySet<string>,
  showDisabled: boolean,
): ReadonlySet<string> {
  const hidden = new Set(showDisabled ? [] : restingHiddenScenes(tree));
  for (const scene of flipped) {
    if (!hidden.delete(scene)) hidden.add(scene);
  }
  return hidden;
}

/** Whether an element is an effect or a particle system, which the effects switch hides. */
export function isEffect(element: ViewElement): boolean {
  return element.look.kind === "effect" || element.look.kind === "particle";
}

/**
 * Whether an element rests undrawn: an effect the file leaves off, which its controller plays on
 * an event such as a cast or a level up. A flipbook draws whatever its `Enabled` says, since it
 * loops in place and the file leaves most of them for the controller to switch on.
 */
export function restsHidden(element: ViewElement): boolean {
  const { look } = element;
  return look.kind === "effect" && look.effect.effect !== "animation" && !element.enabled;
}
