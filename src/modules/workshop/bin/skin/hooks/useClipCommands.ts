import { type RefObject, use, useEffect, useRef, useState } from "react";

import { m } from "@/i18n";
import type { AnimationGraph, GraphClip } from "@/lib/tauri";
import { useSetPreviewDisplay } from "@/stores";

import { previewDocument } from "../../../documents/utils/contentDocument";
import { useOpenDocumentAs } from "../../../state";
import { usePaneCommands } from "../../menus/state/paneCommands";
import { SkinChoiceContext } from "../state/skinChoice";
import {
  CLIP_FILTER_COMMAND,
  CLIP_MASK_LIST,
  CLIP_OPEN_BESIDE_COMMAND,
  CLIP_OPEN_COMMAND,
  CLIP_SORT_DESCENDING_COMMAND,
  CLIP_SORT_LIST,
  listCommands,
} from "../utils/skinCommands";

/** Returns the document of the animation file of `clip`, and null if the clip reaches no file. */
export function clipDocument(clip: GraphClip | null) {
  const animation = clip?.animation;

  return animation?.asset ? previewDocument(animation.asset, animation.path) : null;
}

/** Returns the switch that weighs a mask on the character and shows the armature it reads on. */
export function useWeighMask(): (mask: string) => void {
  const choice = use(SkinChoiceContext);
  const setDisplay = useSetPreviewDisplay();

  return (mask) => {
    if (choice === null) return;

    const weighing = choice.mask !== mask;
    choice.setMask(weighing ? mask : null);
    if (weighing) setDisplay({ previewArmature: true });
  };
}

/** Offers the open of the selected clip and the masks of `graph` to the bar. */
export function useClipPaneCommands(graph: AnimationGraph | undefined): void {
  const choice = use(SkinChoiceContext);
  const open = useOpenDocumentAs();
  const weigh = useWeighMask();

  const picked = graph?.clips.find((clip) => clip.hash === choice?.picked) ?? null;
  const file = clipDocument(picked);
  const reason =
    picked === null
      ? m.workshop_bin_menu_graph_pick_reason()
      : m.workshop_bin_menu_graph_file_reason();

  usePaneCommands("clips.pane", {
    [CLIP_OPEN_COMMAND]: { run: file === null ? null : () => open(file, "default"), reason },
    [CLIP_OPEN_BESIDE_COMMAND]: { run: file === null ? null : () => open(file, "beside"), reason },
    ...listCommands(
      CLIP_MASK_LIST,
      (graph?.masks ?? []).map((mask) => ({
        title: mask.name,
        checked: choice?.mask === mask.hash,
        run: () => weigh(mask.hash),
      })),
    ),
  });
}

/** One sort of the clip table. */
interface ClipSort {
  readonly id: string;
  readonly desc: boolean;
}

/** Offers the sort of the clip table to the bar, one offer per column of `columns`. */
export function useClipSortCommands(
  columns: readonly { readonly key: string; readonly label: () => string }[],
  sorting: readonly ClipSort[],
  setSorting: (sorting: ClipSort[]) => void,
): void {
  const sorted = sorting[0] ?? null;

  usePaneCommands("clips.table", {
    ...listCommands(
      CLIP_SORT_LIST,
      columns.map((column) => ({
        title: column.label(),
        checked: sorted?.id === column.key,
        run: () => setSorting([{ id: column.key, desc: sorted?.desc ?? false }]),
      })),
    ),
    [CLIP_SORT_DESCENDING_COMMAND]: {
      checked: sorted?.desc === true,
      run: () => setSorting([{ id: sorted?.id ?? "name", desc: sorted?.desc !== true }]),
    },
  });
}

/**
 * Offers the focus of the clip filter to the bar, and returns the ref of the filter's field.
 *
 * The field shows only in the Clips tab, so the command changes the tab and the focus waits for
 * the render that draws the field.
 */
export function useClipFilterCommand(): RefObject<HTMLInputElement | null> {
  const choice = use(SkinChoiceContext);
  const field = useRef<HTMLInputElement>(null);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (request > 0) field.current?.focus();
  }, [request]);

  usePaneCommands("clips.tabs", {
    [CLIP_FILTER_COMMAND]: {
      run:
        choice === null
          ? null
          : () => {
              choice.setTab("clips");
              setRequest((count) => count + 1);
            },
    },
  });

  return field;
}
