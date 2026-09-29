import type { PropertyEdit } from "@/lib/tauri";

import { subtreeOf, type ViewTree } from "../model/tree";
import { layerEdit, sceneEdit, ungroupEdit } from "./elementEdits";

/** What moving a selection writes, and what it carries along on the screen. */
export interface MoveSet {
  /** The elements whose rect the move writes. */
  readonly written: readonly string[];
  /** Every element that moves on the screen: the written ones and what they carry. */
  readonly moving: ReadonlySet<string>;
}

/**
 * The move of `selection`, per "Interaction" in docs/plans/atlas-ui-editor.md.
 *
 * A group moves with everything under it, since the client places an element on its own and a
 * group's rect only follows its children. An element a hierarchy anchor places inside another
 * moving element follows it and is not written. An element a managed layout places is placed
 * again by the layout, so it moves only with its layout.
 */
export function moveSet(tree: ViewTree, selection: readonly string[]): MoveSet {
  const moving = new Set<string>();
  for (const key of selection) {
    if (!tree.elements.has(key)) continue;

    const layout = tree.groupOf.get(key);
    if (placedByLayout(tree, key) && (layout === undefined || !selection.includes(layout))) {
      continue;
    }
    for (const each of subtreeOf(tree, key)) moving.add(each);
  }

  const written = [...moving].filter(
    (key) => positioned(tree, key) && !placedByLayout(tree, key) && !follows(tree, key, moving),
  );
  return { written, moving };
}

/** Whether `key` draws from a rect a drag can resize. */
export function resizable(tree: ViewTree, key: string): boolean {
  return positioned(tree, key) && !placedByLayout(tree, key);
}

/** Why a selection draws no resize handles, and null where it draws them. */
export type ResizeBlock = "many" | "group" | "fullScreen" | "layout";

export function resizeBlock(tree: ViewTree, selection: readonly string[]): ResizeBlock | null {
  const [key] = selection;
  if (selection.length > 1) return "many";
  if (key === undefined) return null;

  const kind = tree.elements.get(key)?.position?.kind;
  if (kind === undefined) return "group";
  if (kind === "fullScreen") return "fullScreen";
  return placedByLayout(tree, key) ? "layout" : null;
}

/** Whether a managed layout places `key`, which is a child of it other than its region. */
export function placedByLayout(tree: ViewTree, key: string): boolean {
  const group = tree.groupOf.get(key);
  const look = group === undefined ? undefined : tree.elements.get(group)?.look;
  return look?.kind === "group" && look.layout !== null && look.layout.region !== key;
}

/** Where a layer change moves an element among the siblings it draws between. */
export type LayerStep = "forward" | "backward" | "front" | "back";

/**
 * The `Layer` edits that move `key` one place or all the way up or down its siblings' draw order,
 * which is by layer and then by place in the file. A step past a sibling on another layer swaps
 * the two layers. One past a sibling on the same layer takes the layer above or below it.
 */
export function layerEdits(tree: ViewTree, key: string, step: LayerStep): PropertyEdit[] {
  const order = siblingsOf(tree, key);
  const at = order.indexOf(key);
  if (at < 0) return [];

  const layer = (sibling: string) => tree.elements.get(sibling)?.layer ?? 0;
  const own = layer(key);
  const last = order.length - 1;

  switch (step) {
    case "forward": {
      const above = order[at + 1];
      if (above === undefined) return [];
      if (own < layer(above)) return [layerEdit(key, layer(above)), layerEdit(above, own)];
      return [layerEdit(key, layer(above) + 1)];
    }
    case "backward": {
      const below = order[at - 1];
      if (below === undefined) return [];
      if (own > layer(below)) return [layerEdit(key, layer(below)), layerEdit(below, own)];
      if (layer(below) > 0) return [layerEdit(key, layer(below) - 1)];
      return [layerEdit(below, layer(below) + 1)];
    }
    case "front": {
      const top = order[last];
      if (top === undefined || at === last) return [];
      return [layerEdit(key, layer(top) + 1)];
    }
    case "back": {
      const bottom = order[0];
      if (bottom === undefined || at === 0) return [];
      if (layer(bottom) > 0) return [layerEdit(key, layer(bottom) - 1)];
      return [
        layerEdit(key, 0),
        ...order.filter((each) => each !== key).map((each) => layerEdit(each, layer(each) + 1)),
      ];
    }
  }
}

/**
 * The edits that move `key` into the scene `scene`: its `Scene`, and its removal from the group
 * that lists it, since a group's children draw in the group's scene.
 */
export function sceneMoveEdits(tree: ViewTree, key: string, scene: string): PropertyEdit[] {
  const edits = [sceneEdit(key, scene)];
  const group = tree.groupOf.get(key);
  const look = group === undefined ? undefined : tree.elements.get(group)?.look;
  if (group !== undefined && look?.kind === "group") {
    const index = look.children.indexOf(key);
    if (index >= 0) edits.push(ungroupEdit(group, index));
  }
  return edits;
}

/** The elements `key` draws between, bottom first: its group's children, or its scene's. */
export function siblingsOf(tree: ViewTree, key: string): string[] {
  const group = tree.groupOf.get(key);
  const look = group === undefined ? undefined : tree.elements.get(group)?.look;
  const scene = tree.elements.get(key)?.scene ?? null;
  let keys: readonly string[] = [];
  if (look?.kind === "group") {
    keys = look.children.filter((child) => tree.groupOf.get(child) === group);
  } else if (scene !== null) {
    keys = tree.sceneElements.get(scene) ?? [];
  }

  return [...keys].sort(
    (a, b) =>
      (tree.elements.get(a)?.layer ?? 0) - (tree.elements.get(b)?.layer ?? 0) ||
      (tree.fileOrder.get(a) ?? 0) - (tree.fileOrder.get(b) ?? 0),
  );
}

function positioned(tree: ViewTree, key: string): boolean {
  const kind = tree.elements.get(key)?.position?.kind;
  return kind === "rect" || kind === "polygon";
}

/** Whether a hierarchy anchor places `key` inside an element of `moving`, which carries it. */
function follows(tree: ViewTree, key: string, moving: ReadonlySet<string>): boolean {
  const position = tree.elements.get(key)?.position;
  if (position?.kind !== "rect" && position?.kind !== "polygon") return false;
  if (position.rect.anchor.kind !== "hierarchy") return false;

  const seen = new Set<string>([key]);
  let at = tree.groupOf.get(key);
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    if ((tree.elements.get(at)?.position ?? null) !== null) return moving.has(at);
    at = tree.groupOf.get(at);
  }
  return false;
}
