import { twMerge } from "@/utils";

/** The mouse button of a middle click, which plays a row. */
export const MIDDLE_BUTTON = 1;

/** The group name that an audio list's scroller carries, so its active row can draw focus. */
export const AUDIO_LIST_GROUP = "group/audio-list";

/* DS-VEIL, DS-RADIUS. */
const ROW_CLASSES = "flex h-6 items-center rounded-sm pr-2 hover:bg-surface-veil-soft";

const PLAYING_CLASSES = "bg-accent-500/8";

const SELECTED_CLASSES =
  "bg-accent-500/15 hover:bg-accent-500/25 group-focus-visible/audio-list:ring-1 group-focus-visible/audio-list:ring-accent-500/70 group-focus-visible/audio-list:ring-inset";

/* The slot under a row drag, an OS file drag or a content tree drag. */
const DROP_CLASSES =
  "data-audio-over:ring-1 data-audio-over:ring-accent-400 data-audio-over:ring-inset data-asset-over:ring-1 data-asset-over:ring-accent-400 data-asset-over:ring-inset";

const CUT_CLASSES = "opacity-60";

export interface AudioRowState {
  readonly selected: boolean;
  readonly playing: boolean;
  /** `true` while the row's node is cut and waits for a paste. */
  readonly cut?: boolean;
}

/**
 * Returns the classes of one row of the media table or the event tree.
 *
 * The list is one tab stop with `aria-activedescendant`, so the selected row draws the focus ring
 * while the list has keyboard focus. A row that plays and is not selected takes half the selected
 * fill. A row under a drag draws the ring too, and a cut row is dimmed.
 */
export function audioRowClasses({ selected, playing, cut = false }: AudioRowState): string {
  return twMerge(
    ROW_CLASSES,
    DROP_CLASSES,
    playing && !selected && PLAYING_CLASSES,
    selected && SELECTED_CLASSES,
    cut && CUT_CLASSES,
  );
}
