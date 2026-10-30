import type { NodeParent } from "@/lib/tauri";

import { REPLACE_EXTENSIONS } from "./mediaReplace";

/** A row's place in a list that a drag reorders: a random container's playlist or a situation. */
export interface ListPlace {
  /** The list, as the caller names it. Two rows reorder only within one list. */
  readonly list: string;
  readonly index: number;
}

/** What a drag carries. */
export type DragPayload =
  /** A file on disk, from the OS or from the content tree. */
  | { readonly kind: "file"; readonly path: string }
  /** A row of a list, which a drop moves to another place of its list. */
  | { readonly kind: "row"; readonly key: string; readonly place: ListPlace | null }
  /** A named event of an event bank. */
  | { readonly kind: "event"; readonly name: string };

/** The row under a drop, as the drop reads it. */
export type DropSlot =
  /** A voice or a sound row. `source` is the media it plays, null if the media takes no replacement. */
  | {
      readonly kind: "sound";
      readonly key: string;
      readonly source: number | null;
      readonly place: ListPlace | null;
    }
  /** A header or a container row. */
  | { readonly kind: "container"; readonly key: string; readonly place: ListPlace | null }
  /** An add row, which an imported file joins. */
  | { readonly kind: "add"; readonly key: string; readonly into: NodeParent }
  /** A rule of the Voice lines view. */
  | { readonly kind: "rule"; readonly key: string; readonly place: ListPlace };

/** What a drop does. */
export type DropAction =
  | { readonly kind: "replace"; readonly source: number; readonly file: string }
  | { readonly kind: "import"; readonly into: NodeParent; readonly file: string }
  | { readonly kind: "move"; readonly key: string; readonly list: string; readonly index: number }
  | { readonly kind: "target"; readonly rule: string; readonly name: string };

/** The verb and the category that every voice-over event name of a rule starts with. */
const VO_PREFIX = "play_vo_";

/** Returns `text` without `prefix` and the `_` after it, compared in lower case, or null. */
function after(text: string, prefix: string): string | null {
  const head = `${prefix.toLowerCase()}_`;
  return text.toLowerCase().startsWith(head) ? text.slice(head.length) : null;
}

/**
 * Returns the short name that makes a rule play `event`, read back from the composition of
 * `compose_vo_names`: `Play_vo_<tag>_<name>`, or `Play_vo_<tag>_<spell>_<name>` for a rule with a
 * spell condition.
 *
 * The longest tag of `tags` that the name holds wins. Returns null if no tag composes the name.
 */
export function ruleShortName(
  event: string,
  tags: readonly string[],
  spell: string | null,
): string | null {
  if (!event.toLowerCase().startsWith(VO_PREFIX)) return null;

  const rest = event.slice(VO_PREFIX.length);
  const byLength = [...tags].sort((a, b) => b.length - a.length);
  for (const tag of byLength) {
    const named = after(rest, tag);
    const short = named === null || spell === null ? named : after(named, spell);
    if (short !== null && short !== "") return short;
  }

  return null;
}

/** Returns the extension of `path` in lower case, without the dot. */
function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

/**
 * Returns what dropping `payload` on `slot` does, or null if the slot takes no such drop.
 *
 * Per "Keys and gestures" in docs/ux/AUDIO.md.
 */
export function dropAction(payload: DragPayload, slot: DropSlot): DropAction | null {
  if (payload.kind === "file" && slot.kind === "sound" && slot.source !== null) {
    const replaces = (REPLACE_EXTENSIONS as readonly string[]).includes(extension(payload.path));
    return replaces ? { kind: "replace", source: slot.source, file: payload.path } : null;
  }

  if (payload.kind === "file" && slot.kind === "add") {
    return extension(payload.path) === "wem"
      ? { kind: "import", into: slot.into, file: payload.path }
      : null;
  }

  if (payload.kind === "row" && slot.kind !== "add") {
    const from = payload.place;
    const to = slot.place;
    if (from === null || to === null || from.list !== to.list || from.index === to.index) {
      return null;
    }

    return { kind: "move", key: payload.key, list: to.list, index: to.index };
  }

  if (payload.kind === "event" && slot.kind === "rule") {
    return { kind: "target", rule: slot.key, name: payload.name };
  }

  return null;
}
