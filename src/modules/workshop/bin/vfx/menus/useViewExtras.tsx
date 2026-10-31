import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  EyeIcon,
  FrameCornersIcon,
  HandGrabbingIcon,
  MagnetIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { use } from "react";

import { m } from "@/i18n";
import type { CommandMenuEntry } from "@/modules/editor";
import { MENU_SEPARATOR } from "@/modules/editor";
import { useSetPreviewDisplay, useTimelineHistogram, useTimelineSnap } from "@/stores";

import { cameraSubmenu, viewModeSubmenu } from "../../menus/components/LazyPreviewItems";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { InspectorViewItems } from "../inspector/components/InspectorActions";
import { useEmitters } from "../inspector/state/emitterChoice";
import type { EmitterMode } from "../inspector/utils/emitterTypes";
import { PaneHandleItems } from "../preview/components/HandleMenu";
import { useShowEntries } from "../preview/components/ShowMenu";
import { keyEventOf, vfxShortcut } from "../utils/vfxKeys";
import { glyph, type MenuScope, type RunCommands, type RunRow } from "./menuItems";

const FIT: RunRow = {
  key: "fit",
  title: m.workshop_bin_preview_fit_action,
  icon: FrameCornersIcon,
};

/** Returns what the View menu adds. A class without a run lists nothing of the preview. */
export function useViewExtras(scope: MenuScope, commands: RunCommands): CommandMenuEntry[] {
  const { run, inLayout } = scope;
  const menu = use(ObjectMenuContext);
  const { mode, setMode } = useEmitters();
  const show = useShowEntries();
  const snap = useTimelineSnap();
  const histogram = useTimelineHistogram();
  const setDisplay = useSetPreviewDisplay();
  const running = run !== null;

  /* The key's handler reads the system's folder, which only the tab's own props name. */
  const stepSystem = (name: "systemPrevious" | "systemNext") => () =>
    menu?.keyScope.current?.dispatchEvent(new KeyboardEvent("keydown", keyEventOf(name)));

  return [
    running && {
      kind: "submenu",
      id: "view.show",
      title: m.workshop_bin_preview_show_label(),
      icon: glyph(EyeIcon),
      className: "w-44",
      items: [...show],
    },
    running && viewModeSubmenu(),
    running && cameraSubmenu(),
    running && commands.item(FIT),
    running && {
      kind: "submenu",
      id: "view.handle",
      title: m.workshop_bin_handle_menu_label(),
      icon: glyph(HandGrabbingIcon),
      className: "w-56",
      items: [{ kind: "slot", id: "view.handle.items", node: <PaneHandleItems /> }],
    },
    MENU_SEPARATOR,
    {
      kind: "submenu",
      id: "view.inspector",
      title: m.workshop_bin_menu_vfx_inspector_label(),
      icon: glyph(SlidersHorizontalIcon),
      className: "w-48",
      items: [{ kind: "slot", id: "view.inspector.items", node: <InspectorViewItems /> }],
    },
    running && {
      kind: "check",
      id: "view.snap",
      title: m.workshop_bin_timeline_snap_label(),
      icon: glyph(MagnetIcon),
      checked: snap,
      run: () => setDisplay({ timelineSnap: !snap }),
    },
    running && {
      kind: "check",
      id: "view.histogram",
      title: m.workshop_bin_timeline_histogram_label(),
      icon: glyph(ChartBarIcon),
      checked: histogram,
      run: () => setDisplay({ timelineHistogram: !histogram }),
    },
    MENU_SEPARATOR,
    {
      kind: "radio",
      id: "view.emitters",
      value: mode,
      options: [
        { value: "cards", title: m.workshop_bin_emitter_view_cards_label(), disabled: !inLayout },
        { value: "table", title: m.workshop_bin_emitter_view_table_label(), disabled: !inLayout },
      ],
      onPick: (value) => setMode(value as EmitterMode),
    },
    MENU_SEPARATOR,
    {
      kind: "command",
      id: "view.systemPrevious",
      title: m.workshop_bin_menu_vfx_system_previous_action(),
      icon: glyph(ArrowUpIcon),
      shortcut: vfxShortcut("systemPrevious"),
      run: stepSystem("systemPrevious"),
    },
    {
      kind: "command",
      id: "view.systemNext",
      title: m.workshop_bin_menu_vfx_system_next_action(),
      icon: glyph(ArrowDownIcon),
      shortcut: vfxShortcut("systemNext"),
      run: stepSystem("systemNext"),
    },
  ];
}
