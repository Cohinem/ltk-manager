import type { Icon } from "@phosphor-icons/react";
import { type ReactNode, Suspense } from "react";

import type { CommandMenuCheck, CommandMenuCommand, CommandMenuSubmenu } from "@/modules/editor";

import type { PaneCommand } from "../../menus/state/paneCommands";
import { listedCommand } from "../utils/atlasCommands";

/** The class of a menu item's glyph. */
export const MENU_ICON = "size-4";

/** What `usePaneCommandLookup` returns. */
export type PaneLookup = (id: string) => PaneCommand | null;

/** The parts of an item that its offer does not hold. */
export interface OfferedOptions {
  readonly shortcut?: string;
  /** The reason that the item shows while no pane offers it. */
  readonly absent?: string;
  readonly danger?: boolean;
}

/** Returns the item of the command `id`, with the offer of the pane that `lookup` resolves. */
export function offered(
  lookup: PaneLookup,
  id: string,
  title: string,
  Glyph: Icon,
  options: OfferedOptions = {},
): CommandMenuCommand {
  const offer = lookup(id);

  return {
    kind: "command",
    id,
    title: offer?.title ?? title,
    icon: <Glyph className={MENU_ICON} />,
    shortcut: options.shortcut,
    run: offer?.run ?? null,
    reason: offer?.reason ?? options.absent,
    danger: options.danger,
  };
}

/** Returns `command` disabled with `reason` while `applies` is false. */
export function gated(
  command: CommandMenuCommand,
  applies: boolean,
  reason: string,
): CommandMenuCommand {
  return applies ? command : { ...command, run: null, reason };
}

/**
 * Returns the rows that the list command `list` offers.
 *
 * The rows run from 0 up to the first absent one. An empty list returns one disabled row titled
 * `empty`, with the reason of `list`.
 */
export function listedRows(
  lookup: PaneLookup,
  list: string,
  empty: string,
): (CommandMenuCommand | CommandMenuCheck)[] {
  const rows: (CommandMenuCommand | CommandMenuCheck)[] = [];

  for (let at = 0; ; at += 1) {
    const id = listedCommand(list, at);
    const offer = lookup(id);
    if (offer === null) break;

    rows.push(
      offer.checked === undefined
        ? { kind: "command", id, title: offer.title ?? id, run: offer.run }
        : { kind: "check", id, title: offer.title ?? id, checked: offer.checked, run: offer.run },
    );
  }

  if (rows.length > 0) return rows;

  return [
    { kind: "command", id: `${list}.none`, title: empty, run: null, reason: lookup(list)?.reason },
  ];
}

/** Returns a submenu whose items `node` draws while the submenu is open. */
export function slotSubmenu(
  id: string,
  title: string,
  Glyph: Icon,
  node: ReactNode,
): CommandMenuSubmenu {
  return {
    kind: "submenu",
    id,
    title,
    icon: <Glyph className={MENU_ICON} />,
    className: "w-56",
    items: [{ kind: "slot", id: `${id}.items`, node: <Suspense fallback={null}>{node}</Suspense> }],
  };
}
