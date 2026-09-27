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
