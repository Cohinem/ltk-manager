import { toggledIn } from "@/utils";

import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { childPath, childSteps } from "../../engine/simulation/children";
import type { DrawnEmitter } from "../../rendering/utils/definitions";
import { type ChildLane, childLanes } from "./laneModel";

/** How the strip and the lanes name an emitter: its place in its own list, and which list. */
export interface EmitterPlace {
  readonly index: number;
  readonly simple: boolean;
}

/**
 * The emitter a card or a lane has open, as an index into the pool.
 *
 * A card is keyed on its place in its own list, so the join is that place plus which of
 * the two lists it came out of.
 */
export function chosenEmitter(
  system: SystemModel | null,
  place: EmitterPlace | undefined,
): number | null {
  if (system === null || place === undefined) return null;
  const held = system.emitters.find(
    (emitter: EmitterModel) => emitter.simple === place.simple && emitter.listIndex === place.index,
  );
  return held?.index ?? null;
}

/**
 * The pool indices of the emitters of `system` that `places` name, in the order of `places`.
 * A place that the system does not contain is skipped.
 */
export function chosenEmitters(
  system: SystemModel | null,
  places: readonly EmitterPlace[],
): number[] {
  return places.flatMap((place) => {
    const index = chosenEmitter(system, place);
    return index === null ? [] : [index];
  });
}

/** How a click on a lane name changes the selection: alone, toggled, or a range from the anchor. */
export type LaneHow = "only" | "toggle" | "range";

/** The selection a lane click leaves, the card the inspector opens, and the next range anchor. */
export interface LanePicks {
  readonly keys: ReadonlySet<string>;
  readonly open: string;
  readonly anchor: string;
}

/**
 * Returns the selection after a click of `how` on the lane `key`.
 *
 * `listed` is the lane order, which a range follows. A toggle never empties the selection, and
 * a toggle that removes the open card opens the first selected lane instead. A range without
 * an anchor in `listed` selects `key` alone.
 */
export function pickLanes(
  listed: readonly string[],
  held: ReadonlySet<string>,
  anchor: string | null,
  key: string,
  how: LaneHow,
): LanePicks {
  const from = anchor === null ? -1 : listed.indexOf(anchor);
  const to = listed.indexOf(key);

  if (how === "range" && anchor !== null && from >= 0 && to >= 0) {
    const keys = new Set(listed.slice(Math.min(from, to), Math.max(from, to) + 1));
    return { keys, open: key, anchor };
  }

  if (how === "toggle") {
    const keys = toggledIn(held, key);
    if (keys.size === 0) return { keys: new Set([key]), open: key, anchor: key };

    const open = keys.has(key) ? key : (listed.find((each) => keys.has(each)) ?? key);
    return { keys, open, anchor: key };
  }

  return { keys: new Set([key]), open: key, anchor: key };
}

/** Returns `held` without `members` if it holds all of them, and otherwise with all of them. */
export function togglesAll(held: ReadonlySet<number>, members: readonly number[]): Set<number> {
  const next = new Set(held);
  const all = members.every((member) => held.has(member));

  for (const member of members) {
    if (all) {
      next.delete(member);
    } else {
      next.add(member);
    }
  }

  return next;
}

/** What a lane head selects: an emitter of the opened system, or a child lane nested under one. */
export type LanePick =
  | { readonly kind: "emitter"; readonly emitter: EmitterModel }
  | { readonly kind: "child"; readonly lane: ChildLane; readonly parent: EmitterModel };

/**
 * The lane whose head selects `drawn`, or null for an emitter the system does not contain.
 *
 * The lanes nest one level of children. A deeper child selects the child lane it descends
 * from, and a child missing from the lane list selects its root's lane.
 */
export function drawnLane(system: SystemModel, drawn: DrawnEmitter): LanePick | null {
  const root = system.emitters.find((emitter) => emitter.index === drawn.root);
  if (root === undefined) return null;

  const [first, second] = childSteps(drawn.path);
  if (first === undefined) return { kind: "emitter", emitter: root };

  const path = childPath("", first.emitter, first.slot);
  const emitter = second === undefined ? drawn.emitter.index : second.emitter;
  const lane = childLanes(root).find(
    (each) => each.path === path && each.emitter.index === emitter,
  );
  if (lane === undefined) return { kind: "emitter", emitter: root };

  return { kind: "child", lane, parent: root };
}
