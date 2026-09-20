import type { CameraControlsImpl } from "@react-three/drei";

type Point = readonly [number, number, number];

/**
 * Stand `controls` at `position` looking at `target`, turning the short way round.
 *
 * `setLookAt` lands its azimuth inside one turn and leaves the one it moves from as the
 * reader's drags wound it, so a move crosses every turn between them and one across the
 * seam behind the target goes the long way. `normalizeRotations` brings the two within
 * half a turn of each other, which the library leaves to its caller.
 */
export function lookAtShortest(
  controls: CameraControlsImpl,
  position: Point,
  target: Point,
  animated: boolean,
): void {
  void controls.setLookAt(...position, ...target, animated);
  controls.normalizeRotations();
}
