/** The track heights of DS-SIZE a row of segments takes: 28 and 32px. */
export type SegmentSize = "sm" | "md";

/** The inset track that a row of exclusive choices shares: DS-GROUND. */
export const segmentTrack =
  "relative inline-flex items-stretch gap-0.5 rounded-md border border-surface-600 bg-surface-950/40 p-0.5";

export const segmentTrackSize: Record<SegmentSize, string> = {
  sm: "h-7",
  md: "h-8",
};

/** The thumb under the chosen segment, which its owner places and sizes. */
export const segmentThumb =
  "pointer-events-none absolute inset-y-0.5 left-0 rounded-sm bg-accent-500/15 shadow-xs ring-1 ring-accent-500/35 ring-inset";

/** A segment's label at rest. */
export const segmentRest = "text-surface-400 hover:text-surface-200";

/** The chosen segment's label, which the thumb fills in place of a hover. */
export const segmentChosen = "text-accent-300 hover:bg-transparent hover:text-accent-300";
