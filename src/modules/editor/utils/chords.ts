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
