import { hiddenByState } from "../model/buttons";
import { disabledMeters } from "../model/meters";
import type { ViewTree } from "../model/tree";
import { isEffect } from "../model/visibility";
import type { PreviewState } from "./build";

/**
 * What the preview leaves undrawn beside the scenes: every button's other states, each meter the
 * file leaves off unless disabled things show, what the reader hid, and every effect while the
 * effects are off.
 */
export function hiddenOf(
  tree: ViewTree,
  preview: Pick<PreviewState, "buttonStates" | "showDisabled" | "hiddenElements" | "effects">,
): Set<string> {
  const hidden = hiddenByState(tree, preview.buttonStates);
  if (!preview.showDisabled) {
    for (const key of disabledMeters(tree)) hidden.add(key);
  }
  for (const key of preview.hiddenElements) hidden.add(key);
  if (!preview.effects) {
    for (const element of tree.view.elements) {
      if (isEffect(element)) hidden.add(element.key);
    }
  }
  return hidden;
}

/** Whether `key` or a group above it is hidden. */
export function isHidden(tree: ViewTree, hidden: ReadonlySet<string>, key: string): boolean {
  let at: string | undefined = key;
  const seen = new Set<string>();
  while (at !== undefined && !seen.has(at)) {
    if (hidden.has(at)) return true;
    seen.add(at);
    at = tree.groupOf.get(at);
  }
  return false;
}
