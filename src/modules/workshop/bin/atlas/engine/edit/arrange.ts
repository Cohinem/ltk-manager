import type { PropertyEdit } from "@/lib/tauri";

import { HIERARCHY_STRETCH, type LayoutSettings, type PixelRect, solveRect } from "../layout/solve";
import type { ViewTree } from "../model/tree";
import type { ViewAnchor, ViewRect } from "../model/view";
import { type AnchorChoice, anchorEdit, rectEdit } from "./elementEdits";
import { type EdgeDelta, moveDelta, rectFields, retarget, screenRates } from "./rectEdit";
import { moveSet } from "./targets";

/** A side or centre line the selection lines up on. */
export type Alignment = "left" | "centre" | "right" | "top" | "middle" | "bottom";

/** The edits that move `selection` by `dx, dy` screen pixels, one per element the move writes. */
export function moveEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  selection: readonly string[],
  [dx, dy]: readonly [number, number],
  snap: boolean,
): PropertyEdit[] {
  return edgeEdits(tree, settings, moveSet(tree, selection).written, moveDelta(dx, dy), snap);
}

/** The edit that moves the edges of `key` by `delta` screen pixels. */
export function resizeEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  key: string,
  delta: EdgeDelta,
  snap: boolean,
): PropertyEdit[] {
  return edgeEdits(tree, settings, [key], delta, snap);
}

/** The edits that move `selection` by `dx, dy` of each element's own source pixels. */
export function nudgeEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  selection: readonly string[],
  [dx, dy]: readonly [number, number],
): PropertyEdit[] {
  const edits: PropertyEdit[] = [];
  for (const key of moveSet(tree, selection).written) {
    const rect = rectOf(tree, key);
    if (rect === null) continue;

    const { perSource } = screenRates(rect, settings);
    const fields = retarget(rect, settings, moveDelta(dx * perSource[0], dy * perSource[1]), true);
    const edit = rectEdit(key, rectFields(rect), fields);
    if (edit !== null) edits.push(edit);
  }
  return edits;
}

/** The edits that line every element of `selection` up on the side `how` of their union. */
export function alignEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  solved: ReadonlyMap<string, PixelRect>,
  selection: readonly string[],
  how: Alignment,
): PropertyEdit[] {
  const rects = selection.flatMap((key) => {
    const rect = solved.get(key);
    return rect === undefined ? [] : [{ key, rect }];
  });
  if (rects.length < 2) return [];

  const x0 = Math.min(...rects.map(({ rect }) => rect.x));
  const y0 = Math.min(...rects.map(({ rect }) => rect.y));
  const x1 = Math.max(...rects.map(({ rect }) => rect.x + rect.w));
  const y1 = Math.max(...rects.map(({ rect }) => rect.y + rect.h));

  const offsets = rects.map(({ key, rect }) => {
    switch (how) {
      case "left":
        return { key, by: [x0 - rect.x, 0] as const };
      case "centre":
        return { key, by: [(x0 + x1) / 2 - (rect.x + rect.w / 2), 0] as const };
      case "right":
        return { key, by: [x1 - (rect.x + rect.w), 0] as const };
      case "top":
        return { key, by: [0, y0 - rect.y] as const };
      case "middle":
        return { key, by: [0, (y0 + y1) / 2 - (rect.y + rect.h / 2)] as const };
      case "bottom":
        return { key, by: [0, y1 - (rect.y + rect.h)] as const };
    }
  });
  return offsetEdits(tree, settings, offsets);
}

/** The edits that space `selection` evenly between its outermost two on `axis`. */
export function distributeEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  solved: ReadonlyMap<string, PixelRect>,
  selection: readonly string[],
  axis: 0 | 1,
): PropertyEdit[] {
  const start = (rect: PixelRect) => (axis === 0 ? rect.x : rect.y);
  const length = (rect: PixelRect) => (axis === 0 ? rect.w : rect.h);
  const rects = selection
    .flatMap((key) => {
      const rect = solved.get(key);
      return rect === undefined ? [] : [{ key, rect }];
    })
    .sort((a, b) => start(a.rect) - start(b.rect));
  const first = rects[0];
  const last = rects.at(-1);
  if (rects.length < 3 || first === undefined || last === undefined) return [];

  const span = start(last.rect) + length(last.rect) - start(first.rect);
  const filled = rects.reduce((sum, { rect }) => sum + length(rect), 0);
  const gap = (span - filled) / (rects.length - 1);

  let at = start(first.rect);
  const offsets = rects.map(({ key, rect }) => {
    const by = at - start(rect);
    at += length(rect) + gap;
    return { key, by: axis === 0 ? ([by, 0] as const) : ([0, by] as const) };
  });
  return offsetEdits(tree, settings, offsets);
}

/**
 * The edit that anchors `key` to `choice` and keeps it where it is on the screen: its size is
 * what its drawn size is under the new anchor, and its position what lands it on the same spot.
 * `parent` is the rect a hierarchy anchor places it in.
 */
export function reanchorEdit(
  tree: ViewTree,
  settings: LayoutSettings,
  key: string,
  choice: AnchorChoice,
  parent: PixelRect,
): PropertyEdit | null {
  const rect = rectOf(tree, key);
  if (rect === null) return null;

  const before = solveRect(rect, parent, settings);
  const anchor: ViewAnchor =
    choice.kind === "single"
      ? { kind: "single", anchor: choice.anchor }
      : {
          kind: "hierarchy",
          align: choice.align,
          pivot: choice.pivot,
          margins:
            rect.anchor.kind === "hierarchy"
              ? rect.anchor.margins
              : [
                  [0, 0],
                  [0, 0],
                ],
        };
  const anchored: ViewRect = { ...rect, anchor };
  const { perSource } = screenRates(anchored, settings);
  const sized: ViewRect = {
    ...anchored,
    size: [Math.round(before.w / perSource[0]), Math.round(before.h / perSource[1])],
  };
  const after = solveRect(sized, parent, settings);
  const fields = retarget(sized, settings, moveDelta(before.x - after.x, before.y - after.y), true);
  const written: AnchorChoice =
    choice.kind === "hierarchy"
      ? { ...choice, margins: stretchMargins(choice, before, parent, screenRates(sized, settings)) }
      : choice;
  return anchorEdit(key, written, fields.position, fields.size);
}

/**
 * The margins that keep `drawn` where it is on each axis `choice` stretches across `parent`, and
 * null where it stretches neither.
 */
function stretchMargins(
  choice: Extract<AnchorChoice, { kind: "hierarchy" }>,
  drawn: PixelRect,
  parent: PixelRect,
  { perMargin }: { readonly perMargin: number },
): readonly [readonly [number, number], readonly [number, number]] | null {
  if (choice.align[0] !== HIERARCHY_STRETCH && choice.align[1] !== HIERARCHY_STRETCH) return null;

  const margin = (start: number, length: number, from: number, span: number) =>
    [
      Math.round((start - from) / perMargin),
      Math.round((from + span - (start + length)) / perMargin),
    ] as const;
  return [
    margin(drawn.x, drawn.w, parent.x, parent.w),
    margin(drawn.y, drawn.h, parent.y, parent.h),
  ];
}

function offsetEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  offsets: readonly { key: string; by: readonly [number, number] }[],
): PropertyEdit[] {
  const written = new Set<string>();
  const edits: PropertyEdit[] = [];
  for (const { key, by } of offsets) {
    if (by[0] === 0 && by[1] === 0) continue;

    const keys = moveSet(tree, [key]).written.filter((each) => !written.has(each));
    for (const each of keys) written.add(each);
    edits.push(...edgeEdits(tree, settings, keys, moveDelta(by[0], by[1]), true));
  }
  return edits;
}

function edgeEdits(
  tree: ViewTree,
  settings: LayoutSettings,
  keys: readonly string[],
  delta: EdgeDelta,
  snap: boolean,
): PropertyEdit[] {
  const edits: PropertyEdit[] = [];
  for (const key of keys) {
    const rect = rectOf(tree, key);
    if (rect === null) continue;

    const edit = rectEdit(key, rectFields(rect), retarget(rect, settings, delta, snap));
    if (edit !== null) edits.push(edit);
  }
  return edits;
}

function rectOf(tree: ViewTree, key: string): ViewRect | null {
  const position = tree.elements.get(key)?.position;
  if (position?.kind !== "rect" && position?.kind !== "polygon") return null;
  return position.rect;
}
