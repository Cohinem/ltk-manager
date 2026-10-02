import { KeyboardIcon } from "@phosphor-icons/react";

import { Kbd, Popover, Tooltip } from "@/components";
import { m } from "@/i18n";

import { CANVAS_KEYS } from "./canvasKeys";
import { PREVIEW_KEYS } from "./previewKeys";

/** A shortcut's name and its keys. */
type Shortcut = readonly [() => string, string];

const CANVAS: readonly Shortcut[] = [
  [m.workshop_bin_atlas_frame_action, CANVAS_KEYS.frame],
  [m.workshop_bin_atlas_fit_action, CANVAS_KEYS.fit],
  [m.workshop_preview_zoom_actual_label, CANVAS_KEYS.actual],
  [m.workshop_preview_zoom_in_label, CANVAS_KEYS.zoomIn],
  [m.workshop_preview_zoom_out_label, CANVAS_KEYS.zoomOut],
  [m.workshop_bin_atlas_nudge_label, CANVAS_KEYS.nudge],
  [m.workshop_bin_atlas_nudge_far_label, CANVAS_KEYS.nudgeFar],
  [m.workshop_bin_atlas_forward_action, CANVAS_KEYS.forward],
  [m.workshop_bin_atlas_backward_action, CANVAS_KEYS.backward],
  [m.workshop_bin_atlas_front_action, CANVAS_KEYS.front],
  [m.workshop_bin_atlas_back_action, CANVAS_KEYS.back],
  [m.workshop_bin_atlas_pan_label, CANVAS_KEYS.pan],
  [m.workshop_bin_atlas_clear_selection_action, CANVAS_KEYS.clear],
];

const PREVIEW: readonly Shortcut[] = [
  [m.workshop_bin_atlas_transform_label, PREVIEW_KEYS.transform],
  [m.workshop_bin_atlas_interact_label, PREVIEW_KEYS.interact],
  [m.workshop_bin_atlas_safe_zone_label, PREVIEW_KEYS.safeZone],
  [m.workshop_bin_atlas_show_disabled_label, PREVIEW_KEYS.showDisabled],
  [m.workshop_bin_atlas_effects_label, PREVIEW_KEYS.effects],
  [m.workshop_bin_atlas_samples_label, PREVIEW_KEYS.samples],
  [m.workshop_bin_atlas_stack_scenes_label, PREVIEW_KEYS.stackScenes],
  [m.workshop_bin_atlas_shortcuts_button_state_label, PREVIEW_KEYS.buttonState],
  [m.workshop_bin_atlas_shortcuts_play_label, PREVIEW_KEYS.play],
];

/** The status strip's list of the keys the focused canvas answers. */
export function CanvasShortcuts() {
  const label = m.workshop_bin_atlas_shortcuts_label();

  return (
    <Popover.Root>
      <Tooltip content={label}>
        <Popover.Trigger
          aria-label={label}
          /* DS-VEIL, DS-RADIUS */
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface-400 hover:bg-surface-veil hover:text-surface-100 data-[popup-open]:bg-surface-veil-strong"
        >
          <KeyboardIcon weight="bold" className="size-4" />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Content
        side="top"
        align="end"
        className="flex w-72 flex-col gap-2 p-2 font-sans select-none"
      >
        <ShortcutGroup title={m.workshop_bin_atlas_shortcuts_canvas_label()} keys={CANVAS} />
        <ShortcutGroup title={m.workshop_bin_atlas_shortcuts_preview_label()} keys={PREVIEW} />
      </Popover.Content>
    </Popover.Root>
  );
}

function ShortcutGroup({ title, keys }: { title: string; keys: readonly Shortcut[] }) {
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="px-1 text-meta font-medium text-surface-400">{title}</h3>
      <dl className="flex flex-col">
        {keys.map(([name, shortcut]) => (
          <div key={shortcut} className="flex h-6 items-center gap-2 px-1 text-row">
            <dt className="min-w-0 flex-1 truncate text-surface-200">{name()}</dt>
            <dd>
              <Kbd shortcut={shortcut} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
