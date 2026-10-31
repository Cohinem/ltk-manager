import { DiceFiveIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { CommandMenu } from "@/modules/editor";
import { MENU_SEPARATOR } from "@/modules/editor";

import { curveChannelCommand, VFX_COMMAND } from "../utils/vfxCommands";
import { type MenuRow, type MenuScope, offersOf, paneCommand, paneToggle } from "./menuItems";

const KEY_ROWS: readonly MenuRow[] = [
  { id: VFX_COMMAND.keyAdd, title: m.workshop_bin_curve_add_key_action, icon: PlusIcon },
  {
    id: VFX_COMMAND.keyDelete,
    title: m.workshop_bin_curve_delete_key_action,
    icon: TrashIcon,
    shortcut: "curveKeyDelete",
    danger: true,
  },
];

const RANDOM_ROWS: readonly MenuRow[] = [
  { id: VFX_COMMAND.randomAdd, title: m.workshop_bin_random_add_action, icon: DiceFiveIcon },
  { id: VFX_COMMAND.randomRemove, title: m.workshop_bin_random_remove_action, icon: DiceFiveIcon },
];

const TAB_ROWS: readonly MenuRow[] = [
  { id: VFX_COMMAND.curveGraph, title: m.workshop_bin_curve_tab_graph_label },
  { id: VFX_COMMAND.curveTable, title: m.workshop_bin_curve_tab_table_label },
];

/** Returns the Curve menu, whose every item is an offer of the curve surface. */
export function useCurveMenu({ lookup }: MenuScope): CommandMenu {
  const absent = m.workshop_bin_menu_vfx_curve_reason();
  const channels = offersOf(lookup, curveChannelCommand);

  return {
    id: "curve",
    title: m.workshop_bin_menu_vfx_curve_label(),
    className: "w-56",
    items: [
      ...KEY_ROWS.map((row) => paneCommand(lookup, row, absent)),
      MENU_SEPARATOR,
      ...RANDOM_ROWS.map((row) => paneCommand(lookup, row, absent)),
      MENU_SEPARATOR,
      channels.length > 0 && {
        kind: "submenu",
        id: "curve.channels",
        title: m.workshop_bin_menu_vfx_channels_label(),
        className: "w-36",
        items: channels.map((offer, at) => ({
          kind: "check",
          id: curveChannelCommand(at),
          title: offer.title ?? String(at),
          checked: offer.checked === true,
          run: offer.run,
        })),
      },
      MENU_SEPARATOR,
      ...TAB_ROWS.map((row) => paneToggle(lookup, row, absent)),
    ],
  };
}
