import type { EventTree, MediaLocation } from "@/lib/tauri";

import { type EventRow, eventSounds, pickSounds, type RandomSource } from "./eventTree";

/** What the waveform column of a tree row draws from: one media, or an event to read first. */
export type ThumbnailSource =
  | { readonly kind: "media"; readonly media: MediaLocation }
  | { readonly kind: "event"; readonly id: number };

/** Picks the first weighted playlist item, so a row draws the same media each time. */
const FIRST_PICK: RandomSource = () => 0;

/**
 * Returns what the waveform column of `row` draws: the first media that a press on the row plays.
 *
 * An event row returns its event, whose tree the column reads first. Returns `null` for a row
 * that plays no media.
 */
export function thumbnailSource(row: EventRow): ThumbnailSource | null {
  if (row.kind === "event") {
    return row.event.mediaCount > 0 ? { kind: "event", id: row.event.id } : null;
  }

  const node = row.kind === "action" ? row.action.node : row.kind === "node" ? row.node : null;
  const [first] = node === null ? [] : pickSounds(node, FIRST_PICK);
  return first === undefined ? null : { kind: "media", media: first };
}

/** Returns the first media that a press of the event `tree` plays, or `null` without one. */
export function firstEventMedia(tree: EventTree): MediaLocation | null {
  return eventSounds(tree, FIRST_PICK)[0] ?? null;
}
