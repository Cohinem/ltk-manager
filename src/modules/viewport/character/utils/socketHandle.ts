import { Quaternion, type Vector3 } from "three";

import type { Pose } from "../../animation/evaluation/pose";
import { AXIS_SIGN } from "../../shared/utils/space";

/** How long a released handle waits for its edit to reach the pose, in milliseconds. */
export const SETTLE_MS = 1000;

/**
 * What the components of a quaternion are multiplied by to carry a turn across the mirror
 * between the skeleton's space and the scene's. A turn's axis is mirrored as a pseudo
 * vector, so each component takes the signs of the other two axes.
 */
const TURN_SIGN = [
  AXIS_SIGN[1] * AXIS_SIGN[2],
  AXIS_SIGN[0] * AXIS_SIGN[2],
  AXIS_SIGN[0] * AXIS_SIGN[1],
] as const;

/** Where the unit stands in the scene and how it is turned. */
export interface Standing {
  readonly position: Vector3;
  readonly turn: Quaternion;
}

/** A place and a facing, which a handle and a grab of it both hold. */
interface Stood {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

/** A handle as a press found it, with the socket it stood for. */
export interface Grab extends Stood {
  readonly slot: number;
}

/** A drag released on a socket of a pose, at `at` milliseconds. */
export interface Released {
  readonly pose: Pose;
  readonly slot: number;
  readonly at: number;
}

/** Whether a release on `slot` ends a drag: `grab` is of that socket, and `handle` left it. */
export function dragged(grab: Grab | null, slot: number, handle: Stood): boolean {
  if (grab === null || grab.slot !== slot) return false;

  return !grab.position.equals(handle.position) || !grab.quaternion.equals(handle.quaternion);
}

/** Whether a handle still waits where `released` left it, `now` being in milliseconds. */
export function holds(released: Released | null, pose: Pose, slot: number, now: number): boolean {
  if (released === null || released.pose !== pose || released.slot !== slot) return false;

  return now - released.at < SETTLE_MS;
}

/** `place` and `turn` of the skeleton's space carried to the scene's, in place. */
export function toScene(place: Vector3, turn: Quaternion, unit: Standing, scale: number): void {
  place
    .set(place.x * AXIS_SIGN[0], place.y * AXIS_SIGN[1], place.z * AXIS_SIGN[2])
    .multiplyScalar(scale)
    .applyQuaternion(unit.turn)
    .add(unit.position);

  turn
    .set(turn.x * TURN_SIGN[0], turn.y * TURN_SIGN[1], turn.z * TURN_SIGN[2], turn.w)
    .premultiply(unit.turn);
}

/** `place` and `turn` of the scene's space carried to the skeleton's, in place. */
export function toSkeleton(place: Vector3, turn: Quaternion, unit: Standing, scale: number): void {
  BACK.copy(unit.turn).invert();

  place.sub(unit.position).applyQuaternion(BACK).divideScalar(scale);
  place.set(place.x * AXIS_SIGN[0], place.y * AXIS_SIGN[1], place.z * AXIS_SIGN[2]);

  turn.premultiply(BACK);
  turn.set(turn.x * TURN_SIGN[0], turn.y * TURN_SIGN[1], turn.z * TURN_SIGN[2], turn.w);
}

const BACK = new Quaternion();
