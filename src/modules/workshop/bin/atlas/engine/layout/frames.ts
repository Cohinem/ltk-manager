import type { ViewTree } from "../model/tree";

/**
 * The frame the reader drew each scene on, by the scene heading that frame. A scene not listed
 * draws on its parent's frame, and a root heads its own. A scene listed as itself heads its own.
 */
export type FrameChoices = Readonly<Record<string, string>>;

export const NO_FRAME_CHOICES: FrameChoices = {};

/** The scene heading the frame each scene draws on, by the scene's key. */
export function frameHeads(tree: ViewTree, choices: FrameChoices): Map<string, string> {
  const heads = new Map<string, string>();
  const headOf = (scene: string, seen: Set<string>): string => {
    const known = heads.get(scene);
    if (known !== undefined) return known;
    if (seen.has(scene)) return scene;

    seen.add(scene);
    const chosen = choices[scene];
    const parent = tree.scenes.get(scene)?.parent ?? null;
    let head = scene;
    if (chosen !== undefined && chosen !== scene && tree.scenes.has(chosen)) {
      head = headOf(chosen, seen);
    } else if (chosen === undefined && parent !== null && tree.scenes.has(parent)) {
      head = headOf(parent, seen);
    }
    heads.set(scene, head);
    return head;
  };

  for (const scene of tree.scenes.keys()) headOf(scene, new Set());
  return heads;
}

/**
 * `choices` with `scene` drawn on the frame `head` heads, which is `scene` itself for a frame of
 * its own. A choice the scene would make anyway is left out.
 */
export function drawOn(
  tree: ViewTree,
  choices: FrameChoices,
  scene: string,
  head: string,
): FrameChoices {
  const { [scene]: _, ...others } = choices;
  const natural = frameHeads(tree, others).get(scene);
  return natural === head ? others : { ...others, [scene]: head };
}

/** `choices` with every scene on the frame `head` heads drawn on a frame of its own. */
export function splitFrame(
  tree: ViewTree,
  choices: FrameChoices,
  head: string,
  scenes: readonly string[],
): FrameChoices {
  let next = choices;
  for (const scene of scenes) {
    if (scene !== head) next = drawOn(tree, next, scene, scene);
  }
  return next;
}
