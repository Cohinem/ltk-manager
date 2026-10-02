import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  MonitorIcon,
} from "@phosphor-icons/react";

import { IconButton, Popover, Slider, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import {
  HUD_MAX,
  HUD_MIN,
  SCREEN_PRESETS,
  useAtlasPreviewActions,
  useAtlasPreviewStore,
  useScreenPreset,
} from "../state/atlasPreview";

const HUD_STEP = 0.01;

export interface ScreenMenuProps {
  /** Whether the menu holds the HUD scale, which a font preview does not draw with. */
  readonly hud?: boolean;
}

/**
 * The screen the preview lays out for: a trigger naming the resolution and the HUD scale, and a
 * popover holding the presets and the scale slider.
 */
export function ScreenMenu({ hud = true }: ScreenMenuProps) {
  const preset = useScreenPreset();
  const scale = useAtlasPreviewStore((state) => state.hud);
  const { setPreset, setHud } = useAtlasPreviewActions();
  const percent = Math.round(scale * 100);

  return (
    <Popover.Root>
      <Tooltip content={m.workshop_bin_atlas_screen_label()}>
        <Popover.Trigger
          aria-label={m.workshop_bin_atlas_screen_label()}
          /* DS-VEIL, DS-RADIUS */
          className="flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-meta text-surface-200 hover:bg-surface-veil data-[popup-open]:bg-surface-veil-strong"
        >
          <MonitorIcon weight="bold" className="size-4 text-surface-400" />
          <span className="tabular-nums">
            {m.workshop_bin_atlas_screen_value({ width: preset.width, height: preset.height })}
          </span>
          {hud && (
            <span className="text-surface-400 tabular-nums">
              {m.workshop_bin_atlas_hud_value({ percent })}
            </span>
          )}
          <CaretDownIcon weight="bold" className="size-3 text-surface-400" />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Content className="flex w-64 flex-col gap-1 p-1 select-none">
        <div
          role="radiogroup"
          aria-label={m.workshop_bin_atlas_screen_label()}
          className="flex flex-col"
        >
          {SCREEN_PRESETS.map((each) => {
            const chosen = each.id === preset.id;
            return (
              <button
                key={each.id}
                type="button"
                role="radio"
                aria-checked={chosen}
                /* DS-VEIL, DS-RADIUS */
                className={twMerge(
                  "flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-row text-surface-200 hover:bg-surface-veil",
                  chosen && "text-surface-50",
                )}
                onClick={() => setPreset(each.id)}
              >
                <span className="flex-1 tabular-nums">
                  {m.workshop_bin_atlas_screen_value({
                    width: each.width,
                    height: each.height,
                  })}
                </span>
                <span className="text-meta text-surface-400 tabular-nums">{each.aspect}</span>
                <CheckIcon
                  weight="bold"
                  className={twMerge("size-3.5 text-accent-400", !chosen && "invisible")}
                />
              </button>
            );
          })}
        </div>
        {hud && (
          <div className="flex flex-col gap-1.5 border-t border-surface-700 px-2 pt-2 pb-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-row text-surface-200">
                {m.workshop_bin_atlas_hud_label()}
              </span>
              <span className="text-meta text-surface-300 tabular-nums">
                {m.workshop_bin_atlas_hud_value({ percent })}
              </span>
              <IconButton
                icon={<ArrowCounterClockwiseIcon className="size-3.5" />}
                disabled={scale === HUD_MAX}
                onClick={() => setHud(HUD_MAX)}
                label={m.workshop_bin_atlas_hud_reset_action()}
              />
            </div>
            <Slider
              aria-label={m.workshop_bin_atlas_hud_label()}
              value={scale}
              min={HUD_MIN}
              max={HUD_MAX}
              step={HUD_STEP}
              animated={false}
              onValueChange={setHud}
            />
          </div>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
