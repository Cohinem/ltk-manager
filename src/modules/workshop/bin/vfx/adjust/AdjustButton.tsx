import { ArrowCounterClockwiseIcon, SlidersIcon } from "@phosphor-icons/react";
import { type ReactNode, use, useEffect } from "react";

import {
  Button,
  IconButton,
  Inline,
  OVERLINE,
  Popover,
  Slider,
  Stack,
  Tooltip,
} from "@/components";
import { m } from "@/i18n";

import { type ColorStop, gradientCss } from "../../values/utils/valueRows";
import { VfxRunContext } from "../playback/state/run";
import { isNoAdjust, NO_ADJUST, shiftHue } from "./adjustModel";
import { useAdjustPreview } from "./adjustPreview";
import { useAdjustApply } from "./useAdjustApply";

const HUE_RANGE = 180;

/** The scale slider's reach in doublings each way: from a quarter to four times. */
const SCALE_DOUBLINGS = 2;

const WHEEL_STEPS = Array.from({ length: 13 }, (_, at) => at * 30);

/** Returns the hue wheel centered on red turned by `hue` degrees, as a CSS gradient. */
function wheel(hue: number): string {
  const stops = WHEEL_STEPS.map((step): ColorStop => {
    const [r = 0, g = 0, b = 0] = shiftHue([1, 0, 0], hue + step - HUE_RANGE);
    return { time: step / 360, rgba: [r, g, b, 1] };
  });
  return gradientCss(stops);
}

const AUTHORED = wheel(0);

/** The scale slider's track, a plain rail so 1× does not read as a half-filled bar. */
const SCALE_TRACK = "var(--color-surface-700)";

/**
 * The Adjust popover of the particle shell's header, with a hue turn and a scale for the whole
 * system.
 *
 * The hue slider's track is the authored hue wheel, and the band under it is the wheel after the
 * turn. The preview follows the sliders, and Apply writes both as one edit. Closing the popover
 * drops an unapplied adjustment. Drawn only in an editable run.
 */
export function AdjustButton() {
  const run = use(VfxRunContext);
  const preview = useAdjustPreview();
  const apply = useAdjustApply(run?.document ?? null, run?.entry ?? "");
  const reset = preview?.setAdjust;
  /* A popover that unmounts open calls no `onOpenChange`. */
  useEffect(() => () => reset?.(NO_ADJUST), [reset]);

  if (preview === null || apply === null) return null;

  const { adjust, setAdjust } = preview;
  const unchanged = isNoAdjust(adjust);
  const label = m.workshop_bin_adjust_action();
  const doublings = Math.log2(adjust.scale);

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) setAdjust(NO_ADJUST);
      }}
    >
      <Tooltip content={label}>
        <Popover.Trigger
          render={
            <IconButton
              variant={unchanged ? "ghost" : "tonal"}
              size="xs"
              tooltip={false}
              icon={<SlidersIcon weight="bold" />}
              aria-label={label}
            />
          }
        />
      </Tooltip>
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        aria-label={label}
        className="w-72 p-3 select-none"
      >
        <Stack gap={3}>
          <Inline gap={2} justify="between">
            <Popover.Title className={OVERLINE}>{label}</Popover.Title>
            <IconButton
              icon={<ArrowCounterClockwiseIcon />}
              disabled={unchanged}
              onClick={() => setAdjust(NO_ADJUST)}
              label={m.workshop_bin_adjust_reset_action()}
            />
          </Inline>
          <AdjustRow
            label={m.workshop_bin_adjust_hue_label()}
            reading={m.workshop_bin_adjust_hue_value({ value: signed(adjust.hue) })}
          >
            <Slider
              value={adjust.hue}
              onValueChange={(hue) => setAdjust({ ...adjust, hue })}
              min={-HUE_RANGE}
              max={HUE_RANGE}
              step={1}
              track={AUTHORED}
              aria-label={m.workshop_bin_adjust_hue_label()}
            />
            <div className="h-2.5 rounded-full" style={{ background: wheel(adjust.hue) }} />
          </AdjustRow>
          <AdjustRow
            label={m.workshop_bin_adjust_scale_label()}
            reading={m.workshop_bin_adjust_scale_value({ value: adjust.scale.toFixed(2) })}
          >
            <Slider
              value={doublings}
              onValueChange={(next) => setAdjust({ ...adjust, scale: 2 ** next })}
              min={-SCALE_DOUBLINGS}
              max={SCALE_DOUBLINGS}
              step={0.05}
              track={SCALE_TRACK}
              aria-label={m.workshop_bin_adjust_scale_label()}
            />
          </AdjustRow>
          <Inline justify="end">
            <Button
              size="sm"
              variant="filled"
              tone="accent"
              disabled={unchanged}
              onClick={() => {
                void apply(adjust).then((applied) => {
                  if (applied) setAdjust(NO_ADJUST);
                });
              }}
            >
              {m.workshop_bin_adjust_apply_action()}
            </Button>
          </Inline>
        </Stack>
      </Popover.Content>
    </Popover.Root>
  );
}

/** One adjustment: its label, its value as text, and its controls. */
function AdjustRow({
  label,
  reading,
  children,
}: {
  label: string;
  reading: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={1}>
      <Inline gap={2} justify="between" align="baseline">
        <span className="text-xs text-surface-300">{label}</span>
        <span className="font-mono text-meta text-code text-surface-400 tabular-nums">
          {reading}
        </span>
      </Inline>
      {children}
    </Stack>
  );
}

function signed(hue: number): string {
  return hue > 0 ? `+${hue}` : `${hue}`;
}
