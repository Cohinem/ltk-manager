import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

import { AXIS_SIGN } from "../../scene/utils/world";

export interface LiveRootProps {
  /**
   * The seconds a frame took, and where the group this sits in stands and faces in the
   * game's own space: a position, and a yaw in radians.
   */
  readonly onFrame: (seconds: number, position: readonly number[], yaw: number) => void;
}

/** A turn about the up axis crosses the mirror between the scene's space and the game's reversed. */
const YAW_SIGN = AXIS_SIGN[0] * AXIS_SIGN[2];

/**
 * After a clock that moves at -1 and before the readers of the pose at 0, whichever mounted
 * first. A priority under zero leaves the fibre's own render on.
 */
const BEFORE_THE_READERS = -0.5;

/**
 * Where the unit stands, frame by frame, for whatever simulates it live.
 *
 * It sits in the group a placement gizmo moves, so it reads a drag while the drag is under
 * way, which the gizmo itself reports only on release.
 */
export function LiveRoot({ onFrame }: LiveRootProps) {
  const held = useRef<Group>(null);
  const position = useRef([0, 0, 0]);

  useFrame((_, seconds) => {
    const unit = held.current?.parent;
    if (unit == null) return;

    position.current[0] = unit.position.x * AXIS_SIGN[0];
    position.current[1] = unit.position.y * AXIS_SIGN[1];
    position.current[2] = unit.position.z * AXIS_SIGN[2];
    onFrame(seconds, position.current, unit.rotation.y * YAW_SIGN);
  }, BEFORE_THE_READERS);

  return <group ref={held} />;
}
