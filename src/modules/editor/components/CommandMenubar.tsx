import { Fragment, type ReactNode, type RefObject, useMemo, useRef } from "react";

import { Menu, Menubar, type MenubarMenu } from "@/components";

import { type DocumentCommand, useDocumentCommands } from "../state/documentCommands";
import {
  type CommandMenu,
  type CommandMenuCommand,
  type CommandMenuEntry,
  compactMenuItems,
  compactMenus,
  flattenMenuCommands,
} from "../utils/commandMenu";

interface CommandMenubarProps {
  readonly menus: readonly CommandMenu[];
  readonly "aria-label": string;
  /** The document, whose focus Alt and F10 move to the bar. */
  readonly keyScope?: RefObject<HTMLElement | null>;
  /** The document that offers the commands of the bar to the palette. */
  readonly documentId?: string | null;
  /** The group that the palette lists the commands under. */
  readonly paletteGroup?: string;
  /** What the bar draws after its titles, such as a status chip. */
  readonly end?: ReactNode;
  readonly "data-ui"?: string;
}

/**
 * A `Menubar` drawn from a table of commands, which also offers them to the palette.
 *
 * Each caller builds `menus` from the state it reads, so each item shows what applies now.
 */
export function CommandMenubar({
  menus,
  "aria-label": label,
  keyScope,
  documentId = null,
  paletteGroup = "",
  end,
  "data-ui": dataUi,
}: CommandMenubarProps) {
  const kept = compactMenus(menus);
  useMenuPalette(documentId, kept, paletteGroup);

  const drawn: MenubarMenu[] = kept.map((menu) => ({
    id: menu.id,
    title: menu.title,
    className: menu.className,
    content: <CommandMenuItems items={menu.items} />,
  }));

  return (
    <Menubar menus={drawn} aria-label={label} keyScope={keyScope} end={end} data-ui={dataUi} />
  );
}

/**
 * Offers the runnable commands of `menus` to the palette while `documentId` is mounted.
 *
 * A command runs through the latest table, so a fresh closure per render costs no republish.
 */
function useMenuPalette(
  documentId: string | null,
  menus: readonly CommandMenu[],
  group: string,
): void {
  const flat = flattenMenuCommands(menus).filter((command) => command.run !== null);
  const latest = useRef(flat);
  latest.current = flat;

  const signature = flat
    .map((command) => `${command.id}\u0000${command.title}\u0000${command.shortcut ?? ""}`)
    .join("\u0001");
  const offered = useMemo<readonly DocumentCommand[]>(
    () =>
      latest.current.map((command) => ({
        id: `menu.${command.id}`,
        title: command.title,
        group: group || command.menu,
        shortcut: command.shortcut,
        run: () => latest.current.find((each) => each.id === command.id)?.run?.(),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for the table
    [signature, group],
  );
  useDocumentCommands(documentId, offered);
}

/** The items of one built menu or submenu. */
export function CommandMenuItems({ items }: { items: readonly CommandMenuEntry[] }) {
  return compactMenuItems(items).map((item, at) => {
    switch (item.kind) {
      case "separator":
        return <Menu.Separator key={`separator:${at}`} />;
      case "slot":
        return <Fragment key={item.id}>{item.node}</Fragment>;
      case "command":
        return <CommandItem key={item.id} command={item} />;
      case "check":
        return (
          <Menu.CheckboxItem
            key={item.id}
            icon={item.icon}
            shortcut={item.shortcut}
            checked={item.checked}
            disabled={item.run === null}
            onCheckedChange={() => item.run?.()}
          >
            {item.title}
          </Menu.CheckboxItem>
        );
      case "radio":
        return (
          <Menu.RadioGroup
            key={item.id}
            value={item.value}
            onValueChange={(next) => item.onPick(next as string)}
          >
            {item.options.map((option) => (
              <Menu.RadioItem
                key={option.value}
                value={option.value}
                icon={option.icon}
                shortcut={option.shortcut}
                disabled={option.disabled}
              >
                {option.title}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        );
      case "submenu":
        return (
          <Menu.SubmenuRoot key={item.id}>
            <Menu.SubmenuTrigger icon={item.icon}>{item.title}</Menu.SubmenuTrigger>
            <Menu.SubmenuContent className={item.className}>
              <CommandMenuItems items={item.items} />
            </Menu.SubmenuContent>
          </Menu.SubmenuRoot>
        );
    }
  });
}

/** One command as a menu item, with its glyph, its key and the reason it is disabled. */
function CommandItem({ command }: { command: CommandMenuCommand }) {
  const { run } = command;

  return (
    <Menu.Item
      icon={command.icon}
      shortcut={command.shortcut}
      variant={command.danger === true ? "danger" : "default"}
      disabled={run === null}
      reason={command.reason}
      /* The menu is still closing, and it hands focus back first. */
      onClick={() => run !== null && setTimeout(run, 0)}
    >
      {command.title}
    </Menu.Item>
  );
}
