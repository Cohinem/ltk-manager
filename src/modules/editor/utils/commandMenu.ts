import type { ReactNode } from "react";

/** One command of a menu. `run` is null while the command does not apply. */
export interface CommandMenuCommand {
  readonly kind: "command";
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly shortcut?: string;
  readonly run: (() => void) | null;
  /** The reason that a disabled command shows under its title. */
  readonly reason?: string;
  readonly danger?: boolean;
}

/** One switch of a menu. `run` is null while the switch does not apply. */
export interface CommandMenuCheck {
  readonly kind: "check";
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly shortcut?: string;
  readonly checked: boolean;
  readonly run: (() => void) | null;
}

/** One choice of a `CommandMenuRadio`. */
export interface CommandMenuOption {
  readonly value: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly shortcut?: string;
  readonly disabled?: boolean;
}

/** A group of choices of which one is current. */
export interface CommandMenuRadio {
  readonly kind: "radio";
  readonly id: string;
  readonly value: string | null;
  readonly options: readonly CommandMenuOption[];
  readonly onPick: (value: string) => void;
}

/** A submenu. A submenu whose entries all drop is dropped too. */
export interface CommandMenuSubmenu {
  readonly kind: "submenu";
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly className?: string;
  readonly items: readonly CommandMenuEntry[];
}

/** Items that a component draws, built of `Menu` parts. The bar mounts them while the menu is open. */
export interface CommandMenuSlot {
  readonly kind: "slot";
  readonly id: string;
  readonly node: ReactNode;
}

export interface CommandMenuSeparator {
  readonly kind: "separator";
}

export type CommandMenuItem =
  | CommandMenuCommand
  | CommandMenuCheck
  | CommandMenuRadio
  | CommandMenuSubmenu
  | CommandMenuSlot
  | CommandMenuSeparator;

/** One entry as a caller writes it. A falsy entry does not apply to this document and drops. */
export type CommandMenuEntry = CommandMenuItem | null | false | undefined;

/** One menu of a command menu bar. A menu whose entries all drop is left out of the bar. */
export interface CommandMenu {
  readonly id: string;
  readonly title: string;
  readonly items: readonly CommandMenuEntry[];
  readonly className?: string;
}

/** One action of a menu as the palette and the keys sheet list it. */
export interface FlatMenuCommand {
  readonly id: string;
  readonly title: string;
  readonly menu: string;
  readonly shortcut?: string;
  readonly run: (() => void) | null;
}

export const MENU_SEPARATOR: CommandMenuSeparator = { kind: "separator" };

/**
 * Returns the entries of `entries` that apply, with one separator between two groups.
 *
 * Drops falsy entries, empty submenus, and leading, trailing and repeated separators.
 */
export function compactMenuItems(entries: readonly CommandMenuEntry[]): CommandMenuItem[] {
  const kept: CommandMenuItem[] = [];

  for (const entry of entries) {
    if (entry === null || entry === false || entry === undefined) continue;

    if (entry.kind === "separator") {
      if (kept.length > 0 && kept.at(-1)?.kind !== "separator") kept.push(entry);
      continue;
    }

    if (entry.kind === "submenu") {
      const items = compactMenuItems(entry.items);
      if (items.length > 0) kept.push({ ...entry, items });
      continue;
    }

    kept.push(entry);
  }

  if (kept.at(-1)?.kind === "separator") kept.pop();

  return kept;
}

/** Returns `menus` with their entries compacted, without the menus that hold no entry. */
export function compactMenus(menus: readonly CommandMenu[]): CommandMenu[] {
  return menus
    .map((menu) => ({ ...menu, items: compactMenuItems(menu.items) }))
    .filter((menu) => menu.items.length > 0);
}

/** Returns every command, switch and choice of `menus`, in menu order. A slot lists nothing. */
export function flattenMenuCommands(menus: readonly CommandMenu[]): FlatMenuCommand[] {
  return menus.flatMap((menu) => flattenItems(menu.items, menu.title));
}

function flattenItems(entries: readonly CommandMenuEntry[], menu: string): FlatMenuCommand[] {
  return compactMenuItems(entries).flatMap((item): FlatMenuCommand[] => {
    switch (item.kind) {
      case "command":
      case "check":
        return [{ id: item.id, title: item.title, menu, shortcut: item.shortcut, run: item.run }];
      case "radio":
        return item.options.map((option) => ({
          id: `${item.id}:${option.value}`,
          title: option.title,
          menu,
          shortcut: option.shortcut,
          run: option.disabled === true ? null : () => item.onPick(option.value),
        }));
      case "submenu":
        return flattenItems(item.items, menu);
      case "slot":
      case "separator":
        return [];
    }
  });
}
