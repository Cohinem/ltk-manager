import {
  ArrowCounterClockwiseIcon,
  ArrowsInIcon,
  ArrowsInSimpleIcon,
  ArrowsLeftRightIcon,
  ArrowsOutSimpleIcon,
  CircleHalfIcon,
  CopyIcon,
  CopySimpleIcon,
  CornersOutIcon,
  HashIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapTrifoldIcon,
  MonitorPlayIcon,
  RepeatIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { CommandMenu, CommandMenuEntry } from "@/modules/editor";
import { MENU_SEPARATOR } from "@/modules/editor";

import { nodeClassCommand, VFX_COMMAND } from "../utils/vfxCommands";
import {
  glyph,
  type MenuRow,
  type MenuScope,
  offersOf,
  paneCommand,
  paneToggle,
} from "./menuItems";

const VIEW_ROWS: readonly MenuRow[] = [
  {
    id: VFX_COMMAND.zoomIn,
    title: m.workshop_bin_graph_zoom_in_action,
    icon: MagnifyingGlassPlusIcon,
  },
  {
    id: VFX_COMMAND.zoomOut,
    title: m.workshop_bin_graph_zoom_out_action,
    icon: MagnifyingGlassMinusIcon,
  },
  { id: VFX_COMMAND.graphFit, title: m.workshop_bin_graph_fit_action, icon: CornersOutIcon },
];

const COLLAPSE_ROWS: readonly MenuRow[] = [
  {
    id: VFX_COMMAND.collapseAll,
    title: m.workshop_bin_graph_collapse_all_action,
    icon: ArrowsInSimpleIcon,
  },
  {
    id: VFX_COMMAND.expandAll,
    title: m.workshop_bin_graph_expand_all_action,
    icon: ArrowsOutSimpleIcon,
  },
];

const SWITCH_ROWS: readonly MenuRow[] = [
  {
    id: VFX_COMMAND.graphPreview,
    title: m.workshop_bin_menu_vfx_graph_preview_label,
    icon: MonitorPlayIcon,
  },
  {
    id: VFX_COMMAND.surfaceLoop,
    title: m.workshop_bin_graph_surface_loop_action,
    icon: RepeatIcon,
  },
  { id: VFX_COMMAND.minimap, title: m.workshop_bin_menu_vfx_minimap_label, icon: MapTrifoldIcon },
];

const BOARD_ROWS: readonly MenuRow[] = [
  { id: VFX_COMMAND.backdrop, title: m.workshop_bin_menu_vfx_backdrop_label, icon: CircleHalfIcon },
  {
    id: VFX_COMMAND.resetLayout,
    title: m.workshop_bin_graph_reset_layout_action,
    icon: ArrowCounterClockwiseIcon,
  },
];

const NODE_ROWS: readonly MenuRow[] = [
  { id: VFX_COMMAND.frame, title: m.workshop_bin_graph_frame_action, icon: CornersOutIcon },
  {
    id: VFX_COMMAND.collapseNode,
    title: m.workshop_bin_graph_collapse_action,
    icon: ArrowsInSimpleIcon,
  },
  {
    id: VFX_COMMAND.collapseOthers,
    title: m.workshop_bin_graph_collapse_others_action,
    icon: ArrowsInIcon,
  },
];

const CLASS_ROWS: readonly MenuRow[] = [
  { id: VFX_COMMAND.copyClassName, title: m.workshop_bin_copy_class_name_action, icon: CopyIcon },
  { id: VFX_COMMAND.copyClassHash, title: m.workshop_bin_copy_class_hash_action, icon: HashIcon },
];

const EDIT_ROWS: readonly MenuRow[] = [
  {
    id: VFX_COMMAND.nodeDuplicate,
    title: m.workshop_bin_menu_vfx_node_duplicate_action,
    icon: CopySimpleIcon,
    shortcut: "duplicate",
  },
  {
    id: VFX_COMMAND.nodeRemove,
    title: m.workshop_bin_menu_vfx_node_remove_action,
    icon: TrashIcon,
    shortcut: "remove",
    danger: true,
  },
];

/** Returns the Graph menu, whose every item is an offer of the Graph pane. */
export function useGraphMenu({ lookup, readOnly }: MenuScope): CommandMenu {
  const absent = m.workshop_bin_menu_vfx_graph_reason();
  const commands = (rows: readonly MenuRow[]) =>
    rows.map((row) => paneCommand(lookup, row, absent));

  const classes = offersOf(lookup, nodeClassCommand);
  const classIcon = glyph(ArrowsLeftRightIcon);
  const classTitle = m.workshop_bin_graph_change_class_action();
  const changeClass: CommandMenuEntry =
    classes.length === 0
      ? {
          kind: "command",
          id: "graph.class",
          title: classTitle,
          icon: classIcon,
          run: null,
          reason:
            lookup(VFX_COMMAND.graphFit) === null
              ? absent
              : (readOnly ?? m.workshop_bin_menu_vfx_class_reason()),
        }
      : {
          kind: "submenu",
          id: "graph.class",
          title: classTitle,
          icon: classIcon,
          className: "max-h-80 w-64 overflow-y-auto scrollbar-md",
          items: classes.map((offer, at) => ({
            kind: "check",
            id: nodeClassCommand(at),
            title: offer.title ?? "",
            checked: offer.checked === true,
            run: offer.run,
          })),
        };

  return {
    id: "graph",
    title: m.workshop_bin_menu_vfx_graph_label(),
    className: "w-72",
    items: [
      ...commands(VIEW_ROWS),
      MENU_SEPARATOR,
      ...commands(COLLAPSE_ROWS),
      MENU_SEPARATOR,
      ...SWITCH_ROWS.map((row) => paneToggle(lookup, row, absent)),
      ...commands(BOARD_ROWS),
      MENU_SEPARATOR,
      ...commands(NODE_ROWS),
      changeClass,
      ...commands(CLASS_ROWS),
      MENU_SEPARATOR,
      ...commands(EDIT_ROWS),
    ],
  };
}
