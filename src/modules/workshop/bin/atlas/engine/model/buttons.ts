import type { PixelRect } from "../layout/solve";
import { sceneOf, subtreeOf, type ViewTree } from "./tree";
import type { ViewElement, ViewLook } from "./view";

type GroupLook = Extract<ViewLook, { kind: "group" }>;
export type ViewButton = NonNullable<GroupLook["button"]>;

/** The eight states of a `UiElementGroupButtonData`, by field, in the client's index order. */
export const BUTTON_STATES = [
  "DefaultStateElements",
  "InactiveStateElements",
  "InactiveSelectedStateElements",
  "HoverStateElements",
  "ClickedStateElements",
  "SelectedStateElements",
  "SelectedHoverStateElements",
  "SelectedClickedStateElements",
] as const;

export type ButtonState = (typeof BUTTON_STATES)[number];

/** What decides a button's state beside its own flags. */
export interface ButtonInput {
  readonly hovered: boolean;
  readonly pressed: boolean;
}

/**
 * The state a button draws, per "Buttons" in docs/research/ui-data-layout.md: an inactive one its
 * inactive state, else pressed over hovered over resting, each in its selected form where the
 * button is selected.
 */
export function buttonStateOf(button: ViewButton, { hovered, pressed }: ButtonInput): ButtonState {
  if (!button.active) {
    return button.selected ? "InactiveSelectedStateElements" : "InactiveStateElements";
  }
  if (button.selected) {
    if (pressed) return "SelectedClickedStateElements";
    return hovered ? "SelectedHoverStateElements" : "SelectedStateElements";
  }
  if (pressed) return "ClickedStateElements";
  return hovered ? "HoverStateElements" : "DefaultStateElements";
}

/** The state a button draws while nothing chooses another. */
export const DEFAULT_BUTTON_STATE = "DefaultStateElements";

/**
 * The elements a button's other states list, which its own state leaves undrawn, per "Buttons" in
 * docs/research/ui-data-layout.md. An element its state also lists stays drawn, a state's label and
 * frame belong to its list, and a state the file does not write lists nothing. The click particle
 * rests undrawn.
 */
export function hiddenByState(tree: ViewTree, states: ReadonlyMap<string, string>): Set<string> {
  const hidden = new Set<string>();
  for (const element of tree.view.elements) {
    if (element.look.kind !== "group") continue;
    if (element.look.button?.clickParticle) hidden.add(element.look.button.clickParticle);
    if (element.look.states.length === 0) continue;

    const state = states.get(element.key) ?? DEFAULT_BUTTON_STATE;
    const chosen = element.look.states.find((each) => each.state === state);
    const shown = new Set(chosen === undefined ? [] : stateList(chosen));
    for (const each of element.look.states) {
      for (const key of stateList(each)) {
        if (!shown.has(key)) hidden.add(key);
      }
    }
  }
  return hidden;
}

/** What one button state draws: its display list, its label and the label's frame. */
function stateList(state: GroupLook["states"][number]): string[] {
  return [...state.elements, state.text, state.textFrame].filter(
    (key): key is string => key !== null,
  );
}

/** The button a group element is, and none for any other element. */
export function buttonOf(element: ViewElement | undefined): ViewButton | null {
  return element?.look.kind === "group" ? element.look.button : null;
}

/** Where the pointer plays a button: its hit region's rect, else the rects of what it holds. */
export interface ButtonHit {
  readonly button: string;
  readonly rect: PixelRect;
}

/**
 * Every button's hit rect, topmost first by the draw order: scene layer, then layer, then file
 * order.
 */
export function buttonHits(tree: ViewTree, solved: ReadonlyMap<string, PixelRect>): ButtonHit[] {
  const placed: { hit: ButtonHit; sort: readonly [number, number, number] }[] = [];
  for (const element of tree.view.elements) {
    const button = buttonOf(element);
    if (button === null) continue;

    const own = button.hitRegion === null ? undefined : solved.get(button.hitRegion);
    const rect =
      own ?? joined([...subtreeOf(tree, element.key)].flatMap((each) => solved.get(each) ?? []));
    if (rect === null) continue;

    const scene = sceneOf(tree, element.key);
    const sort = [
      scene === null ? 0 : (tree.scenes.get(scene)?.layer ?? 0),
      element.layer,
      tree.fileOrder.get(element.key) ?? 0,
    ] as const;
    placed.push({ hit: { button: element.key, rect }, sort });
  }
  return placed
    .sort((a, b) => b.sort[0] - a.sort[0] || b.sort[1] - a.sort[1] || b.sort[2] - a.sort[2])
    .map(({ hit }) => hit);
}

function joined(rects: readonly PixelRect[]): PixelRect | null {
  const sized = rects.filter((rect) => rect.w > 0 && rect.h > 0);
  if (sized.length === 0) return null;

  const x = Math.min(...sized.map((rect) => rect.x));
  const y = Math.min(...sized.map((rect) => rect.y));
  const right = Math.max(...sized.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...sized.map((rect) => rect.y + rect.h));
  return { x, y, w: right - x, h: bottom - y };
}
