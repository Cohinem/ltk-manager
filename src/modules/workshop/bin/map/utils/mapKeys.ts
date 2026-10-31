/**
 * The key of each map command, which the key handler answers and the menus show.
 *
 * Per "Keys" in docs/ux/MAP_EDITOR.md. The tools keep their `MapTool` name.
 */
export const MAP_KEYS = {
  select: "Q",
  move: "W",
  rotate: "E",
  scale: "R",
  place: "P",
  localAxes: "X",
  frameSelection: "F",
  hide: "H",
  showAll: "Alt+H",
  delete: "Del",
  duplicate: "Ctrl+D",
  rename: "F2",
  drop: "End",
  selectAll: "Ctrl+A",
  selectNone: "Esc",
} as const;

/** The key of the tab's save, which the editor answers rather than the map's handler. */
export const MAP_SAVE_KEY = "Ctrl+S";

/** A command that a key of the map answers. */
export type MapKeyCommand = keyof typeof MAP_KEYS;

/** The fields of a keyboard event that decide its command. */
export interface MapKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/** The `KeyboardEvent.key` of each key whose shown name differs from it. */
const EVENT_KEYS: Readonly<Record<string, string>> = { Del: "delete", Esc: "escape" };

const BINDINGS = (Object.entries(MAP_KEYS) as [MapKeyCommand, string][]).map(
  ([command, binding]) => {
    const parts = binding.split("+");
    const name = parts.at(-1) ?? binding;

    return {
      command,
      key: (EVENT_KEYS[name] ?? name).toLowerCase(),
      ctrl: parts.includes("Ctrl"),
      alt: parts.includes("Alt"),
    };
  },
);

/** Returns the command that `event` asks for, or null if it matches no entry of `MAP_KEYS`. */
export function mapKeyCommand(event: MapKeyEvent): MapKeyCommand | null {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  const found = BINDINGS.find(
    (binding) => binding.key === key && binding.ctrl === ctrl && binding.alt === event.altKey,
  );

  return found?.command ?? null;
}
