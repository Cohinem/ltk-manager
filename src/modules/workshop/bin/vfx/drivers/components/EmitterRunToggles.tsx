import { EyeClosedIcon, EyeIcon } from "@phosphor-icons/react";
import { use } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { VfxRunContext } from "../../playback/state/run";

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
    hidden: muted || (run.soloed.size > 0 && !soloed),
  };
}

/**
 * An emitter's preview visibility and solo on its node's header, the timeline lanes' own.
 *
 * Both change what the preview draws and leave the file alone.
 */
export function EmitterRunToggles({ presence }: { presence: RunPresence | null }) {
  const run = use(VfxRunContext);
  if (run === null || presence === null) return null;

  const visibility = presence.muted
    ? m.workshop_bin_graph_show_action()
    : m.workshop_bin_graph_hide_action();

  return (
    <>
      <Tooltip content={visibility}>
        <button
          type="button"
          aria-label={visibility}
          aria-pressed={!presence.muted}
          className={twMerge(BUTTON, presence.muted && "text-surface-500")}
          onClick={() => run.toggleMuted(presence.index)}
        >
          {presence.muted && <EyeClosedIcon weight="bold" className="size-3.5" />}
          {!presence.muted && <EyeIcon weight="bold" className="size-3.5" />}
        </button>
      </Tooltip>
      <Tooltip content={m.workshop_bin_preview_solo_label()}>
        <button
          type="button"
          aria-label={m.workshop_bin_preview_solo_label()}
          aria-pressed={presence.soloed}
          className={twMerge(
            BUTTON,
            "font-sans text-meta font-semibold text-surface-400",
            presence.soloed && "bg-accent-500/30 text-accent-200",
          )}
          onClick={() => run.toggleSoloed(presence.index)}
        >
          {m.workshop_bin_preview_solo_glyph_label()}
        </button>
      </Tooltip>
    </>
  );
}
