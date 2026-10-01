import { labelOf } from "../model/layers";
import { placedKeys, sceneAncestry, sceneOf, type ViewTree } from "../model/tree";
import { type FrameChoices, frameHeads } from "./frames";
import type { PixelRect, Screen } from "./solve";

/** One frame of the board: a screen of its own, drawing some of the scenes or all of them. */
export interface BoardFrame {
  /** The scene heading the frame, null for the one frame that stacks every scene. */
  readonly scene: string | null;
  /** The shown scenes the frame draws elements of, in the scene tree's order. */
  readonly scenes: readonly string[];
  readonly label: string;
  /** The frame's top-left corner on the board, in screen pixels. */
  readonly origin: readonly [number, number];
  /** The elements the frame draws. */
  readonly elements: ReadonlySet<string>;
}

/**
 * A view's scenes laid out side by side, each on its own screen, or stacked on one screen as the
 * client draws them. Board coordinates are screen pixels with each frame's origin added.
 */
export interface Board {
  readonly frames: readonly BoardFrame[];
  /** The extent of every frame, which a fit takes in. */
  readonly size: Screen;
  /** The frame each drawn element is in, by its index in `frames`. */
  readonly frameOf: ReadonlyMap<string, number>;
}

/** The gap between two frames, as a share of the screen's width. */
const GAP_SHARE = 0.08;
/** How many more columns than rows the board takes, so frames run side by side. */
const COLUMN_BIAS = 1.5;

/**
 * The board of `tree` on `screen`: a frame for each head of `frameHeads` whose scenes hold a shown
 * element, in the scene tree's order and wrapped into rows, or a single frame where `stacked` or
 * where no scene holds one.
 */
export function boardOf(
  tree: ViewTree,
  screen: Screen,
  hiddenScenes: ReadonlySet<string>,
  stacked: boolean,
  choices: FrameChoices,
): Board {
  const held = new Map<string, Set<string>>();
  for (const key of placedKeys(tree)) {
    const scene = sceneOf(tree, key);
    if (scene === null) continue;

    const elements = held.get(scene) ?? new Set<string>();
    elements.add(key);
    held.set(scene, elements);
  }

  const order = sceneOrder(tree);
  const heads = frameHeads(tree, choices);
  const grouped = new Map<string, string[]>();
  for (const scene of stacked ? [] : order) {
    const hidden = sceneAncestry(tree, scene).some((each) => hiddenScenes.has(each));
    if (!held.has(scene) || hidden) continue;

    const head = heads.get(scene) ?? scene;
    grouped.set(head, [...(grouped.get(head) ?? []), scene]);
  }
  const shown = [...grouped.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (shown.length === 0) return stackedBoard(tree, screen);

  const gap = Math.round(screen.width * GAP_SHARE);
  const columns = Math.min(shown.length, Math.ceil(Math.sqrt(shown.length) * COLUMN_BIAS));
  const rows = Math.ceil(shown.length / columns);
  const frameOf = new Map<string, number>();
  const frames = shown.map((scene, at): BoardFrame => {
    const scenes = grouped.get(scene) ?? [];
    const elements = new Set(scenes.flatMap((each) => [...(held.get(each) ?? [])]));
    for (const key of elements) frameOf.set(key, at);

    const found = tree.scenes.get(scene);
    return {
      scene,
      scenes,
      label: found === undefined ? scene : labelOf(found.label, found.path, scene),
      origin: [
        (at % columns) * (screen.width + gap),
        Math.floor(at / columns) * (screen.height + gap),
      ],
      elements,
    };
  });

  return {
    frames,
    size: {
      width: columns * screen.width + (columns - 1) * gap,
      height: rows * screen.height + (rows - 1) * gap,
    },
    frameOf,
  };
}

/** Every element on one screen, as the client draws the view. */
function stackedBoard(tree: ViewTree, screen: Screen): Board {
  const elements = new Set(placedKeys(tree));
  return {
    frames: [{ scene: null, scenes: [...tree.scenes.keys()], label: "", origin: [0, 0], elements }],
    size: screen,
    frameOf: new Map([...elements].map((key) => [key, 0])),
  };
}

/** Every scene, each before the scenes under it, siblings in file order. */
function sceneOrder(tree: ViewTree): string[] {
  const order: string[] = [];
  const visit = (parent: string | null) => {
    for (const scene of tree.sceneChildren.get(parent) ?? []) {
      if (order.includes(scene)) continue;

      order.push(scene);
      visit(scene);
    }
  };
  visit(null);
  return order;
}

/** Whether the board draws more than the one screen at the origin. */
export function spreads(board: Board): boolean {
  return board.frames.length > 1 || board.frames[0]?.origin.some((edge) => edge !== 0) === true;
}

/** `rect` moved by `[dx, dy]`. */
export function moved(rect: PixelRect, [dx, dy]: readonly [number, number]): PixelRect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

/** `rects` moved onto the board, each by the origin of its element's frame. */
export function onBoard(
  board: Board,
  rects: ReadonlyMap<string, PixelRect>,
): ReadonlyMap<string, PixelRect> {
  if (!spreads(board)) return rects;

  const placed = new Map<string, PixelRect>();
  for (const [key, rect] of rects) {
    const origin = board.frames[board.frameOf.get(key) ?? -1]?.origin;
    placed.set(key, origin === undefined ? rect : moved(rect, origin));
  }
  return placed;
}

/** The frame at `index` as a rect of the board. */
export function frameRect(board: Board, index: number, screen: Screen): PixelRect | null {
  const frame = board.frames[index];
  if (frame === undefined) return null;
  return { x: frame.origin[0], y: frame.origin[1], w: screen.width, h: screen.height };
}

/** The board point `x, y` on the screen of the frame holding it, or as it is between frames. */
export function toFrame(
  board: Board,
  screen: Screen,
  [x, y]: readonly [number, number],
): readonly [number, number] {
  for (const frame of board.frames) {
    const [ox, oy] = frame.origin;
    if (x >= ox && y >= oy && x < ox + screen.width && y < oy + screen.height) {
      return [x - ox, y - oy];
    }
  }
  return [x, y];
}

/** The origin of the frame `key` is drawn in, the board's own where it is in none. */
export function originOf(board: Board, key: string): readonly [number, number] {
  return board.frames[board.frameOf.get(key) ?? -1]?.origin ?? [0, 0];
}
