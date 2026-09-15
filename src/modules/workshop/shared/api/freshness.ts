/**
 * How long a content scan stays fresh, in milliseconds.
 *
 * The backend answers that query by walking every layer of the project and
 * returning every file, with no truncation. At `staleTime: 0` each focus of the
 * window paid for that walk again, so alternating with an external editor
 * re-scanned the whole project on every trip back.
 *
 * A window is the wrong instrument for this and a watch on the content
 * directory is the right one. Until then this bounds the cost to one walk per
 * interval while a save in another application still lands within it.
 */
export const CONTENT_SCAN_STALE_MS = 10_000;
