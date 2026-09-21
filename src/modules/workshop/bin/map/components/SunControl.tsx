import { ArrowCounterClockwiseIcon, SunIcon } from "@phosphor-icons/react";

import { IconButton, Popover, Tooltip } from "@/components";
import { m } from "@/i18n";
import {
  type BackdropSource,
  DEFAULT_SUN,
  sunAngles,
  sunDirection,
  type SunLight,
  useBackdropSun,
} from "@/modules/viewport";
import { usePreviewSun, useSetPreviewDisplay } from "@/stores";

import { type SliderRange, SliderRow } from "../../vfx/preview/components/SliderRow";
import { ColorRow } from "./ColorRow";

/**
 * What each slider spans, in degrees and in shares of the light.
 *
 * Elevation stops short of the zenith, where the bearing is lost and a drag back down
 * would swing the sun to the bearing's zero.
 */
const RANGE = {
  azimuth: { least: -180, most: 180, step: 1 },
  elevation: { least: 0, most: 89, step: 1 },
  share: { least: 0, most: 2, step: 0.01 },
} satisfies Record<string, SliderRange>;

export interface SunControlProps {
  /** The backdrop whose own sun the knobs open on and the reset returns to. */
  readonly source: BackdropSource | null;
}

/**
 * The sun over a backdrop, off a button in the viewport's controls.
 *
 * The knobs open on the map's own `MapSunProperties`. Moving one sets a custom light
 * for every map, and the reset returns each map to its own. The button carries the
 * accent while a custom light is set.
 */
export function SunControl({ source }: SunControlProps) {
  const own = useBackdropSun(source) ?? DEFAULT_SUN;
  const custom = usePreviewSun();
  const setDisplay = useSetPreviewDisplay();
  const light = custom ?? own;
  const angles = sunAngles(light.direction);
  const change = (next: Partial<SunLight>) => setDisplay({ previewSun: { ...light, ...next } });

  return (
    <Popover.Root>
      <Tooltip content={m.workshop_bin_preview_sun_label()}>
        <Popover.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_preview_sun_label()}
              /* DS-VEIL, DS-RADIUS */
              className={
                custom === null
                  ? undefined
                  : "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25"
              }
              icon={<SunIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup
            data-ui="SunControl"
            aria-label={m.workshop_bin_preview_sun_label()}
            className="w-72 p-3 select-none"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <Popover.Title className="text-xs font-medium tracking-wide text-surface-400 uppercase">
                  {m.workshop_bin_preview_sun_label()}
                </Popover.Title>
                <Popover.Description className="mt-0.5 text-meta text-surface-400">
                  {m.workshop_bin_preview_sun_description()}
                </Popover.Description>
              </div>
              <Tooltip content={m.workshop_bin_preview_sun_reset_action()}>
                <IconButton
                  variant="ghost"
                  size="xs"
                  compact
                  aria-label={m.workshop_bin_preview_sun_reset_action()}
                  icon={<ArrowCounterClockwiseIcon weight="bold" className="h-4 w-4" />}
                  disabled={custom === null}
                  onClick={() => setDisplay({ previewSun: null })}
                />
              </Tooltip>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <SliderRow
                label={m.workshop_bin_preview_sun_azimuth_label()}
                reading={m.workshop_bin_preview_sun_degrees_label({
                  value: Math.round(angles.azimuth),
                })}
                value={angles.azimuth}
                range={RANGE.azimuth}
                onValueChange={(azimuth) =>
                  change({ direction: sunDirection({ ...angles, azimuth }) })
                }
              />
              <SliderRow
                label={m.workshop_bin_preview_sun_elevation_label()}
                reading={m.workshop_bin_preview_sun_degrees_label({
                  value: Math.round(angles.elevation),
                })}
                value={angles.elevation}
                range={RANGE.elevation}
                onValueChange={(elevation) =>
                  change({ direction: sunDirection({ ...angles, elevation }) })
                }
              />
              <SliderRow
                label={m.workshop_bin_preview_sun_strength_label()}
                reading={light.strength.toFixed(2)}
                value={light.strength}
                range={RANGE.share}
                onValueChange={(strength) => change({ strength })}
              />
              <SliderRow
                label={m.workshop_bin_preview_sun_ambient_label()}
                reading={light.ambient.toFixed(2)}
                value={light.ambient}
                range={RANGE.share}
                onValueChange={(ambient) => change({ ambient })}
              />
              <ColorRow
                label={m.workshop_bin_preview_sun_color_label()}
                value={light.color}
                onValueChange={(color) => change({ color })}
              />
              <ColorRow
                label={m.workshop_bin_preview_sun_sky_label()}
                value={light.sky}
                onValueChange={(sky) => change({ sky })}
              />
              <ColorRow
                label={m.workshop_bin_preview_sun_ground_label()}
                value={light.ground}
                onValueChange={(ground) => change({ ground })}
              />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
