import type { PropertyEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { positionAt } from "../layout/positionAt";
import { type LayoutSettings, type PixelRect, solveRect } from "../layout/solve";
import type { ElementKind } from "../model/elementKinds";
import { labelOf } from "../model/layers";
import { childrenOf, sceneOf, type ViewTree } from "../model/tree";
import type { ViewRect } from "../model/view";
import {
  enabledEdit,
  groupEdit,
  layerEdit,
  nameEdit,
  newRectEdit,
  sceneEdit,
} from "./elementEdits";

/** The desktop HUD's source resolution, which a view with no rect to copy one from starts in. */
const DESKTOP_SOURCE = [1600, 1200] as const;

const SCREEN_CENTRE = [0.5, 0.5] as const;

type Pair = readonly [number, number];

/** Where a new element lands: a scene, and the group of that scene that lists it. */
export interface AddTarget {
  readonly scene: string;
  readonly group: string | null;
}

/**
 * Where an element added at the element `at` lands: inside it where it is a group, in the scene
 * an element of any other kind draws in, and in the first root scene for none. Null for a view
 * that holds no scene.
 */
export function addTargetOf(tree: ViewTree, at: string | null): AddTarget | null {
  const scene = at === null ? null : sceneOf(tree, at);
  if (at !== null && scene !== null) {
    const group = tree.elements.get(at)?.look.kind === "group" ? at : null;
    return { scene, group };
  }

  const [root] = tree.sceneChildren.get(null) ?? [];
  return root === undefined ? null : { scene: root, group: null };
}

/** Where a new element starts: its corner in source pixels, and the rect it draws on the screen. */
export interface NewPlace {
  readonly position: Pair;
  readonly rect: PixelRect;
}

/**
 * Where a new element of `kind` in the scene `scene` starts with its centre at the screen point
 * `centre`, on a whole source pixel. Null for a kind that draws from no rect.
 */
export function placeAt(
  tree: ViewTree,
  kind: ElementKind,
  scene: string,
  settings: LayoutSettings,
  centre: Pair,
): NewPlace | null {
  if (kind.size === null) return null;

  const blank = newRect(kind.size, sourceIn(tree, scene), [0, 0]);
  const [x, y] = positionAt(blank, centre, settings);
  const position: Pair = [Math.round(x), Math.round(y)];
  const screen = { x: 0, y: 0, w: settings.screen.width, h: settings.screen.height };
  return { position, rect: solveRect({ ...blank, position }, screen, settings) };
}

/**
 * A name for a new element of `kind` that no scene or element of the view holds: `folder`, the
 * target scene's name and the kind's own, numbered from the second of its kind on.
 */
export function newElementName(
  tree: ViewTree,
  folder: string,
  target: AddTarget,
  kind: ElementKind,
): string {
  const scene = tree.scenes.get(target.scene);
  const within = scene === undefined ? target.scene : labelOf(scene.label, scene.path, scene.key);
  const taken = (name: string) => {
    const key = nameHash(name);
    return tree.elements.has(key) || tree.scenes.has(key);
  };

  const first = `${folder}${within}/${kind.name}`;
  if (!taken(first)) return first;

  let count = 2;
  while (taken(`${first}${count}`)) count += 1;
  return `${first}${count}`;
}

/**
 * The edits that fill the new element `key` of `kind`, an object holding no property yet, per
 * "Interaction" in docs/plans/atlas-ui-editor.md: its name and scene, its place in the target
 * group's `Elements`, and for a kind that draws from a rect, a rect in the source resolution its
 * siblings use, enabled, on the layer above them. The rect's corner is `position`, in source
 * pixels as `placeAt` answers it, and the rect is centred on the screen for none.
 */
export function newElementEdits(
  tree: ViewTree,
  key: string,
  name: string,
  kind: ElementKind,
  target: AddTarget,
  position: Pair | null = null,
): PropertyEdit[] {
  const edits = [nameEdit(key, name), sceneEdit(key, target.scene)];

  if (kind.size !== null) {
    const source = sourceIn(tree, target.scene);
    const centred: Pair = [
      Math.round((source[0] - kind.size[0]) / 2),
      Math.round((source[1] - kind.size[1]) / 2),
    ];
    edits.push(
      enabledEdit(key, true),
      layerEdit(key, layerAbove(tree, target)),
      newRectEdit(key, position ?? centred, kind.size, source, SCREEN_CENTRE),
    );
  }

  const look = target.group === null ? undefined : tree.elements.get(target.group)?.look;
  if (target.group !== null && look?.kind === "group") {
    edits.push(groupEdit(target.group, look.children.length, key));
  }
  return edits;
}

/** The layer above every element the target holds, and 0 for an empty target. */
function layerAbove(tree: ViewTree, target: AddTarget): number {
  const siblings =
    target.group === null
      ? (tree.sceneElements.get(target.scene) ?? [])
      : childrenOf(tree, target.group);
  const layers = siblings.map((each) => tree.elements.get(each)?.layer ?? 0);
  return layers.length === 0 ? 0 : Math.max(...layers) + 1;
}

/**
 * The source resolution most rects of the scene `scene` are written in, then of the whole view,
 * then the desktop HUD's.
 */
function sourceIn(tree: ViewTree, scene: string): Pair {
  const all = [...tree.elements.keys()];
  const inScene = all.filter((key) => sceneOf(tree, key) === scene);
  return commonSource(tree, inScene) ?? commonSource(tree, all) ?? DESKTOP_SOURCE;
}

function commonSource(tree: ViewTree, keys: readonly string[]): Pair | null {
  const counts = new Map<string, { source: Pair; count: number }>();
  for (const key of keys) {
    const position = tree.elements.get(key)?.position;
    if (position?.kind !== "rect" && position?.kind !== "polygon") continue;

    const [width, height] = position.rect.source;
    if (width <= 0 || height <= 0) continue;

    const id = `${width}x${height}`;
    const held = counts.get(id);
    counts.set(id, { source: [width, height], count: (held?.count ?? 0) + 1 });
  }

  let best: { source: Pair; count: number } | null = null;
  for (const each of counts.values()) {
    if (best === null || each.count > best.count) best = each;
  }
  return best?.source ?? null;
}

/** The rect a new element of `size` is written with, every switch of it off. */
function newRect(size: Pair, source: Pair, position: Pair): ViewRect {
  return {
    position: [...position],
    size: [...size],
    source: [...source],
    anchor: { kind: "single", anchor: [...SCREEN_CENTRE] },
    ignoreGlobalScale: false,
    ignoreSafeZone: false,
    disableResolutionDownscale: false,
    disablePixelSnapping: [false, false],
    minSize: [0, 0],
    maxSize: [Infinity, Infinity],
  };
}
