import type { MediaLocation } from "@/lib/tauri";

import type { EventRow } from "./eventTree";
import { voiceLine, voiceParent, type VoiceRow } from "./voices";

/** The selected row of an events view that draws one media, and that media. */
export interface WaveformSelection {
  readonly key: string;
  readonly media: MediaLocation;
}

/** Returns the selected row of the Structure view if it is a sound with media. */
export function treeSelection(
  rows: readonly EventRow[],
  selected: string | null,
): WaveformSelection | null {
  const row = rows.find((each) => each.key === selected);
  if (row?.kind !== "node" || row.node.kind !== "sound" || row.node.media === null) return null;

  return { key: row.key, media: row.node.media };
}

/** Returns the selected row of the Voices view if it draws a voice with media. */
export function voiceSelection(
  rows: readonly VoiceRow[],
  selected: string | null,
): WaveformSelection | null {
  const row = rows.find((each) => each.key === selected);
  const node = voiceLine(row)?.voice.node;
  if (row === undefined || node?.kind !== "sound" || node.media === null) return null;

  return { key: row.key, media: node.media };
}

/**
 * Returns the Structure row that `row` of the Voices view stands for, and the row above it, which
 * the copy and the context menu read.
 *
 * Returns null for a row without an object.
 */
export function structureRow(row: VoiceRow): { row: EventRow; parent?: EventRow } | null {
  const base = { key: row.key, depth: row.depth, parent: row.parent, expandable: false };
  if (row.kind === "event") return { row: { ...base, kind: "event", event: row.event } };
  if (row.kind === "group" && row.group.container === null) {
    return { row: { ...base, kind: "action", action: row.group.play } };
  }

  const placed =
    row.kind === "voice"
      ? { node: row.line.voice.node, above: row.line.voice }
      : row.kind === "group" && row.group.container !== null
        ? { node: row.group.container, above: row.group }
        : null;
  if (placed === null) return null;

  const shown: EventRow = { ...base, kind: "node", node: placed.node };
  const container = voiceParent(placed.above);
  if (container === null) return { row: shown };

  const count = container.children.length;
  return { row: shown, parent: { ...base, kind: "children", node: container, count } };
}
