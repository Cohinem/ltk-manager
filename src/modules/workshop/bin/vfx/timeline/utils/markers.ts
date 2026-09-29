import { z } from "zod";

import type { AssetRef } from "@/lib/tauri";

import { assetKey } from "../../../../preview/utils/assetRef";

/** A named time on one particle system's timeline, kept in the project's `.ltk/editor.json`. */
export interface TimelineMarker {
  readonly id: string;
  /** Seconds into the run. */
  readonly time: number;
  /** Null for a marker the reader has not named. */
  readonly name: string | null;
}

/** Every system's markers, by `markerKey`. */
export type TimelineMarkers = Readonly<Record<string, readonly TimelineMarker[]>>;

/** What a system's markers are kept under: the file it is read from and its object. */
export function markerKey(asset: AssetRef, entry: string): string {
  return `${assetKey(asset)}:${entry}`;
}

/** How near a marker another added one is taken as the same, half a frame at 60 Hz. */
const SAME_TIME = 1 / 120;

/** `markers` with one more at `time`, in time order, or as they are where one stands there. */
export function addedMarker(
  markers: readonly TimelineMarker[],
  time: number,
  id: string,
): readonly TimelineMarker[] {
  const at = Math.max(time, 0);
  if (markers.some((marker) => Math.abs(marker.time - at) < SAME_TIME)) return markers;

  return inOrder([...markers, { id, time: at, name: null }]);
}

/** `markers` with `marker` back in its place, which undoes its removal. */
export function restoredMarker(
  markers: readonly TimelineMarker[],
  marker: TimelineMarker,
): readonly TimelineMarker[] {
  return inOrder([...markers.filter((each) => each.id !== marker.id), marker]);
}

/**
 * Every system's markers, the ones of layer `from`'s files kept under layer `to`, or null where
 * no marker belongs to a file of `from`.
 */
export function renamedLayerMarkers(
  markers: TimelineMarkers,
  from: string,
  to: string,
): TimelineMarkers | null {
  const before = assetKey({ kind: "layer", project: "", layer: from, path: "" });
  const after = assetKey({ kind: "layer", project: "", layer: to, path: "" });
  if (!Object.keys(markers).some((key) => key.startsWith(before))) return null;

  return Object.fromEntries(
    Object.entries(markers).map(([key, list]) => [
      key.startsWith(before) ? after + key.slice(before.length) : key,
      list,
    ]),
  );
}

/** `markers` with the one under `id` moved to `time`, in time order. */
export function movedMarker(
  markers: readonly TimelineMarker[],
  id: string,
  time: number,
): readonly TimelineMarker[] {
  return inOrder(
    markers.map((marker) => (marker.id === id ? { ...marker, time: Math.max(time, 0) } : marker)),
  );
}

/** `markers` with the one under `id` named `name`. A blank name clears it. */
export function renamedMarker(
  markers: readonly TimelineMarker[],
  id: string,
  name: string,
): readonly TimelineMarker[] {
  const trimmed = name.trim();
  return markers.map((marker) =>
    marker.id === id ? { ...marker, name: trimmed === "" ? null : trimmed } : marker,
  );
}

/** `markers` without the one under `id`. */
export function removedMarker(
  markers: readonly TimelineMarker[],
  id: string,
): readonly TimelineMarker[] {
  return markers.filter((marker) => marker.id !== id);
}

function inOrder(markers: TimelineMarker[]): readonly TimelineMarker[] {
  return markers.sort((a, b) => a.time - b.time);
}

const markerSchema = z.object({
  id: z.string().min(1),
  time: z.number().nonnegative().finite(),
  name: z.string().min(1).nullable(),
});

/**
 * Every system's markers out of an untrusted `.ltk/editor.json` entry. A mis-shaped marker drops
 * alone, and a system left with none drops too.
 */
export function readMarkers(value: unknown): TimelineMarkers {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const read: Record<string, readonly TimelineMarker[]> = {};
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;

    const markers = list.flatMap((item: unknown) => {
      const parsed = markerSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    if (markers.length > 0) read[key] = inOrder(markers);
  }
  return read;
}
