import type { AudioEvent, EventAction, EventNode, MediaLocation } from "@/lib/tauri";

import type { MixPath } from "./voiceMix";
import { rowAction, stepAncestors, voiceLine, type VoiceRow } from "./voices";

/** The selected row of the event tree that draws one media, that media and its mix path. */
export interface WaveformSelection {
  readonly key: string;
  readonly media: MediaLocation;
  readonly path: MixPath;
}

/** Returns the selected row of the event tree if it draws a voice with media. */
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

/** The object whose items a context menu lists: an event, an action, or a node. */
export type MenuSubject =
  | { readonly kind: "event"; readonly event: AudioEvent }
  | { readonly kind: "action"; readonly action: EventAction }
  | { readonly kind: "node"; readonly node: EventNode };

/**
 * Returns the object that the context menu of `row` lists the items of.
 *
 * The header of a Play action lists its action, a header its container, and a switch state that
 * is not one container its switch. Returns null for a row without an object.
 */
export function menuSubject(row: VoiceRow): MenuSubject | null {
  if (row.kind === "event") return { kind: "event", event: row.event };
  if (row.kind === "voice") return { kind: "node", node: row.line.voice.node };

  const action = rowAction(row);
  if (action !== null) return { kind: "action", action };
  if (row.kind !== "group") return null;

  const node = row.group.container ?? row.group.state?.switch ?? null;
  return node === null ? null : { kind: "node", node };
}
