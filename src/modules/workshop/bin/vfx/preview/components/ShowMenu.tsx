import { CaretDownIcon, EyeIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import { type CommandMenuCheck, CommandMenuItems } from "@/modules/editor";
import {
  usePreviewGizmo,
  usePreviewGround,
  usePreviewMasks,
  usePreviewMidlane,
  usePreviewStats,
  useSetPreviewDisplay,
} from "@/stores";

/** Returns the preview's overlays as menu switches, which this menu and the menu bar both draw. */
export function useShowEntries(): readonly CommandMenuCheck[] {
  const ground = usePreviewGround();
  const midlane = usePreviewMidlane();
  const gizmo = usePreviewGizmo();
  const stats = usePreviewStats();
  const masks = usePreviewMasks();
  const setDisplay = useSetPreviewDisplay();

  return [
    {
      kind: "check",
      id: "show.ground",
      title: m.workshop_bin_preview_stage_label(),
      checked: ground,
      run: () => setDisplay({ previewGround: !ground }),
    },
    {
      kind: "check",
      id: "show.midlane",
      title: m.workshop_bin_preview_midlane_label(),
      checked: ground && midlane,
      run: ground ? () => setDisplay({ previewMidlane: !midlane }) : null,
    },
    {
      kind: "check",
      id: "show.gizmo",
      title: m.workshop_bin_preview_gizmo_label(),
      checked: gizmo,
      run: () => setDisplay({ previewGizmo: !gizmo }),
    },
    {
      kind: "check",
      id: "show.masks",
      title: m.workshop_bin_preview_masks_label(),
      checked: masks,
      run: () => setDisplay({ previewMasks: !masks }),
    },
    {
      kind: "check",
      id: "show.stats",
      title: m.workshop_bin_preview_stats_label(),
      checked: stats,
      run: () => setDisplay({ previewStats: !stats }),
    },
  ];
}

/** The preview's overlays as ticks in one menu, which stays open while they are set. */
export function ShowMenu() {
  const entries = useShowEntries();
  const shown = entries.filter((entry) => entry.checked).length;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            left={<EyeIcon weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {m.workshop_bin_preview_show_label()}
            <span className="text-surface-400 tabular-nums">{shown}</span>
          </Button>
        }
      />
      <Menu.Content align="end" data-ui="ShowMenu" className="w-44">
        <CommandMenuItems items={entries} />
      </Menu.Content>
    </Menu.Root>
  );
}
