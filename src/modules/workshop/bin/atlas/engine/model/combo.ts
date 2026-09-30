import type { PixelRect } from "../layout/solve";
import { subtreeOf, type ViewTree } from "./tree";
import type { View } from "./view";

export type ComboBox = View["comboBoxes"][number];

/** A combo box as the preview holds it, which nothing writes to the file. */
export interface ComboState {
  readonly open: boolean;
  /** How many options the list holds. The controller fills them at run time. */
  readonly options: number;
  /** The selected option, -1 for none. */
  readonly selected: number;
}

export const CLOSED_COMBO: ComboState = { open: false, options: 3, selected: 0 };

/** The most options the preview lists, which the client does not cap. */
export const MAX_COMBO_OPTIONS = 12;

/** One element drawn once more at another rect: a row cloned from a template. */
export interface ClonedElement {
  readonly element: string;
  readonly rect: PixelRect;
  /** The text a cloned label reads, null for a clone that draws no text. */
  readonly text: string | null;
}

/** One row of an open list, where the pointer finds it. */
export interface ComboRow {
  readonly combo: string;
  readonly option: number;
  readonly rect: PixelRect;
}

/** What the preview draws over the file for its combo boxes and anything else it plays. */
export interface PreviewOverlay {
  readonly clones: readonly ClonedElement[];
  /** Rects in place of the solver's. */
  readonly moved: ReadonlyMap<string, PixelRect>;
  /** Drawn whatever the file's `Enabled` says. */
  readonly shown: ReadonlySet<string>;
  /** Drawn off whatever the file says. */
  readonly hidden: ReadonlySet<string>;
  /** Text in place of a text element's own. */
  readonly texts: ReadonlyMap<string, string>;
  readonly rows: readonly ComboRow[];
}

export const NO_OVERLAY: PreviewOverlay = {
  clones: [],
  moved: new Map(),
  shown: new Set(),
  hidden: new Set(),
  texts: new Map(),
  rows: [],
};

/** How a combo box's parts are found and read. */
export interface ComboInputs {
  readonly tree: ViewTree;
  readonly solved: ReadonlyMap<string, PixelRect>;
  /** The game's text of a TRA key, null where the game has none. */
  readonly string: (key: string) => string | null;
  /** The name an option reads, counting from 0. */
  readonly optionName: (option: number) => string;
}

/**
 * Every combo box of the view laid out as the client lays it, per "Combo boxes" in
 * docs/research/ui-data-layout.md: the list parts off while closed, and while open one row per
 * option cloned from the row templates a row's height apart, the backdrop grown to hold them, and
 * the hover and the highlight on their rows. The button reads the selected option.
 */
export function comboOverlay(
  combos: readonly ComboBox[],
  states: (combo: string) => ComboState,
  hovered: { readonly combo: string; readonly option: number } | null,
  inputs: ComboInputs,
): PreviewOverlay {
  if (combos.length === 0) return NO_OVERLAY;

  const overlay = {
    clones: [] as ClonedElement[],
    moved: new Map<string, PixelRect>(),
    shown: new Set<string>(),
    hidden: new Set<string>(),
    texts: new Map<string, string>(),
    rows: [] as ComboRow[],
  };
  for (const combo of combos) {
    const state = states(combo.key);
    const hover = hovered?.combo === combo.key ? hovered.option : null;
    layCombo(combo, state, hover, inputs, overlay);
  }
  return overlay;
}

type Overlay = {
  clones: ClonedElement[];
  moved: Map<string, PixelRect>;
  shown: Set<string>;
  hidden: Set<string>;
  texts: Map<string, string>;
  rows: ComboRow[];
};

function layCombo(
  combo: ComboBox,
  state: ComboState,
  hovered: number | null,
  inputs: ComboInputs,
  overlay: Overlay,
): void {
  const parts = [
    combo.backdrop,
    combo.hover,
    combo.highlight,
    combo.optionText,
    combo.optionHitArea,
  ].filter((key): key is string => key !== null);

  const closed = closedLabel(combo, state, inputs);
  for (const label of buttonTexts(combo, inputs.tree)) overlay.texts.set(label, closed);

  if (!state.open) {
    for (const key of parts) overlay.hidden.add(key);
    return;
  }

  /* The templates stand in for no row of their own: every row is a clone. */
  for (const key of [combo.optionText, combo.optionHitArea]) {
    if (key !== null) overlay.hidden.add(key);
  }

  const hit = combo.optionHitArea === null ? undefined : inputs.solved.get(combo.optionHitArea);
  if (hit === undefined || hit.h <= 0) return;

  const height = hit.h;
  const step = combo.upward ? -height : height;
  const count = Math.max(1, state.options);
  /* Upward, row 0 sits on the button and holds the last option, so option 0 stays on top. */
  const rowOf = (option: number) => (combo.upward ? count - 1 - option : option);
  const shifted = (rect: PixelRect, row: number): PixelRect => ({
    ...rect,
    y: rect.y + row * step,
  });

  const text = combo.optionText === null ? undefined : inputs.solved.get(combo.optionText);
  for (let option = 0; option < count; option += 1) {
    const row = rowOf(option);
    overlay.rows.push({ combo: combo.key, option, rect: shifted(hit, row) });
    if (text !== undefined && combo.optionText !== null) {
      overlay.clones.push({
        element: combo.optionText,
        rect: shifted(text, row),
        text: inputs.optionName(option),
      });
    }
  }

  const backdrop = combo.backdrop === null ? undefined : inputs.solved.get(combo.backdrop);
  if (backdrop !== undefined && combo.backdrop !== null) {
    const grown = (count - 1) * height;
    overlay.moved.set(combo.backdrop, {
      ...backdrop,
      y: combo.upward ? backdrop.y - grown : backdrop.y,
      h: backdrop.h + grown,
    });
    overlay.shown.add(combo.backdrop);
  }

  onRow(combo.hover, hovered, rowOf, shifted, inputs, overlay);
  onRow(
    combo.highlight,
    state.selected >= 0 ? state.selected : null,
    rowOf,
    shifted,
    inputs,
    overlay,
  );
}

/** `key` moved onto the row of `option` and drawn, or drawn off where there is no option. */
function onRow(
  key: string | null,
  option: number | null,
  rowOf: (option: number) => number,
  shifted: (rect: PixelRect, row: number) => PixelRect,
  inputs: ComboInputs,
  overlay: Overlay,
): void {
  if (key === null) return;

  const rect = inputs.solved.get(key);
  if (option === null || rect === undefined) {
    overlay.hidden.add(key);
    return;
  }
  overlay.moved.set(key, shifted(rect, rowOf(option)));
  overlay.shown.add(key);
}

/**
 * What the closed box reads: the label key's text with `@Name@` the selected option, else the
 * option itself, and nothing with no selection.
 */
function closedLabel(combo: ComboBox, state: ComboState, inputs: ComboInputs): string {
  if (state.selected < 0) return "";

  const name = inputs.optionName(state.selected);
  const format = combo.labelKey === null ? null : inputs.string(combo.labelKey);
  return format === null ? name : format.replace(/@Name@/g, name);
}

/**
 * The texts the button draws its label with: each state's `TextElement`, which the client sets the
 * label on, else the first text under a button that names none.
 */
function buttonTexts(combo: ComboBox, tree: ViewTree): string[] {
  if (combo.button === null) return [];

  const look = tree.elements.get(combo.button)?.look;
  const named = look?.kind === "group" ? look.states.flatMap((state) => state.text ?? []) : [];
  if (named.length > 0) return [...new Set(named)];

  for (const key of subtreeOf(tree, combo.button)) {
    if (tree.elements.get(key)?.look.kind === "text") return [key];
  }
  return [];
}

/** Where a combo box's button takes a click. */
export interface ComboButton {
  readonly combo: string;
  readonly rect: PixelRect;
}

/** Each combo box's button: its own rect, else the rects of what it holds joined. */
export function comboButtons(
  combos: readonly ComboBox[],
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
): ComboButton[] {
  return combos.flatMap((combo) => {
    if (combo.button === null) return [];

    const own = solved.get(combo.button);
    const rects =
      own === undefined
        ? [...subtreeOf(tree, combo.button)].flatMap((key) => solved.get(key) ?? [])
        : [own];
    const rect = joined(rects);
    return rect === null ? [] : [{ combo: combo.key, rect }];
  });
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

/** Whether the screen point `x, y` falls in `rect`. */
export function holds(rect: PixelRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** The combo box whose button, list or row templates hold `element`, if any. */
export function comboOf(combos: readonly ComboBox[], element: string): ComboBox | undefined {
  return combos.find((combo) =>
    [
      combo.button,
      combo.backdrop,
      combo.hover,
      combo.highlight,
      combo.optionText,
      combo.optionHitArea,
    ].includes(element),
  );
}
