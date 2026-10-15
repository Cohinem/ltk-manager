import { ArrowCounterClockwiseIcon, PaletteIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { use, useCallback, useEffect } from "react";

import {
  Button,
  IconButton,
  Inline,
  OVERLINE,
  Popover,
  Slider,
  Stack,
  Tooltip,
  useToast,
} from "@/components";
import { errorSummary, m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { sendEach } from "../../skin/hooks/useDynamicsEdit";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { type ColorStop, gradientCss } from "../../values/utils/valueRows";
import { vfxQueries } from "../hooks/useVfxSystem";
import { VfxRunContext } from "../playback/state/run";
import { recolorEdits, shiftHue } from "./recolorModel";
import { useRecolorPreview } from "./recolorPreview";

const HUE_RANGE = 180;

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

/**
 * The Recolor popover of the particle shell's header.
 *
 * The slider's track is the authored hue wheel and the band under it is the wheel after the turn,
 * as in a hue and saturation dialog. The preview follows the slider, and Apply writes the turn to
 * every tint of the system. Closing the popover drops an unapplied turn. Drawn only in an editable
 * run.
 */
export function RecolorButton() {
  const run = use(VfxRunContext);
  const preview = useRecolorPreview();
  const apply = useRecolorApply(run?.document ?? null, run?.entry ?? "");
  const reset = preview?.setHue;
  /* A popover that unmounts open calls no `onOpenChange`. */
  useEffect(() => () => reset?.(0), [reset]);

  if (preview === null || apply === null) return null;

  const { hue, setHue } = preview;
  const label = m.workshop_bin_recolor_action();

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) setHue(0);
      }}
    >
      <Tooltip content={label}>
        <Popover.Trigger
          render={
            <IconButton
              variant={hue === 0 ? "ghost" : "tonal"}
              size="xs"
              tooltip={false}
              icon={<PaletteIcon weight="bold" />}
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
              disabled={hue === 0}
              onClick={() => setHue(0)}
              label={m.workshop_bin_recolor_reset_action()}
            />
          </Inline>
          <Stack gap={1}>
            <Inline gap={2} justify="between" align="baseline">
              <span className="text-xs text-surface-300">{m.workshop_bin_recolor_hue_label()}</span>
              <span className="font-mono text-meta text-code text-surface-400 tabular-nums">
                {m.workshop_bin_recolor_hue_value({ value: signed(hue) })}
              </span>
            </Inline>
            <Slider
              value={hue}
              onValueChange={setHue}
              min={-HUE_RANGE}
              max={HUE_RANGE}
              step={1}
              track={AUTHORED}
              aria-label={m.workshop_bin_recolor_hue_label()}
            />
            <div className="h-2.5 rounded-full" style={{ background: wheel(hue) }} />
          </Stack>
          <Inline justify="end">
            <Button
              size="sm"
              variant="filled"
              tone="accent"
              disabled={hue === 0}
              onClick={() => {
                void apply(hue).then((applied) => {
                  if (applied) setHue(0);
                });
              }}
            >
              {m.workshop_bin_recolor_apply_action()}
            </Button>
          </Inline>
        </Stack>
      </Popover.Content>
    </Popover.Root>
  );
}

function signed(hue: number): string {
  return hue > 0 ? `+${hue}` : `${hue}`;
}

/**
 * Returns the write of a hue turn to the run's system, which answers whether it landed, and null
 * if the view does not edit.
 *
 * The turn resolves after the system is read again, so the preview drops its own turn when the
 * written colors are drawn. A refusal is shown in a toast.
 */
function useRecolorApply(
  document: BinDocumentId | null,
  entry: string,
): ((hue: number) => Promise<boolean>) | null {
  const edit = use(LeafEditContext);
  const send = edit?.send;
  const landed = edit?.landed;
  const queryClient = useQueryClient();
  const toast = useToast();

  const apply = useCallback(
    async (hue: number) => {
      if (document === null || send === undefined || landed === undefined) return false;

      const query = vfxQueries.system(document, entry);
      const system = queryClient.getQueryData(query.queryKey);
      if (system === undefined) return false;

      const refused = await sendEach({ send, landed }, recolorEdits(system, hue));
      if (refused !== null) {
        toast.error(m.workshop_bin_edit_refused_title(), errorSummary(refused));
        return false;
      }

      await queryClient.refetchQueries(
        { queryKey: query.queryKey, exact: true },
        { cancelRefetch: false },
      );
      return true;
    },
    [document, entry, send, landed, queryClient, toast],
  );

  if (document === null || send === undefined || landed === undefined) return null;
  return apply;
}
