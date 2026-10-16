import type { LeafValue, PropertyEdit, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmitterPlace } from "../../clipboard/emitterCopy";
import type { EmitterModel } from "../../engine/model/model";
import { barFields, type BarGrip } from "./barDrag";
import type { LaneBar } from "./laneModel";

/** The emitter fields the timeline writes, by name. */
export const TIMING = {
  timeBeforeFirstEmission: nameHash("timeBeforeFirstEmission"),
  lifetime: nameHash("lifetime"),
  particleLinger: nameHash("particleLinger"),
  period: nameHash("period"),
  timeActiveDuringPeriod: nameHash("timeActiveDuringPeriod"),
  isSingleParticle: nameHash("isSingleParticle"),
  emitterLinger: nameHash("emitterLinger"),
  particleLingerType: nameHash("particleLingerType"),
  HasVariableStartTime: nameHash("HasVariableStartTime"),
} as const;

export type TimingName = keyof typeof TIMING;

/**
 * The edits that write `values` onto the emitter at `index` of its list, all under the list's
 * one property, so a drag that moves two fields is one undo step. A field the emitter lacks
 * is added first.
 */
export function timingEdits(
  index: number,
  values: readonly { readonly field: TimingName; readonly value: LeafValue }[],
): ValueEdit[] {
  const item = `[${index}]`;
  return values.flatMap(({ field, value }): ValueEdit[] => [
    { type: "ensureProperty", path: item, field: TIMING[field] },
    { type: "setLeaf", path: `${item}.${TIMING[field].slice(2)}`, value },
  ]);
}

/**
 * Returns the edits that write the fields a drag of `grip` sets on each bar of `moved`, one per
 * emitter list of the system `entry`, so the drag of several bars is one undo step.
 */
export function draggedEdits(
  entry: string,
  grip: BarGrip,
  moved: readonly { readonly place: EmitterPlace; readonly bar: LaneBar }[],
): PropertyEdit[] {
  const lists = new Map<string, ValueEdit[]>();
  for (const { place, bar } of moved) {
    const values = barFields(grip, bar).map(({ field, value }) => ({
      field,
      value: seconds(value),
    }));
    lists.set(place.list, [...(lists.get(place.list) ?? []), ...timingEdits(place.index, values)]);
  }

  return [...lists].map(([field, edits]) => ({ entry, holder: "", field, edits }));
}

/** The edit that empties the optional `field` of the emitter at `index`, which then reads unset. */
export function clearedEdits(index: number, field: TimingName): ValueEdit[] {
  return [{ type: "removeItem", path: `[${index}].${TIMING[field].slice(2)}[0]` }];
}

export function seconds(value: number): LeafValue {
  return { type: "float", value };
}

/** `emitter` with the timing `bar` draws, for the preview a drag runs. */
export function withBar(emitter: EmitterModel, bar: LaneBar): EmitterModel {
  return {
    ...emitter,
    timeBeforeFirstEmission: bar.start,
    lifetime: bar.end,
    particleLinger: bar.linger,
  };
}
