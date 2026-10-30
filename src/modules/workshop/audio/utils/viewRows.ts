import type { MediaLocation } from "@/lib/tauri";

import type { EventRow } from "./eventTree";
import type { MixPath } from "./voiceMix";
import { stepAncestors, voiceLine, voiceParent, type VoiceRow } from "./voices";

/** The selected row of an events view that draws one media, that media and its mix path. */
export interface WaveformSelection {
  readonly key: string;
  readonly media: MediaLocation;
  readonly path: MixPath;
}

/** Returns the selected row of the Structure view if it is a sound with media. */
export function treeSelection(
  rows: readonly EventRow[],
  selected: string | null,
): WaveformSelection | null {
  const row = rows.find((each) => each.key === selected);
  if (row?.kind !== "node" || row.node.kind !== "sound" || row.node.media === null) return null;

  const byKey = new Map(rows.map((each) => [each.key, each]));
  const nodes = [row.node.id, ...treeAncestors(row, byKey)];
  return { key: row.key, media: row.node.media, path: { nodes, action: null } };
}

/** Returns the selected row of the Voices view if it draws a voice with media. */
export function voiceSelection(
  rows: readonly VoiceRow[],
  selected: string | null,
): WaveformSelection | null {
  const row = rows.find((each) => each.key === selected);
  const voice = voiceLine(row)?.voice;
  const node = voice?.node;
  if (row === undefined || voice === undefined || node?.kind !== "sound" || node.media === null) {
    return null;
  }

  const nodes = [node.id, ...stepAncestors(voice.path)];
  return { key: row.key, media: node.media, path: { nodes, action: null } };
}

/** Returns the IDs of the nodes above `row` of the Structure view, the innermost first. */
export function treeAncestors(row: EventRow, byKey: ReadonlyMap<string, EventRow>): number[] {
  const ancestors: number[] = [];
  for (let at = parentOf(row, byKey); at !== undefined; at = parentOf(at, byKey)) {
    if (at.kind === "node") ancestors.push(at.node.id);
  }

  return ancestors;
}

function parentOf(row: EventRow, byKey: ReadonlyMap<string, EventRow>): EventRow | undefined {
  return row.parent === null ? undefined : byKey.get(row.parent);
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
