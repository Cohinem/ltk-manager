import { chordLabel, chordText, type KeyPress } from "@/modules/editor/utils/chords";

/** Every key of the particle shell as `chordText` spells it. The handlers and the menu bar read it. */
export const VFX_KEYS = {
  play: "Space",
  stepBack: "ArrowLeft",
  stepForward: "ArrowRight",
  jumpBack: "Shift+ArrowLeft",
  jumpForward: "Shift+ArrowRight",
  restart: "Home",
  end: "End",
  loop: "L",
  fit: "F",
  solo: "S",
  mute: "M",
  slower: "[",
  faster: "]",
  markerAdd: "Ctrl+M",
  copy: "Ctrl+C",
  duplicate: "Ctrl+D",
  paste: "Ctrl+V",
  remove: "Delete",
  selectAll: "Ctrl+A",
  selectNone: "Escape",
  quickAdd: "Tab",
  quickAddAlternate: "Shift+A",
  systemPrevious: "Alt+ArrowUp",
  systemNext: "Alt+ArrowDown",
  curveKeyDelete: "Delete",
} as const;

export type VfxKey = keyof typeof VFX_KEYS;

/** The keys that `RunKeys` answers. */
export type RunKey =
  | "play"
  | "stepBack"
  | "stepForward"
  | "jumpBack"
  | "jumpForward"
  | "restart"
  | "end"
  | "loop"
  | "fit"
  | "solo"
  | "mute"
  | "slower"
  | "faster"
  | "markerAdd";

/** The names of `react-hotkeys-hook` for the key parts that it does not spell as `chordText` does. */
const HOTKEY_PARTS: Readonly<Record<string, string>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  "[": "bracketleft",
  "]": "bracketright",
};

/** The words that a keycap shows beyond `chordLabel`. */
const SHORT_KEYS: Readonly<Record<string, string>> = { Delete: "Del", Escape: "Esc" };

/** Returns `chord` in the spelling of `react-hotkeys-hook`, such as `shift+left`. */
export function hotkeyOf(chord: string): string {
  return chord
    .split("+")
    .map((part) => HOTKEY_PARTS[part] ?? part.toLowerCase())
    .join("+");
}

/** Returns the text that a menu item shows for the key `name`. */
export function vfxShortcut(name: VfxKey): string {
  const label = chordLabel(VFX_KEYS[name]);

  return SHORT_KEYS[label] ?? label;
}

/** Returns `true` if `press` is the key `name`. */
export function pressedKey(press: KeyPress, name: VfxKey): boolean {
  return chordText(press) === VFX_KEYS[name];
}

/** Returns the event fields of the key `name`, for a command that runs what the key runs. */
export function keyEventOf(name: VfxKey): KeyboardEventInit {
  const parts: readonly string[] = VFX_KEYS[name].split("+");
  const key = parts.at(-1) ?? "";

  return {
    key: key === "Space" ? " " : key,
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
    bubbles: true,
    cancelable: true,
  };
}
