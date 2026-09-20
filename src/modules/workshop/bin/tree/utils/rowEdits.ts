import {
  ArrowDownIcon,
  ArrowUpIcon,
  type Icon,
  ListPlusIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ProhibitIcon,
  RowsPlusBottomIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";

import type { RowLine } from "./binRows";

/**
 * A structural edit a row offers. "Editing a list, a map, an option and a pointer" in
 * docs/ux/BIN_EDITOR.md.
 */
export type RowEdit =
  | "addProperty"
  | "addItem"
  | "addEntry"
  | "setValue"
  | "clearValue"
  | "setClass"
  | "setNull"
  | "insertAfter"
  | "moveUp"
  | "moveDown"
  | "removeItem"
  | "removeEntry"
  | "removeProperty";

/** The edits that stay in the menu rather than on a hover action. */
const MENU_ONLY: ReadonlySet<RowEdit> = new Set(["setNull", "moveUp", "moveDown"]);

/** Whether `edit` draws as a hover action of its row. */
export function onHover(edit: RowEdit): boolean {
  return !MENU_ONLY.has(edit);
}

/** The edits the row `line` draws offers, in the order its actions and its menu list them. */
export function rowEdits({
  row,
  parent,
  index,
}: Pick<RowLine, "row" | "parent" | "index">): RowEdit[] {
  const edits: RowEdit[] = [];
  const { value } = row;
  const within = parent?.value;
  const absent = value.type === "optional" && !value.present;

  if (value.type === "struct") edits.push("addProperty");
  if (value.type === "container") edits.push("addItem");
  if (value.type === "map") edits.push("addEntry");
  if (absent) edits.push("setValue");
  if ((row.kind === "option" && !absent) || within?.type === "optional") edits.push("clearValue");
  if (value.type === "null") edits.push("setClass");
  if (row.kind === "pointer" && value.type === "struct") edits.push("setNull");
  if (within?.type === "container") {
    edits.push("insertAfter");
    if (index > 0) edits.push("moveUp");
    if (index < within.len - 1) edits.push("moveDown");
    edits.push("removeItem");
  }
  if (within?.type === "map") edits.push("insertAfter", "removeEntry");
  if (row.node === "property") edits.push("removeProperty");
  return edits;
}

/**
 * Why a declared document refuses `edit` on `row`, or null where it takes it. "Declaring from
 * a game bin" in docs/ux/BIN_EDITOR.md.
 */
export function undeclarable(edit: RowEdit, row: Pick<BinRow, "unnamed" | "node">): string | null {
  if (row.node === "property" && row.unnamed) {
    return m["error.BIN_EDIT_REJECTED.namelessPath.description"]();
  }
  if (edit === "removeProperty") return m.workshop_bin_undeclarable_remove_property_hint();
  return null;
}

/** The edit a keystroke on a row asks for: `Alt+Up` and `Alt+Down` move, `Ctrl+Enter` inserts after. */
export function keyEdit(
  event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  edits: readonly RowEdit[],
): RowEdit | null {
  const command = event.ctrlKey || event.metaKey;
  let asked: RowEdit | null = null;
  if (event.altKey && !command && !event.shiftKey && event.key === "ArrowUp") asked = "moveUp";
  if (event.altKey && !command && !event.shiftKey && event.key === "ArrowDown") asked = "moveDown";
  if (command && !event.altKey && !event.shiftKey && event.key === "Enter") asked = "insertAfter";
  return asked !== null && edits.includes(asked) ? asked : null;
}

/** The glyph each edit draws on its action and its menu item. */
export const EDIT_ICON: Readonly<Record<RowEdit, Icon>> = {
  addProperty: PlusCircleIcon,
  addItem: ListPlusIcon,
  addEntry: ListPlusIcon,
  setValue: PlusCircleIcon,
  clearValue: XCircleIcon,
  setClass: PlusCircleIcon,
  setNull: ProhibitIcon,
  insertAfter: RowsPlusBottomIcon,
  moveUp: ArrowUpIcon,
  moveDown: ArrowDownIcon,
  removeItem: MinusCircleIcon,
  removeEntry: MinusCircleIcon,
  removeProperty: MinusCircleIcon,
};

/** The words each edit is labelled with. */
export function editLabel(edit: RowEdit): string {
  switch (edit) {
    case "addProperty":
      return m.workshop_bin_add_property_row_action();
    case "addItem":
      return m.workshop_bin_add_item_action();
    case "addEntry":
      return m.workshop_bin_add_entry_action();
    case "setValue":
      return m.workshop_bin_set_value_action();
    case "clearValue":
      return m.workshop_bin_clear_value_action();
    case "setClass":
      return m.workshop_bin_set_class_action();
    case "setNull":
      return m.workshop_bin_set_null_action();
    case "insertAfter":
      return m.workshop_bin_insert_after_action();
    case "moveUp":
      return m.workshop_bin_move_up_action();
    case "moveDown":
      return m.workshop_bin_move_down_action();
    case "removeItem":
      return m.workshop_bin_remove_item_action();
    case "removeEntry":
      return m.workshop_bin_remove_entry_action();
    case "removeProperty":
      return m.workshop_bin_remove_property_action();
  }
}
