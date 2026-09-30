import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { moveEdits, nudgeEdits, resizeEdits } from "../engine/edit/arrange";
import { snapRect, type SnapGuide } from "../engine/edit/snap";
import { type MoveSet, moveSet, resizable } from "../engine/edit/targets";
import { type Board, frameRect } from "../engine/layout/board";
import type { LayoutSettings, PixelRect } from "../engine/layout/solve";
import { buttonsFirst } from "../engine/model/buttons";
import type { ViewTree } from "../engine/model/tree";
import type { AtlasEdit } from "../state/atlasEdit";
import { useAtlasPreviewActions } from "../state/atlasPreview";
import {
  clickedIn,
  cursorOf,
  elementsAt,
  grabbedIn,
  repeatsClick,
  type Handle,
  HANDLES,
  handlePoint,
  linesOf,
  rectsOf,
  resized,
  shift,
  snapTargetsOf,
  spanning,
  unionOf,
  within,
} from "./canvasGeometry";
import type { ViewTransformControl } from "./useViewTransform";

/** A pointer that moved this far in pane pixels since it went down is a drag rather than a click. */
const DRAG_SLOP = 3;
/** How near in pane pixels a pointer has to be to a handle, or a line to a snap target. */
const HANDLE_REACH = 6;
const SNAP_REACH = 6;
/** How long what a drag wrote stays drawn over a view read that answered nothing new. */
const SETTLE_MS = 2000;
const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;

type Point = readonly [number, number];

type Gesture =
  | {
      readonly kind: "press";
      readonly client: Point;
      readonly at: Point;
      /** The element a drag moves: a selected one under the pointer, else the topmost. */
      readonly element: string | null;
      /** Every element under the pointer, topmost first. */
      readonly under: readonly string[];
      readonly additive: boolean;
    }
  | { readonly kind: "pan"; client: Point }
  | {
      readonly kind: "move";
      readonly at: Point;
      readonly set: MoveSet;
      readonly selection: readonly string[];
      readonly base: PixelRect;
      readonly targets: readonly PixelRect[];
    }
  | {
      readonly kind: "resize";
      readonly at: Point;
      readonly key: string;
      readonly handle: Handle;
      readonly rect: PixelRect;
      readonly targets: readonly PixelRect[];
    }
  | { readonly kind: "marquee"; readonly at: Point; readonly additive: boolean };

/** What a drag in flight draws. */
type Drag =
  | { readonly kind: "move"; readonly delta: Point; readonly moving: ReadonlySet<string> }
  | { readonly kind: "resize"; readonly key: string; readonly rect: PixelRect }
  | { readonly kind: "marquee"; readonly rect: PixelRect };

export interface CanvasEditInputs {
  readonly tree: ViewTree | null;
  /** Each element's rect on the board. */
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  /** The frames the scenes are drawn in, which a drag snaps to the screen of. */
  readonly board: Board | null;
  readonly settings: LayoutSettings;
  /** The drawn elements, bottom first, which a pick walks from the top. */
  readonly order: readonly string[];
  readonly view: string;
  readonly selection: readonly string[];
  readonly primary: string | null;
  readonly transform: ViewTransformControl;
  readonly edit: AtlasEdit | null;
  readonly safeZone: boolean;
}

export interface CanvasEdit {
  /** Every element's rect with the drag in flight, or the edit it wrote, applied. */
  readonly shown: ReadonlyMap<string, PixelRect> | null;
  readonly marquee: PixelRect | null;
  readonly guides: readonly SnapGuide[];
  /** Whether the primary selection draws the handles a resize drags. */
  readonly handles: boolean;
  readonly cursor: string;
  /** The topmost element under a point of the pane. */
  readonly pick: (x: number, y: number) => string | null;
  /** Every element under a point of the pane, topmost first. */
  readonly pickAll: (x: number, y: number) => readonly string[];
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Hold Space down, which turns a drag into a pan. */
  readonly holdSpace: (held: boolean) => void;
  /** Move the selection by `dx, dy` of each element's source pixels. */
  readonly nudge: (dx: number, dy: number) => void;
}

/**
 * The canvas's edit gestures, per "Interaction" in docs/plans/atlas-ui-editor.md.
 *
 * A click picks the topmost element, and a click again on the same spot picks the one under it,
 * so a stack is reached by clicking through it. A modified click adds the topmost to the selection
 * or takes it out. A drag on an element, or inside a selected group, moves the selection, a drag on
 * a handle of the primary selection resizes it, and a drag over nothing draws a marquee. A middle
 * drag, or any drag while Space is held, pans, and so does an element drag where the scene bin
 * takes no edits. A move and a resize snap to the siblings, the parent and the screen unless Alt is
 * held, and to whole source pixels. What a drag wrote stays drawn until the view is read again.
 */
export function useCanvasEdit({
  tree,
  solved,
  board,
  settings,
  order,
  view,
  selection,
  primary,
  transform,
  edit,
  safeZone,
}: CanvasEditInputs): CanvasEdit {
  const { select, setSelection, toggleSelected } = useAtlasPreviewActions();
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<readonly SnapGuide[]>([]);
  const [cursor, setCursor] = useState("default");
  const [settling, setSettling] = useState<{
    readonly drag: Drag;
    readonly tree: ViewTree | null;
  } | null>(null);

  useEffect(() => {
    if (settling !== null && settling.tree !== tree) setSettling(null);
  }, [settling, tree]);

  const shown = useMemo(() => {
    if (solved === null) return null;

    const settled = settling?.tree === tree ? withDrag(solved, settling.drag) : solved;
    return drag === null ? settled : withDrag(settled, drag);
  }, [solved, drag, settling, tree]);

  const editable = edit?.editable === true;
  const handles =
    editable &&
    tree !== null &&
    primary !== null &&
    selection.length === 1 &&
    resizable(tree, primary);

  const pickAll = useCallback(
    (x: number, y: number): readonly string[] => {
      if (shown === null) return [];

      const [sx, sy] = transform.toScreen(x, y);
      const under = elementsAt(order, shown, sx, sy);
      return tree === null ? under : buttonsFirst(tree, under);
    },
    [shown, order, transform, tree],
  );
  const pick = useCallback((x: number, y: number) => pickAll(x, y)[0] ?? null, [pickAll]);
  const lastClick = useRef<{ readonly client: Point; readonly element: string | null } | null>(
    null,
  );

  const handleAt = (x: number, y: number): Handle | null => {
    const rect = handles && primary !== null ? shown?.get(primary) : undefined;
    if (rect === undefined) return null;

    const { view: pane } = transform;
    for (const handle of HANDLES) {
      const [hx, hy] = handlePoint(rect, handle);
      const px = pane.x + hx * pane.zoom;
      const py = pane.y + hy * pane.zoom;
      if (Math.abs(px - x) <= HANDLE_REACH && Math.abs(py - y) <= HANDLE_REACH) return handle;
    }
    return null;
  };

  const snapTargets = (keys: readonly string[], moving: ReadonlySet<string>): PixelRect[] => {
    if (tree === null || shown === null) return [];

    const { width, height } = settings.screen;
    const at = board?.frameOf.get(keys[0] ?? "") ?? -1;
    const frame = (board === null ? null : frameRect(board, at, settings.screen)) ?? {
      x: 0,
      y: 0,
      w: width,
      h: height,
    };
    return snapTargetsOf(tree, shown, keys, moving, frame, safeZone);
  };

  const startDrag = (held: Extract<Gesture, { kind: "press" }>): Gesture | null => {
    if (held.element === null) return { kind: "marquee", at: held.at, additive: held.additive };
    if (!editable || tree === null || shown === null) return { kind: "pan", client: held.client };

    const chosen = selection.includes(held.element) ? selection : [held.element];
    if (chosen !== selection) select(view, held.element);

    const set = moveSet(tree, chosen);
    const base = unionOf(chosen.flatMap((key) => rectsOf(shown, [key])));
    if (set.written.length === 0 || base === null) return null;

    return {
      kind: "move",
      at: held.at,
      set,
      selection: chosen,
      base,
      targets: snapTargets(chosen, set.moving),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    if (event.button !== PRIMARY_BUTTON && event.button !== MIDDLE_BUTTON) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = pointIn(event);
    const client: Point = [event.clientX, event.clientY];
    if (event.button === MIDDLE_BUTTON || space.current) {
      gesture.current = { kind: "pan", client };
      setCursor("grabbing");
      return;
    }

    const at = transform.toScreen(x, y);
    const handle = handleAt(x, y);
    const rect = primary === null ? undefined : shown?.get(primary);
    if (handle !== null && primary !== null && rect !== undefined) {
      gesture.current = {
        kind: "resize",
        at,
        key: primary,
        handle,
        rect,
        targets: snapTargets([primary], new Set([primary])),
      };
      return;
    }

    const under = pickAll(x, y);
    gesture.current = {
      kind: "press",
      client,
      at,
      element: shown === null ? null : grabbedIn(under, selection, shown, at[0], at[1]),
      under,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const [x, y] = pointIn(event);
    let held = gesture.current;
    if (held === null) {
      setCursor(cursorOf(handleAt(x, y)));
      return;
    }

    if (held.kind === "press") {
      const moved = Math.hypot(event.clientX - held.client[0], event.clientY - held.client[1]);
      if (moved <= DRAG_SLOP) return;

      held = startDrag(held);
      gesture.current = held;
      if (held === null) return;
    }

    const at = transform.toScreen(x, y);
    const snapping = !event.altKey;
    const reach = SNAP_REACH / transform.view.zoom;
    switch (held.kind) {
      case "pan":
        transform.panBy(event.clientX - held.client[0], event.clientY - held.client[1]);
        held.client = [event.clientX, event.clientY];
        return;
      case "move": {
        const raw: Point = [at[0] - held.at[0], at[1] - held.at[1]];
        const snapped = snapping
          ? snapRect(shift(held.base, raw), held.targets, reach)
          : { offset: [0, 0] as const, guides: [] };
        const delta: Point = [raw[0] + snapped.offset[0], raw[1] + snapped.offset[1]];
        setDrag({ kind: "move", delta, moving: held.set.moving });
        setGuides(snapped.guides);
        return;
      }
      case "resize": {
        const rect = resized(held.rect, held.handle, [at[0] - held.at[0], at[1] - held.at[1]]);
        const snapped = snapping
          ? snapRect(rect, held.targets, reach, linesOf(held.handle))
          : { offset: [0, 0] as const, guides: [] };
        setDrag({
          kind: "resize",
          key: held.key,
          rect: resized(held.rect, held.handle, [
            at[0] - held.at[0] + snapped.offset[0],
            at[1] - held.at[1] + snapped.offset[1],
          ]),
        });
        setGuides(snapped.guides);
        return;
      }
      case "marquee":
        setDrag({ kind: "marquee", rect: spanning(held.at, at) });
        return;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const held = gesture.current;
    const drawn = drag;
    gesture.current = null;
    setDrag(null);
    setGuides([]);
    setCursor("default");
    if (held === null) return;

    const snapping = !event.altKey;
    switch (held.kind) {
      case "press": {
        if (event.button !== PRIMARY_BUTTON) return;

        const topmost = held.under[0] ?? null;
        if (held.additive) {
          if (topmost !== null) toggleSelected(view, topmost);
          return;
        }

        const repeat = repeatsClick(lastClick.current, held.client, primary, DRAG_SLOP);
        const picked = clickedIn(held.under, primary, repeat);
        lastClick.current = { client: held.client, element: picked };
        select(view, picked);
        return;
      }
      case "pan":
        return;
      case "move":
        if (drawn?.kind !== "move" || tree === null) return;
        land(drawn, moveEdits(tree, settings, held.selection, drawn.delta, snapping));
        return;
      case "resize": {
        if (drawn?.kind !== "resize" || tree === null) return;
        const delta = {
          x0: drawn.rect.x - held.rect.x,
          y0: drawn.rect.y - held.rect.y,
          x1: drawn.rect.x + drawn.rect.w - (held.rect.x + held.rect.w),
          y1: drawn.rect.y + drawn.rect.h - (held.rect.y + held.rect.h),
        };
        land(drawn, resizeEdits(tree, settings, held.key, delta, snapping));
        return;
      }
      case "marquee": {
        if (drawn?.kind !== "marquee" || shown === null) return;
        const inside = order.filter((key) => {
          const rect = shown.get(key);
          return rect !== undefined && rect.w > 0 && rect.h > 0 && within(rect, drawn.rect);
        });
        setSelection(view, held.additive ? [...new Set([...selection, ...inside])] : inside);
        return;
      }
    }
  };

  const land = (drawn: Drag, edits: Parameters<AtlasEdit["apply"]>[0]) => {
    if (edit === null || edits.length === 0) return;

    const held = { drag: drawn, tree };
    setSettling(held);
    void edit.apply(edits).then((landed) => {
      const clear = () => setSettling((current) => (current === held ? null : current));
      if (!landed) clear();
      else window.setTimeout(clear, SETTLE_MS);
    });
  };

  const nudge = (dx: number, dy: number) => {
    if (!editable || edit === null || tree === null || selection.length === 0) return;
    void edit.apply(nudgeEdits(tree, settings, selection, [dx, dy]));
  };

  const holdSpace = (held: boolean) => {
    space.current = held;
    if (gesture.current === null) setCursor(held ? "grab" : "default");
  };

  return {
    shown,
    marquee: drag?.kind === "marquee" ? drag.rect : null,
    guides,
    handles,
    cursor,
    pick,
    pickAll,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    holdSpace,
    nudge,
  };
}

function withDrag(
  solved: ReadonlyMap<string, PixelRect>,
  drag: Drag,
): ReadonlyMap<string, PixelRect> {
  if (drag.kind === "marquee") return solved;

  const shown = new Map(solved);
  if (drag.kind === "resize") {
    shown.set(drag.key, drag.rect);
    return shown;
  }
  for (const key of drag.moving) {
    const rect = solved.get(key);
    if (rect !== undefined) shown.set(key, shift(rect, drag.delta));
  }
  return shown;
}

function pointIn(event: ReactPointerEvent<HTMLElement>): Point {
  const box = event.currentTarget.getBoundingClientRect();
  return [event.clientX - box.left, event.clientY - box.top];
}
