import { EyeClosedIcon, EyeIcon } from "@phosphor-icons/react";
import { use } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { VfxRunContext } from "../../playback/state/run";
import { anySolo } from "../../rendering/utils/definitions";

/** A header button's box: DS-VEIL, DS-RADIUS. */
const BUTTON =
  "nodrag flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-300 hover:bg-surface-veil hover:text-surface-100";

/** Where an emitter stands in the run: its pool index, and whether the preview leaves it out. */
export interface RunPresence {
  readonly index: number;
  readonly muted: boolean;
  readonly soloed: boolean;
  /** Muted, or left out by another emitter's solo. */
  readonly hidden: boolean;
}

/** The run's hold on the emitter at `listIndex` of its list, and null outside a run. */
export function useRunPresence(simple: boolean, listIndex: number): RunPresence | null {
  const run = use(VfxRunContext);
  const emitter = run?.system?.emitters.find(
    (each) => each.simple === simple && each.listIndex === listIndex,
  );
  if (run === null || emitter === undefined) return null;

  const muted = run.muted.has(emitter.index);
  const soloed = run.soloed.has(emitter.index);
  return {
    index: emitter.index,
    muted,
    soloed,
    hidden: muted || (anySolo(run) && !soloed),
  };
}

/**
 * An emitter's visibility and solo on its node's header, the timeline lanes' own.
 *
 * In an editable document the eye writes the emitter's `disabled` flag, and in a read-only one
 * it hides the emitter in the preview. Solo changes what the preview draws alone.
 */
export function EmitterRunToggles({ presence }: { presence: RunPresence | null }) {
  const run = use(VfxRunContext);
  if (run === null || presence === null) return null;

  return (
    <RunToggles
      muted={presence.muted}
      soloed={presence.soloed}
      onMute={() => run.toggleMuted(presence.index)}
      onSolo={() => run.toggleSoloed(presence.index)}
    />
  );
}

interface RunTogglesProps {
  muted: boolean;
  soloed: boolean;
  onMute: () => void;
  onSolo: () => void;
}

/** The eye and the solo button of a node header, for an emitter or a child system. */
export function RunToggles({ muted, soloed, onMute, onSolo }: RunTogglesProps) {
  const visibility = muted
    ? m.workshop_bin_graph_show_action()
    : m.workshop_bin_graph_hide_action();

  return (
    <>
      <Tooltip content={visibility}>
        <button
          type="button"
          aria-label={visibility}
          aria-pressed={!muted}
          className={twMerge(BUTTON, muted && "text-surface-500")}
          onClick={onMute}
        >
          {muted && <EyeClosedIcon weight="bold" className="size-3.5" />}
          {!muted && <EyeIcon weight="bold" className="size-3.5" />}
        </button>
      </Tooltip>
      <Tooltip content={m.workshop_bin_preview_solo_label()}>
        <button
          type="button"
          aria-label={m.workshop_bin_preview_solo_label()}
          aria-pressed={soloed}
          className={twMerge(
            BUTTON,
            "font-sans text-meta font-semibold text-surface-400",
            soloed && "bg-accent-500/30 text-accent-200",
          )}
          onClick={onSolo}
        >
          {m.workshop_bin_preview_solo_glyph_label()}
        </button>
      </Tooltip>
    </>
  );
}
