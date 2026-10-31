import type { Icon } from "@phosphor-icons/react";
import { use } from "react";

import { m } from "@/i18n";
import type { CommandMenuCommand, CommandMenuEntry } from "@/modules/editor";

import { useObjectCommands } from "../../menus/hooks/useObjectMenus";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { type PaneCommand, usePaneCommandLookup } from "../../menus/state/paneCommands";
import { useEmitters } from "../inspector/state/emitterChoice";
import { VfxRunContext, type VfxRun } from "../playback/state/run";
import { RUN_ACTIONS, runSelection } from "../playback/utils/runActions";
import { useTimelineMarkers } from "../timeline/hooks/useTimelineMarkers";
import { type RunKey, type VfxKey, vfxShortcut } from "../utils/vfxKeys";

/** Returns the glyph of a menu item. */
export function glyph(Glyph: Icon | undefined) {
  return Glyph === undefined ? undefined : <Glyph className="size-4" />;
}

/** One item of a menu, whose words are read when the menu builds. */
export interface MenuRow {
  readonly id: string;
  readonly title: () => string;
  readonly icon?: Icon;
  readonly shortcut?: VfxKey;
  readonly danger?: boolean;
}

export type PaneLookup = (id: string) => PaneCommand | null;

/** Returns the item of a pane's command, listed disabled with `absent` while no pane offers it. */
export function paneCommand(lookup: PaneLookup, row: MenuRow, absent: string): CommandMenuCommand {
  const offer = lookup(row.id);

  return {
    kind: "command",
    id: row.id,
    title: offer?.title ?? row.title(),
    icon: glyph(row.icon),
    shortcut: offer === null || row.shortcut === undefined ? undefined : vfxShortcut(row.shortcut),
    run: offer?.run ?? null,
    reason: offer === null ? absent : offer.reason,
    danger: row.danger,
  };
}

/** Returns a switch that can run, or a disabled command that names why it cannot. */
export function toggle(item: {
  id: string;
  title: string;
  icon?: Icon;
  shortcut?: string;
  checked: boolean;
  run: (() => void) | null;
  reason: string | undefined;
}): CommandMenuEntry {
  const { id, title, shortcut, checked, run, reason } = item;
  const icon = glyph(item.icon);
  if (run === null) return { kind: "command", id, title, icon, run: null, reason };

  return { kind: "check", id, title, icon, shortcut, checked, run };
}

/** Returns the switch of a pane's command, listed disabled with `absent` while no pane offers it. */
export function paneToggle(lookup: PaneLookup, row: MenuRow, absent: string): CommandMenuEntry {
  const offer = lookup(row.id);

  return toggle({
    id: row.id,
    title: offer?.title ?? row.title(),
    icon: row.icon,
    checked: offer?.checked === true,
    run: offer?.run ?? null,
    reason: offer === null ? absent : offer.reason,
  });
}

/** Returns the offers of `commandOf(0)`, `commandOf(1)` and so on, up to the first one absent. */
export function offersOf(lookup: PaneLookup, commandOf: (at: number) => string): PaneCommand[] {
  const offers: PaneCommand[] = [];
  for (let offer = lookup(commandOf(0)); offer !== null; offer = lookup(commandOf(offers.length))) {
    offers.push(offer);
  }

  return offers;
}

/** What every menu of the bar reads: the panes' offers, the tab's mode and why an edit is refused. */
export interface MenuScope {
  readonly lookup: PaneLookup;
  readonly run: VfxRun | null;
  /** Why the document takes no edit, or undefined if it takes edits. */
  readonly readOnly: string | undefined;
  /** `true` unless the tab draws Properties. */
  readonly inLayout: boolean;
  /** The reason of a command that applies only while the tab draws the layout. */
  readonly viewReason: string;
}

/** Returns what every menu of the bar reads. */
export function useMenuScope(): MenuScope {
  const menu = use(ObjectMenuContext);
  const { reason: readOnly } = useObjectCommands();

  return {
    lookup: usePaneCommandLookup(),
    run: use(VfxRunContext),
    readOnly,
    inLayout: menu?.mode !== "properties",
    viewReason: m.workshop_bin_menu_vfx_view_reason({ view: menu?.layoutTitle ?? "" }),
  };
}

/** One command of the run, with the key that `RunKeys` answers. */
export interface RunRow {
  readonly key: RunKey;
  readonly title: () => string;
  readonly icon: Icon;
}

/** What the run menus read: each key's action, its emitters and why the run does not apply. */
export interface RunCommands {
  /** The pool indices of the emitters that solo and mute act on. */
  readonly chosen: readonly number[];
  /** The reason of a command of the run, or undefined if the run applies. */
  readonly reason: string | undefined;
  readonly action: (key: RunKey) => (() => void) | null;
  readonly shortcut: (key: RunKey) => string | undefined;
  readonly item: (row: RunRow) => CommandMenuCommand;
}

/** Returns the run's commands, which run the keys' own actions. */
export function useRunCommands({ run, inLayout, viewReason }: MenuScope): RunCommands {
  const { cards, root, selected } = useEmitters();
  const markers = useTimelineMarkers();

  const live = run !== null && inLayout ? run : null;
  const chosen = live === null ? [] : runSelection(live.system, cards, root, selected);
  const reason = live === null ? viewReason : undefined;

  const action = (key: RunKey) =>
    live === null ? null : () => RUN_ACTIONS[key](live, chosen, markers);
  const shortcut = (key: RunKey) => (live === null ? undefined : vfxShortcut(key));

  return {
    chosen,
    reason,
    action,
    shortcut,
    item: (row) => ({
      kind: "command",
      id: `run.${row.key}`,
      title: row.title(),
      icon: glyph(row.icon),
      shortcut: shortcut(row.key),
      run: action(row.key),
      reason,
    }),
  };
}
