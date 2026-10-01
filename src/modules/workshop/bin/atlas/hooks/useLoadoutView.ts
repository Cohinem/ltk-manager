import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { uiQueries } from "../api/uiQueries";
import { roleHidden, roleTexts, withLoadout, withTextures } from "../engine/model/loadout";
import { viewTree } from "../engine/model/repeats";
import {
  chooseTooltip,
  type TooltipSample,
  tooltipSamples,
  withShift,
} from "../engine/model/tooltip";
import type { ViewTree } from "../engine/model/tree";
import type { View } from "../engine/model/view";
import { useAtlasPreviewStore } from "../state/atlasPreview";

const NO_TEXTS: ReadonlyMap<string, string> = new Map();
const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * A view as a preview draws it, the text its bound elements read in place of their own, the bound
 * elements it draws off, and the sample its tooltip is filled with.
 */
export interface LoadoutView {
  readonly view: View | null;
  readonly tree: ViewTree | null;
  readonly texts: ReadonlyMap<string, string>;
  readonly hidden: ReadonlySet<string>;
  /** None where the chosen character has no ability tooltips, or none are read. */
  readonly tooltip: TooltipSample | null;
}

/**
 * `view` filled with the sample loadout while `samples` draw, per `withLoadout`, and `tree` as it
 * stands otherwise. The loadout is read only for a view whose controller binds any element. A
 * view's tooltip is filled with the chosen ability of the chosen character, its icon included.
 */
export function useLoadoutView(
  document: BinDocumentId,
  view: View | null,
  tree: ViewTree | null,
  samples: boolean,
): LoadoutView {
  const sandbox = useSandbox();
  const wanted = samples && view !== null && view.bindings.length > 0;
  const loadout = useQuery({ ...uiQueries.loadout(document, sandbox), enabled: wanted }).data;
  const tooltip = useTooltipSample(document, samples && view?.tooltip != null);

  return useMemo(() => {
    const icon = view?.tooltip?.icon ?? null;
    const texture = tooltip?.icon ?? null;
    const filled = icon === null || texture === null ? null : new Map([[icon, texture]]);
    if (view === null || (!wanted && filled === null)) {
      return { view, tree, texts: NO_TEXTS, hidden: NO_HIDDEN, tooltip };
    }

    const loaded = wanted ? withLoadout(view, loadout ?? null) : view;
    const drawn = filled === null ? loaded : withTextures(loaded, filled);
    return {
      view: drawn,
      tree: drawn === view ? tree : viewTree(drawn),
      texts: wanted ? roleTexts(view) : NO_TEXTS,
      hidden: wanted ? roleHidden(view) : NO_HIDDEN,
      tooltip,
    };
  }, [wanted, view, tree, loadout, tooltip]);
}

/** The sample a tooltip is filled with: the chosen ability of the chosen character while `wanted`. */
export function useTooltipSample(document: BinDocumentId, wanted: boolean): TooltipSample | null {
  const { samples } = useTooltipSamples(document, wanted);
  const chosen = useAtlasPreviewStore((state) => state.tooltipSample);
  const extended = useAtlasPreviewStore((state) => state.tooltipExtended || state.shiftHeld);
  return useMemo(
    () => withShift(chooseTooltip(samples, chosen), extended),
    [samples, chosen, extended],
  );
}

/** The samples of the chosen character, and whether its abilities are still being read. */
export interface TooltipSamples {
  readonly samples: readonly TooltipSample[];
  readonly pending: boolean;
}

/**
 * Every sample of the chosen character at the chosen level and rank, per `tooltipSamples`, read
 * while `wanted`. A change keeps the samples it had until the new ones are read.
 */
export function useTooltipSamples(document: BinDocumentId, wanted = true): TooltipSamples {
  const sandbox = useSandbox();
  const character = useAtlasPreviewStore((state) => state.tooltipCharacter);
  const level = useAtlasPreviewStore((state) => state.tooltipLevel);
  const rank = useAtlasPreviewStore((state) => state.tooltipRank);
  const read = useQuery({
    ...uiQueries.tooltips(document, sandbox, character, level, rank),
    enabled: wanted,
    placeholderData: keepPreviousData,
  });
  const samples = useMemo(() => tooltipSamples(read.data ?? null), [read.data]);
  return { samples, pending: wanted && (read.isPending || read.isPlaceholderData) };
}
