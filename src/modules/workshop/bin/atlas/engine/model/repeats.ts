import { arrange, type Edges, type LayoutItem } from "../layout/managed";
import type { PixelRect } from "../layout/solve";
import type { ClonedElement, PreviewOverlay } from "./combo";
import { labelOf } from "./layers";
import { subtreeOf, type ViewTree } from "./tree";

/** How many rows a team's scoreboard holds, and how many cards a loading screen region does. */
const TEAM_SIZE = 5;

const SCOREBOARD_ROW = /_T[12]P0$/;
const SLOT_HEIGHT = /SlotHeightRef$/;
const CARD_TEMPLATE = "LoadingScreen_PlayerCard";
const UPPER_CARDS = "LoadingScreenPlayers_UpperCardRegion";
const LOWER_CARDS = "LoadingScreenPlayers_LowerCardRegion";

/**
 * A template the controller clones at run time, and where the preview draws its copies, per
 * "Repetition" in docs/plans/atlas-ui-editor.md.
 */
export interface Repeat {
  /** A scene, whose own and descendant scenes' elements are copied, or a group element. */
  readonly template: string;
  /** Each copy's offset from the template in screen pixels, the template's own place left out. */
  readonly offsets: readonly (readonly [number, number])[];
}

/** Every element a template holds: a group's subtree, or all a scene and its scenes draw. */
export function templateElements(tree: ViewTree, template: string): Set<string> {
  if (!tree.scenes.has(template)) return subtreeOf(tree, template);

  const keys = new Set<string>();
  const scenes = [template];
  for (let at = 0; at < scenes.length; at += 1) {
    const scene = scenes[at] ?? "";
    scenes.push(...(tree.sceneChildren.get(scene) ?? []));
    for (const element of tree.sceneElements.get(scene) ?? []) {
      for (const key of subtreeOf(tree, element)) keys.add(key);
    }
  }
  return keys;
}

/**
 * The copies `repeats` draw: each element a template holds that the preview shows, moved by each
 * offset. A copy reads its element's own text, and nothing picks it.
 */
export function repeatClones(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
  repeats: readonly Repeat[],
  shown: ReadonlySet<string>,
): ClonedElement[] {
  const clones: ClonedElement[] = [];
  for (const repeat of repeats) {
    for (const key of templateElements(tree, repeat.template)) {
      const rect = solved.get(key);
      if (rect === undefined || !shown.has(key) || tree.elements.get(key)?.look.kind === "group") {
        continue;
      }

      for (const [dx, dy] of repeat.offsets) {
        clones.push({
          element: key,
          rect: { ...rect, x: rect.x + dx, y: rect.y + dy },
          text: null,
        });
      }
    }
  }
  return clones;
}

/** `overlay` drawing `clones` too. */
export function withClones(
  overlay: PreviewOverlay,
  clones: readonly ClonedElement[],
): PreviewOverlay {
  if (clones.length === 0) return overlay;
  return { ...overlay, clones: [...overlay.clones, ...clones] };
}

/**
 * Every template the view's controller clones, and where its copies go: the layouts its fields
 * fill, the scoreboard's team rows, and the loading screen's player cards. A rule whose parts the
 * view does not hold draws nothing.
 */
export function viewRepeats(tree: ViewTree, solved: ReadonlyMap<string, PixelRect>): Repeat[] {
  return [
    ...layoutFills(tree, solved),
    ...scoreboardRows(tree, solved),
    ...playerCards(tree, solved),
  ];
}

/** The copies a controller field clones into a managed layout, placed by that layout. */
function layoutFills(tree: ViewTree, solved: ReadonlyMap<string, PixelRect>): Repeat[] {
  return tree.view.repeats.flatMap((repeat) => {
    const look = tree.elements.get(repeat.layout)?.look;
    const template = solved.get(repeat.template);
    if (look?.kind !== "group" || look.layout === null || template === undefined) return [];

    const region = look.layout.region === null ? undefined : solved.get(look.layout.region);
    if (region === undefined) return [];

    const items: LayoutItem[] = Array.from({ length: repeat.count }, (_, at) => ({
      key: String(at),
      rect: edgesOf(template),
    }));
    const placed = arrange(look.layout, edgesOf(region), items);
    return [{ template: repeat.template, offsets: [...placed.values()] }];
  });
}

/** Each team's row template, stepped down by the slot height the view measures it with. */
function scoreboardRows(tree: ViewTree, solved: ReadonlyMap<string, PixelRect>): Repeat[] {
  const slot = [...tree.elements.values()].find((element) =>
    SLOT_HEIGHT.test(labelOf(element.label, element.path, element.key)),
  );
  const pitch = slot === undefined ? undefined : solved.get(slot.key)?.h;
  if (pitch === undefined || pitch <= 0) return [];

  const offsets = Array.from({ length: TEAM_SIZE - 1 }, (_, at) => [0, (at + 1) * pitch] as const);
  const templates = [...tree.scenes.values(), ...tree.elements.values()].filter((each) =>
    SCOREBOARD_ROW.test(labelOf(each.label, each.path, each.key)),
  );
  return templates.map((template) => ({ template: template.key, offsets }));
}

/**
 * The player card, five to a region across each region's width, the template standing as the
 * first card of the upper region.
 */
function playerCards(tree: ViewTree, solved: ReadonlyMap<string, PixelRect>): Repeat[] {
  const template = [...tree.scenes.values()].find(
    (scene) => labelOf(scene.label, scene.path, scene.key) === CARD_TEMPLATE,
  );
  const upper = rectNamed(tree, solved, UPPER_CARDS);
  const lower = rectNamed(tree, solved, LOWER_CARDS);
  if (template === undefined || upper === undefined || lower === undefined) return [];

  const pitch = upper.w / TEAM_SIZE;
  const offsets: (readonly [number, number])[] = [];
  for (let at = 0; at < TEAM_SIZE; at += 1) {
    if (at > 0) offsets.push([at * pitch, 0]);
    offsets.push([at * pitch, lower.y - upper.y]);
  }
  return [{ template: template.key, offsets }];
}

function rectNamed(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
  name: string,
): PixelRect | undefined {
  const element = [...tree.elements.values()].find(
    (each) => labelOf(each.label, each.path, each.key) === name,
  );
  return element === undefined ? undefined : solved.get(element.key);
}

function edgesOf(rect: PixelRect): Edges {
  return { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
}
