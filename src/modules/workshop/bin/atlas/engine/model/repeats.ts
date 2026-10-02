import { labelOf } from "./layers";
import {
  buildTree,
  copyKey,
  type CopyPlace,
  subtreeOf,
  type ViewCopy,
  type ViewTree,
} from "./tree";
import type { View } from "./view";

/** How many rows a team's scoreboard holds, and how many cards a loading screen region does. */
const TEAM_SIZE = 5;

const SCOREBOARD_ROW = /_T[12]P0$/;
const SLOT_HEIGHT = /SlotHeightRef$/;
const CARD_TEMPLATE = "LoadingScreen_PlayerCard";
const UPPER_CARDS = "LoadingScreenPlayers_UpperCardRegion";
const LOWER_CARDS = "LoadingScreenPlayers_LowerCardRegion";

/**
 * A template the controller clones at run time, and where each copy goes, per "Repetition" in
 * docs/plans/atlas-ui-editor.md.
 */
export interface Repeat {
  /** A scene, whose own and descendant scenes' elements are copied, or a group element. */
  readonly template: string;
  /** One copy of the template per place. */
  readonly places: readonly CopyPlace[];
}

/** `view` linked into its tree, with the copies its controller makes. */
export function viewTree(view: View): ViewTree {
  return withCopies(buildTree(view));
}

/**
 * `tree` with a copy of every element each template holds, once per place. The copy heading a
 * clone takes the place, and each other copy hangs under the copy of its group.
 */
export function withCopies(
  tree: ViewTree,
  repeats: readonly Repeat[] = viewRepeats(tree),
): ViewTree {
  if (repeats.length === 0) return tree;

  const copies = new Map<string, ViewCopy>();
  const copiesIn = new Map<string, string[]>();
  repeats.forEach((repeat, at) => {
    const held = templateElements(tree, repeat.template);

    repeat.places.forEach((place, index) => {
      const clone = `${at}.${index}`;
      for (const original of held) {
        const parent = tree.groupOf.get(original);
        const heads = parent === undefined || !held.has(parent);
        const group = heads ? headGroup(place, parent) : copyKey(parent, clone);
        const key = copyKey(original, clone);

        copies.set(key, { original, clone, group, place: heads ? place : null });
        if (group !== null) copiesIn.set(group, [...(copiesIn.get(group) ?? []), key]);
      }
    });
  });

  return { ...tree, copies, copiesIn };
}

/** The group the copy heading a clone sits in: the layout it fills, else its original's. */
function headGroup(place: CopyPlace, parent: string | undefined): string | null {
  if (place.kind === "layout") return place.layout;

  return parent ?? null;
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
 * Every template the view's controller clones, and where its copies go: the layouts its fields
 * fill, the scoreboard's team rows, and the loading screen's player cards. A rule whose parts the
 * view does not hold makes no copy.
 */
export function viewRepeats(tree: ViewTree): Repeat[] {
  return [...layoutFills(tree), ...scoreboardRows(tree), ...playerCards(tree)];
}

/**
 * The copies a move of `moving` carries along: the copy of each moved element, except where the
 * moved element heads a clone a layout places, which holds that whole copy where it is.
 */
export function followers(tree: ViewTree, moving: ReadonlySet<string>): string[] {
  const follow: string[] = [];
  for (const [key, copy] of tree.copies) {
    if (moving.has(copy.original) && !heldByLayout(tree, key, moving)) follow.push(key);
  }
  return follow;
}

function heldByLayout(tree: ViewTree, key: string, moving: ReadonlySet<string>): boolean {
  let at = tree.copies.get(key);
  const seen = new Set<string>();
  while (at !== undefined && at.place === null && at.group !== null && !seen.has(at.group)) {
    seen.add(at.group);
    at = tree.copies.get(at.group);
  }
  return at?.place?.kind === "layout" && moving.has(at.original);
}

/** The copies a controller field clones into a managed layout, which that layout places. */
function layoutFills(tree: ViewTree): Repeat[] {
  return tree.view.repeats.flatMap((repeat) => {
    const look = tree.elements.get(repeat.layout)?.look;
    if (look?.kind !== "group" || look.layout === null || look.layout.region === null) return [];
    if (!tree.elements.has(look.layout.region) || !tree.elements.has(repeat.template)) return [];

    const place: CopyPlace = { kind: "layout", layout: repeat.layout };
    return [
      { template: repeat.template, places: Array.from({ length: repeat.count }, () => place) },
    ];
  });
}

/** Each team's row template, stepped down by the height of the slot the view measures it with. */
function scoreboardRows(tree: ViewTree): Repeat[] {
  const slot = [...tree.elements.values()].find((element) =>
    SLOT_HEIGHT.test(labelOf(element.label, element.path, element.key)),
  );
  if (slot === undefined) return [];

  const places = Array.from({ length: TEAM_SIZE - 1 }, (_, at): CopyPlace => ({
    kind: "step",
    measure: slot.key,
    axis: 1,
    steps: at + 1,
  }));
  const templates = [...tree.scenes.values(), ...tree.elements.values()].filter((each) =>
    SCOREBOARD_ROW.test(labelOf(each.label, each.path, each.key)),
  );
  return templates.map((template) => ({ template: template.key, places }));
}

/**
 * The player card, five to a region across each region's width, the template standing as the
 * first card of the upper region.
 */
function playerCards(tree: ViewTree): Repeat[] {
  const template = [...tree.scenes.values()].find(
    (scene) => labelOf(scene.label, scene.path, scene.key) === CARD_TEMPLATE,
  );
  const upper = keyNamed(tree, UPPER_CARDS);
  const lower = keyNamed(tree, LOWER_CARDS);
  if (template === undefined || upper === undefined || lower === undefined) return [];

  const cell = (region: string, column: number): CopyPlace => ({
    kind: "cell",
    home: upper,
    region,
    column,
    columns: TEAM_SIZE,
  });
  const places: CopyPlace[] = [];
  for (let at = 0; at < TEAM_SIZE; at += 1) {
    if (at > 0) places.push(cell(upper, at));
    places.push(cell(lower, at));
  }
  return [{ template: template.key, places }];
}

function keyNamed(tree: ViewTree, name: string): string | undefined {
  return [...tree.elements.values()].find(
    (each) => labelOf(each.label, each.path, each.key) === name,
  )?.key;
}
