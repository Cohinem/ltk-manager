import { KeyboardIcon } from "@phosphor-icons/react";
import { type ReactNode, use, useMemo, useState } from "react";

import { Dialog, Kbd } from "@/components";
import { m } from "@/i18n";
import {
  type CommandMenu,
  CommandMenubar,
  flattenMenuCommands,
  MENU_SEPARATOR,
} from "@/modules/editor";

import { ShellHeaderPortal } from "../../shell/state/shellHeader";
import { useObjectMenus } from "../hooks/useObjectMenus";
import { ObjectMenuContext } from "../state/objectMenu";

/** One key or gesture that the keys sheet lists although no menu item runs it. */
export interface ExtraKey {
  readonly keys: string;
  readonly title: string;
}

interface ClassMenubarProps {
  readonly menus: readonly CommandMenu[];
  /** The keys and gestures of the view that no menu item shows. */
  readonly extraKeys?: readonly ExtraKey[];
  /** What the bar draws after its titles, such as a status chip. */
  readonly end?: ReactNode;
}

/** Keeps a key of the bar away from the view around it, whose keys a React parent answers. */
function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/**
 * The menu bar of an object tab, in the tab's header row. "Menu bar" in docs/ux/BIN_EDITOR.md.
 *
 * Mounted inside the scope of the view it serves and portaled up, so its items read the same
 * contexts as the view's own controls. Appends Keys and gestures to the View menu, which lists
 * what `menus` and `extraKeys` bind.
 */
export function ClassMenubar({ menus, extraKeys = [], end }: ClassMenubarProps) {
  const menu = use(ObjectMenuContext);
  const [sheet, setSheet] = useState(false);

  const shown = useMemo(
    () =>
      menus.map((each) =>
        each.id === "view"
          ? {
              ...each,
              items: [
                ...each.items,
                MENU_SEPARATOR,
                {
                  kind: "command" as const,
                  id: "keys",
                  title: m.workshop_bin_menu_keys_action(),
                  icon: <KeyboardIcon className="size-4" />,
                  run: () => setSheet(true),
                },
              ],
            }
          : each,
      ),
    [menus],
  );

  return (
    <ShellHeaderPortal slot="menubar">
      <div
        className="contents"
        onKeyDown={stopPropagation}
        onKeyUp={stopPropagation}
        onContextMenu={stopPropagation}
      >
        <CommandMenubar
          menus={shown}
          aria-label={m.workshop_bin_menu_bar_label()}
          keyScope={menu?.keyScope}
          documentId={menu?.documentId ?? null}
          end={end}
          data-ui="ClassMenubar"
        />
        <KeysSheet open={sheet} onClose={() => setSheet(false)} menus={shown} extra={extraKeys} />
      </div>
    </ShellHeaderPortal>
  );
}

interface KeysSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly menus: readonly CommandMenu[];
  readonly extra: readonly ExtraKey[];
}

/** The keys of a bar and of the gestures it does not list, by menu. */
function KeysSheet({ open, onClose, menus, extra }: KeysSheetProps) {
  const groups = keyGroups(menus, extra);

  return (
    <Dialog.Shell open={open} onClose={onClose} title={m.workshop_bin_menu_keys_title()} size="md">
      <Dialog.Body>
        <div data-ui="ClassMenubar:keys" className="flex flex-col gap-4 select-none">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-1">
              <h3 className="text-meta font-medium text-surface-300">{group.title}</h3>
              {group.rows.map((row) => (
                <div
                  key={`${row.title}:${row.keys}`}
                  className="flex items-center justify-between gap-3 text-row text-surface-200"
                >
                  <span className="min-w-0 truncate">{row.title}</span>
                  <Kbd shortcut={row.keys} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </Dialog.Body>
    </Dialog.Shell>
  );
}

/** One section of the keys sheet. */
interface KeyGroup {
  readonly title: string;
  readonly rows: readonly ExtraKey[];
}

/** Returns the bound commands of `menus` by menu, then `extra`. A menu without a key is left out. */
function keyGroups(menus: readonly CommandMenu[], extra: readonly ExtraKey[]): KeyGroup[] {
  const groups = new Map<string, ExtraKey[]>();
  for (const command of flattenMenuCommands(menus)) {
    if (command.shortcut === undefined) continue;

    const rows = groups.get(command.menu) ?? [];
    rows.push({ keys: command.shortcut, title: command.title });
    groups.set(command.menu, rows);
  }

  const listed = [...groups].map(([title, rows]) => ({ title, rows }));
  if (extra.length === 0) return listed;

  return [...listed, { title: m.workshop_bin_menu_gestures_label(), rows: extra }];
}

/** The bar of a class that draws no controls of its own: File, Edit and View. */
export function ObjectMenubar() {
  const base = useObjectMenus();

  return <ClassMenubar menus={[base.file(), base.edit(), base.view()]} />;
}
