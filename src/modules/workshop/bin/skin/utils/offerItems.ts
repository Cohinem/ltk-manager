import type { ReactNode } from "react";

import type { CommandMenuEntry, CommandMenuItem } from "@/modules/editor";

import type { PaneCommand } from "../../menus/state/paneCommands";

export const MENU_ICON = "size-4";
const LONG_LIST = "max-h-96 w-72 overflow-y-auto scrollbar-md";

/** Returns the offer of a command id that a pane of the enclosing tab makes now. */
export type Lookup = (id: string) => PaneCommand | null;

/** Returns the command of `offer`, disabled with `blocked` or the reason of the offer. */
export function offerCommand(
  id: string,
  title: string,
  icon: ReactNode,
  offer: PaneCommand | null,
  blocked: string | null | undefined,
  fallback?: string,
): CommandMenuItem {
  return {
    kind: "command",
    id,
    title: offer?.title ?? title,
    icon,
    run: blocked == null ? (offer?.run ?? null) : null,
    reason: blocked ?? offer?.reason ?? fallback,
  };
}

/** Returns the switch of `offer`, disabled with `blocked`. */
export function offerCheck(
  id: string,
  title: string,
  icon: ReactNode,
  offer: PaneCommand | null,
  blocked: string | null | undefined,
): CommandMenuItem {
  return {
    kind: "check",
    id,
    title: offer?.title ?? title,
    icon,
    checked: offer?.checked === true,
    run: blocked == null ? (offer?.run ?? null) : null,
  };
}

/** Returns a submenu of `items`, or one disabled command with the reason it cannot open. */
export function listSubmenu(
  id: string,
  title: string,
  icon: ReactNode,
  items: readonly CommandMenuEntry[],
  blocked: string | null | undefined,
  empty: string,
): CommandMenuItem {
  if (blocked != null || items.length === 0) {
    return { kind: "command", id, title, icon, run: null, reason: blocked ?? empty };
  }

  return { kind: "submenu", id, title, icon, className: LONG_LIST, items };
}

/** Returns one command per offer of `offers`, each titled by its offer. */
export function offerCommands(
  id: string,
  offers: readonly PaneCommand[],
  options: { readonly danger?: boolean; readonly front?: (run: () => void) => () => void } = {},
): CommandMenuEntry[] {
  return offers.map((offer, at) => ({
    kind: "command",
    id: `${id}.${at}`,
    title: offer.title ?? "",
    run: offer.run === null || options.front === undefined ? offer.run : options.front(offer.run),
    reason: offer.reason,
    danger: options.danger,
  }));
}
