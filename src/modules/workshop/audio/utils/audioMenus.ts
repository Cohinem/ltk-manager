/**
 * The menus of the menu bar of the audio file document, built from the keymap.
 *
 * Each item names a command of `AUDIO_KEYMAP`, so the menus show the keys that the handlers
 * answer, and a command is listed only on a document that has a surface of it. Per "Menu bar" in
 * docs/ux/AUDIO.md.
 */
import { type AudioCommandId, type AudioSurface, bindingOf, shortcutOf } from "./keymap";

/** The id of one menu of the bar, in bar order. */
export type AudioMenuId = "file" | "edit" | "insert" | "view" | "playback" | "bank" | "voice";

/** A place in a menu whose items the document draws itself. */
export type AudioMenuSlot = "fileActions" | "editActions" | "viewActions" | "units" | "volume";

/** One entry of the table of a menu. */
export type AudioMenuSpec =
  | { readonly kind: "command"; readonly id: AudioCommandId }
  | { readonly kind: "check"; readonly id: AudioCommandId }
  | { readonly kind: "radio"; readonly ids: readonly AudioCommandId[] }
  | {
      readonly kind: "submenu";
      readonly id: AudioSubmenuId;
      readonly entries: readonly AudioMenuSpec[];
    }
  | { readonly kind: "separator" }
  | { readonly kind: "slot"; readonly slot: AudioMenuSlot };

/** The id of a submenu, which names its title. */
export type AudioSubmenuId = "addContainer";

const command = (id: AudioCommandId): AudioMenuSpec => ({ kind: "command", id });
const SEPARATOR: AudioMenuSpec = { kind: "separator" };

/** The menus of the bar and their entries, in order. */
export const AUDIO_MENU_SPEC: readonly {
  readonly id: AudioMenuId;
  readonly entries: readonly AudioMenuSpec[];
}[] = [
  {
    id: "file",
    entries: [
      command("save"),
      SEPARATOR,
      { kind: "slot", slot: "fileActions" },
      SEPARATOR,
      command("details"),
    ],
  },
  {
    id: "edit",
    entries: [
      command("undo"),
      command("redo"),
      SEPARATOR,
      command("duplicate"),
      command("wrap"),
      command("cut"),
      command("paste"),
      command("remove"),
      SEPARATOR,
      command("moveUp"),
      command("moveDown"),
      SEPARATOR,
      command("copy"),
      SEPARATOR,
      command("rename"),
      command("reset"),
      SEPARATOR,
      command("selectAll"),
      SEPARATOR,
      { kind: "slot", slot: "editActions" },
    ],
  },
  {
    id: "insert",
    entries: [
      command("newEvent"),
      command("add"),
      SEPARATOR,
      command("addSound"),
      {
        kind: "submenu",
        id: "addContainer",
        entries: [command("addRandom"), command("addSequence"), command("addSwitch")],
      },
      command("importWem"),
    ],
  },
  {
    id: "view",
    entries: [
      { kind: "slot", slot: "viewActions" },
      SEPARATOR,
      { kind: "radio", ids: ["viewMedia", "viewEvents"] },
      { kind: "check", id: "toggleInspector" },
      SEPARATOR,
      command("expandAll"),
      command("collapseAll"),
      SEPARATOR,
      command("find"),
      command("help"),
    ],
  },
  {
    id: "playback",
    entries: [
      command("play"),
      command("playAll"),
      command("stop"),
      SEPARATOR,
      { kind: "check", id: "loop" },
      SEPARATOR,
      command("volumeUp"),
      command("volumeDown"),
      { kind: "slot", slot: "volume" },
    ],
  },
  {
    id: "bank",
    entries: [{ kind: "slot", slot: "units" }, SEPARATOR, command("replaceMedia")],
  },
  {
    id: "voice",
    entries: [
      command("addChance"),
      command("removeChance"),
      { kind: "check", id: "pickRandom" },
      SEPARATOR,
      command("createEvent"),
      command("showInBank"),
      command("showInTree"),
      SEPARATOR,
      command("copyForSkin"),
    ],
  },
];

/** What the document knows of its commands and slots now. */
export interface AudioMenuFacts {
  /** The surfaces of the document. A command of no surface of these is left out. */
  readonly surfaces: readonly AudioSurface[];
  /** The commands that run now. A listed command that is absent is disabled. */
  readonly commands: Partial<Record<AudioCommandId, () => void>>;
  /** The state of each check and radio command that is on. */
  readonly checked: Partial<Record<AudioCommandId, boolean>>;
  /** The reason that a disabled command shows, where the reader cannot see it. */
  readonly reasons: Partial<Record<AudioCommandId, string>>;
  /** The slots that the document fills. */
  readonly slots: readonly AudioMenuSlot[];
  /** The commands that never apply to the document, such as Save of a file without edits. */
  readonly hidden: readonly AudioCommandId[];
}

/** One command of a built menu. */
export interface AudioMenuCommand {
  readonly id: AudioCommandId;
  readonly shortcut: string | null;
  /** Runs the command, or null while it is disabled. */
  readonly run: (() => void) | null;
  readonly checked: boolean;
  /** The reason of a disabled command, or null. */
  readonly reason: string | null;
}

/** One entry of a built menu. */
export type AudioMenuEntry =
  | { readonly kind: "command"; readonly command: AudioMenuCommand }
  | { readonly kind: "check"; readonly command: AudioMenuCommand }
  | { readonly kind: "radio"; readonly commands: readonly AudioMenuCommand[] }
  | {
      readonly kind: "submenu";
      readonly id: AudioSubmenuId;
      readonly entries: readonly AudioMenuEntry[];
    }
  | { readonly kind: "separator" }
  | { readonly kind: "slot"; readonly slot: AudioMenuSlot };

/** One built menu of the bar. */
export interface AudioMenu {
  readonly id: AudioMenuId;
  readonly entries: readonly AudioMenuEntry[];
}

/** Returns the menus of a document with `facts`, each with the entries that apply to it. */
export function audioMenus(facts: AudioMenuFacts): AudioMenu[] {
  return AUDIO_MENU_SPEC.map((menu) => ({
    id: menu.id,
    entries: buildEntries(menu.entries, facts),
  })).filter((menu) => menu.entries.length > 0);
}

/** Returns the entries of `specs` that apply, with one separator between two kept groups. */
function buildEntries(specs: readonly AudioMenuSpec[], facts: AudioMenuFacts): AudioMenuEntry[] {
  const groups: AudioMenuEntry[][] = [[]];
  for (const spec of specs) {
    if (spec.kind === "separator") {
      groups.push([]);
      continue;
    }

    groups.at(-1)?.push(...buildEntry(spec, facts));
  }

  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, at) => (at === 0 ? group : [{ kind: "separator" as const }, ...group]));
}

function buildEntry(entry: AudioMenuSpec, facts: AudioMenuFacts): AudioMenuEntry[] {
  switch (entry.kind) {
    case "command":
    case "check": {
      if (!listed(entry.id, facts)) return [];

      return [{ kind: entry.kind, command: buildCommand(entry.id, facts) }];
    }
    case "radio": {
      const commands = entry.ids.filter((id) => listed(id, facts));
      return commands.length === 0
        ? []
        : [{ kind: "radio", commands: commands.map((id) => buildCommand(id, facts)) }];
    }
    case "submenu": {
      const entries = buildEntries(entry.entries, facts);
      return entries.length === 0 ? [] : [{ kind: "submenu", id: entry.id, entries }];
    }
    case "slot":
      return facts.slots.includes(entry.slot) ? [entry] : [];
    case "separator":
      return [];
  }
}

/** Returns `true` if a surface of the document answers `id` and the document does not hide it. */
function listed(id: AudioCommandId, facts: AudioMenuFacts): boolean {
  if (facts.hidden.includes(id)) return false;

  return bindingOf(id).surfaces.some((surface) => facts.surfaces.includes(surface));
}

function buildCommand(id: AudioCommandId, facts: AudioMenuFacts): AudioMenuCommand {
  const run = facts.commands[id] ?? null;

  return {
    id,
    shortcut: shortcutOf(id),
    run,
    checked: facts.checked[id] === true,
    reason: run === null ? (facts.reasons[id] ?? null) : null,
  };
}
