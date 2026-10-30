/**
 * The one keymap of the audio file document and the Voice lines view.
 *
 * The key handlers resolve a press through `resolveCommand`, and the menu bar, the context menus,
 * the palette and the shortcut sheet read their keys from the same table. Per "Keys and
 * gestures" in docs/ux/AUDIO.md.
 */

/**
 * A surface that answers keys: a list of rows, a knob, or the whole document outside a text field.
 *
 * `lines` is the Voice lines view, which has no audio document around it and so also answers the
 * document keys that apply to it.
 */
export type AudioSurface = "media" | "voices" | "lines" | "document" | "knob";

/** The section of the shortcut sheet and the palette that a command is listed under. */
export type AudioCommandGroup = "transport" | "navigation" | "editing" | "view" | "pointer";

/** The id of one command of the keymap. */
export type AudioCommandId =
  | "play"
  | "playAll"
  | "stop"
  | "loop"
  | "volumeDown"
  | "volumeUp"
  | "moveRow"
  | "movePage"
  | "moveEnd"
  | "extendRange"
  | "selectAll"
  | "stepRight"
  | "stepLeft"
  | "nextEvent"
  | "previousEvent"
  | "typeAhead"
  | "find"
  | "menu"
  | "viewMedia"
  | "viewEvents"
  | "toggleInspector"
  | "help"
  | "enter"
  | "reset"
  | "add"
  | "duplicate"
  | "remove"
  | "moveUp"
  | "moveDown"
  | "wrap"
  | "copy"
  | "cut"
  | "paste"
  | "save"
  | "undo"
  | "redo"
  | "knobStep"
  | "knobFine"
  | "knobCoarse"
  | "knobReset"
  | "dragReorder"
  | "dropMedia"
  | "dragEvent"
  | "middleClick"
  | "pickClick"
  | "details"
  | "rename"
  | "replaceMedia"
  | "newEvent"
  | "addSound"
  | "addRandom"
  | "addSequence"
  | "addSwitch"
  | "importWem"
  | "expandAll"
  | "collapseAll"
  | "createEvent"
  | "showInBank"
  | "showInTree"
  | "copyForSkin";

/**
 * Who answers the keys of a binding.
 *
 * `audio` is a handler of this module. `app` is a handler outside it, such as the editor's
 * `Ctrl+S`, which the table lists so that the sheet and the tooltips show it. `knob` is the
 * shared `Knob`, whose keys `knobValue.ts` defines. `pointer` is a gesture without a key. `menu`
 * is a command without a key that the menu bar and the palette run, which the sheet leaves out.
 */
export type BindingOwner = "audio" | "app" | "knob" | "pointer" | "menu";

/** One command and the chords that run it. */
export interface AudioBinding {
  readonly id: AudioCommandId;
  /** The chords in canonical form, as `chordText` writes them. The first is the one shown. */
  readonly keys: readonly string[];
  readonly surfaces: readonly AudioSurface[];
  readonly group: AudioCommandGroup;
  readonly owner: BindingOwner;
}

const LISTS: readonly AudioSurface[] = ["media", "voices", "lines"];
const TREES: readonly AudioSurface[] = ["voices", "lines"];
const BANK: readonly AudioSurface[] = ["voices"];
const LINES: readonly AudioSurface[] = ["lines"];
const DOCUMENT_KEYS: readonly AudioSurface[] = ["document", "lines"];

/** Every command of the keymap, in the order that the sheet lists each group. */
export const AUDIO_KEYMAP: readonly AudioBinding[] = [
  { id: "play", keys: ["Space"], surfaces: LISTS, group: "transport", owner: "audio" },
  { id: "playAll", keys: ["Shift+Space"], surfaces: TREES, group: "transport", owner: "audio" },
  { id: "stop", keys: ["Escape"], surfaces: LISTS, group: "transport", owner: "audio" },
  { id: "loop", keys: ["Ctrl+L"], surfaces: DOCUMENT_KEYS, group: "transport", owner: "audio" },
  { id: "volumeDown", keys: ["-"], surfaces: DOCUMENT_KEYS, group: "transport", owner: "audio" },
  {
    id: "volumeUp",
    keys: ["=", "+"],
    surfaces: DOCUMENT_KEYS,
    group: "transport",
    owner: "audio",
  },

  {
    id: "moveRow",
    keys: ["ArrowUp", "ArrowDown"],
    surfaces: LISTS,
    group: "navigation",
    owner: "audio",
  },
  {
    id: "movePage",
    keys: ["PageUp", "PageDown"],
    surfaces: LISTS,
    group: "navigation",
    owner: "audio",
  },
  { id: "moveEnd", keys: ["Home", "End"], surfaces: LISTS, group: "navigation", owner: "audio" },
  {
    id: "extendRange",
    keys: [
      "Shift+ArrowUp",
      "Shift+ArrowDown",
      "Shift+PageUp",
      "Shift+PageDown",
      "Shift+Home",
      "Shift+End",
    ],
    surfaces: TREES,
    group: "navigation",
    owner: "audio",
  },
  { id: "selectAll", keys: ["Ctrl+A"], surfaces: TREES, group: "navigation", owner: "audio" },
  { id: "stepRight", keys: ["ArrowRight"], surfaces: TREES, group: "navigation", owner: "audio" },
  { id: "stepLeft", keys: ["ArrowLeft"], surfaces: TREES, group: "navigation", owner: "audio" },
  {
    id: "nextEvent",
    keys: ["Ctrl+ArrowDown"],
    surfaces: TREES,
    group: "navigation",
    owner: "audio",
  },
  {
    id: "previousEvent",
    keys: ["Ctrl+ArrowUp"],
    surfaces: TREES,
    group: "navigation",
    owner: "audio",
  },
  { id: "typeAhead", keys: [], surfaces: LISTS, group: "navigation", owner: "audio" },
  { id: "find", keys: ["Ctrl+F"], surfaces: ["document"], group: "navigation", owner: "app" },
  {
    id: "menu",
    keys: ["Shift+F10", "ContextMenu"],
    surfaces: LISTS,
    group: "navigation",
    owner: "app",
  },

  {
    id: "viewMedia",
    keys: ["Ctrl+Shift+M"],
    surfaces: ["document"],
    group: "view",
    owner: "audio",
  },
  {
    id: "viewEvents",
    keys: ["Ctrl+Shift+E"],
    surfaces: ["document"],
    group: "view",
    owner: "audio",
  },
  {
    id: "toggleInspector",
    keys: ["Ctrl+Alt+B"],
    surfaces: DOCUMENT_KEYS,
    group: "view",
    owner: "audio",
  },
  { id: "help", keys: ["?"], surfaces: DOCUMENT_KEYS, group: "view", owner: "audio" },

  { id: "enter", keys: ["F2", "Enter"], surfaces: LISTS, group: "editing", owner: "audio" },
  { id: "reset", keys: ["Backspace"], surfaces: BANK, group: "editing", owner: "audio" },
  { id: "add", keys: ["Ctrl+Enter"], surfaces: TREES, group: "editing", owner: "audio" },
  { id: "duplicate", keys: ["Ctrl+D"], surfaces: TREES, group: "editing", owner: "audio" },
  { id: "remove", keys: ["Delete"], surfaces: TREES, group: "editing", owner: "audio" },
  { id: "moveUp", keys: ["Alt+ArrowUp"], surfaces: TREES, group: "editing", owner: "audio" },
  { id: "moveDown", keys: ["Alt+ArrowDown"], surfaces: TREES, group: "editing", owner: "audio" },
  { id: "wrap", keys: ["Ctrl+G"], surfaces: BANK, group: "editing", owner: "audio" },
  { id: "copy", keys: ["Ctrl+C"], surfaces: LISTS, group: "editing", owner: "audio" },
  { id: "cut", keys: ["Ctrl+X"], surfaces: BANK, group: "editing", owner: "audio" },
  { id: "paste", keys: ["Ctrl+V"], surfaces: BANK, group: "editing", owner: "audio" },
  { id: "save", keys: ["Ctrl+S"], surfaces: ["document"], group: "editing", owner: "app" },
  { id: "undo", keys: ["Ctrl+Z"], surfaces: ["document"], group: "editing", owner: "app" },
  {
    id: "redo",
    keys: ["Ctrl+Shift+Z", "Ctrl+Y"],
    surfaces: ["document"],
    group: "editing",
    owner: "app",
  },
  {
    id: "knobStep",
    keys: ["ArrowUp", "ArrowDown"],
    surfaces: ["knob"],
    group: "editing",
    owner: "knob",
  },
  {
    id: "knobFine",
    keys: ["Shift+ArrowUp", "Shift+ArrowDown"],
    surfaces: ["knob"],
    group: "editing",
    owner: "knob",
  },
  {
    id: "knobCoarse",
    keys: ["Ctrl+ArrowUp", "Ctrl+ArrowDown"],
    surfaces: ["knob"],
    group: "editing",
    owner: "knob",
  },
  {
    id: "knobReset",
    keys: ["Delete", "Backspace"],
    surfaces: ["knob"],
    group: "editing",
    owner: "knob",
  },

  { id: "dragReorder", keys: [], surfaces: TREES, group: "pointer", owner: "pointer" },
  { id: "dropMedia", keys: [], surfaces: BANK, group: "pointer", owner: "pointer" },
  { id: "dragEvent", keys: [], surfaces: TREES, group: "pointer", owner: "pointer" },
  { id: "middleClick", keys: [], surfaces: LISTS, group: "pointer", owner: "pointer" },
  { id: "pickClick", keys: [], surfaces: TREES, group: "pointer", owner: "pointer" },

  { id: "details", keys: [], surfaces: ["document"], group: "view", owner: "menu" },
  { id: "expandAll", keys: [], surfaces: TREES, group: "view", owner: "menu" },
  { id: "collapseAll", keys: [], surfaces: TREES, group: "view", owner: "menu" },
  { id: "createEvent", keys: [], surfaces: LINES, group: "editing", owner: "menu" },
  { id: "showInBank", keys: [], surfaces: LINES, group: "view", owner: "menu" },
  { id: "showInTree", keys: [], surfaces: LINES, group: "view", owner: "menu" },
  { id: "copyForSkin", keys: [], surfaces: LINES, group: "editing", owner: "menu" },
  { id: "rename", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "replaceMedia", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "newEvent", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "addSound", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "addRandom", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "addSequence", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "addSwitch", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
  { id: "importWem", keys: [], surfaces: BANK, group: "editing", owner: "menu" },
];

/** The modifier and key state of a press that `chordText` reads. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Returns the canonical text of `press`: `Ctrl`, `Alt` and `Shift` in that order, then the key.
 *
 * Meta counts as Ctrl. A letter is upper case and the space bar is `Space`. A symbol key drops
 * Shift, because the layout already folds Shift into the symbol: `?` is Shift and `/` on a US
 * keyboard.
 */
export function chordText(press: KeyPress): string {
  const key =
    press.key === " " ? "Space" : press.key.length === 1 ? press.key.toUpperCase() : press.key;
  const symbol = key.length === 1 && !/[A-Z0-9]/.test(key);
  const parts: string[] = [];
  if (press.ctrlKey || press.metaKey) parts.push("Ctrl");
  if (press.altKey) parts.push("Alt");
  if (press.shiftKey && !symbol) parts.push("Shift");
  parts.push(key);

  return parts.join("+");
}

/**
 * Returns the command that `press` runs on `surface`, or null if the surface binds no command of
 * this module to it.
 *
 * A chord that an app-wide handler answers resolves to null, so the press reaches that handler.
 */
export function resolveCommand(press: KeyPress, surface: AudioSurface): AudioCommandId | null {
  const chord = chordText(press);
  const binding = AUDIO_KEYMAP.find(
    (each) =>
      each.owner === "audio" && each.surfaces.includes(surface) && each.keys.includes(chord),
  );

  return binding?.id ?? null;
}

/** The order of the sections of the shortcut sheet. */
const GROUP_ORDER: readonly AudioCommandGroup[] = [
  "transport",
  "navigation",
  "view",
  "editing",
  "pointer",
];

/** One section of the shortcut sheet. */
export interface SheetGroup {
  readonly group: AudioCommandGroup;
  readonly bindings: readonly AudioBinding[];
}

/**
 * Returns the bindings that a surface of `scope` answers, by group in the order of the sheet.
 *
 * A group without a binding is left out, and so is a command that only a menu runs.
 */
export function sheetGroups(scope: readonly AudioSurface[]): SheetGroup[] {
  const shown = AUDIO_KEYMAP.filter(
    (binding) =>
      binding.owner !== "menu" && binding.surfaces.some((surface) => scope.includes(surface)),
  );

  return GROUP_ORDER.map((group) => ({
    group,
    bindings: shown.filter((binding) => binding.group === group),
  })).filter((section) => section.bindings.length > 0);
}

/** Returns `true` if `target` takes typed text, which keeps every key that it receives. */
export function typesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return target.closest("input, textarea, select, [role='combobox'], [role='textbox']") !== null;
}

/** The words that a keycap shows for a key whose `KeyboardEvent.key` name is not one. */
const KEY_WORDS: Readonly<Record<string, string>> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PageUp: "Page Up",
  PageDown: "Page Down",
  ContextMenu: "Menu",
};

/** Returns `chord` in the words that `Kbd` draws, such as `Alt+Down` for `Alt+ArrowDown`. */
export function chordLabel(chord: string): string {
  return chord
    .split("+")
    .map((part) => KEY_WORDS[part] ?? part)
    .join("+");
}

/** Returns the binding of `id`. */
export function bindingOf(id: AudioCommandId): AudioBinding {
  const binding = AUDIO_KEYMAP.find((each) => each.id === id);
  if (binding === undefined) throw new Error(`The audio keymap has no binding for "${id}"`);

  return binding;
}

/** Returns the chord that a menu item of `id` shows on its right, or undefined for none. */
export function menuShortcut(id: AudioCommandId): string | undefined {
  return shortcutOf(id) ?? undefined;
}

/** Returns the first chord of `id` as `chordLabel` writes it, or null for a command without a key. */
export function shortcutOf(id: AudioCommandId): string | null {
  const [first] = bindingOf(id).keys;

  return first === undefined ? null : chordLabel(first);
}
