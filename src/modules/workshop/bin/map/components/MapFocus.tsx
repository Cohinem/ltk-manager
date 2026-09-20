import type { CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import { useReducedMotion } from "@/hooks";
import { AXIS_SIGN, type SceneColors } from "@/modules/viewport";

import type { MapFocus as Focus } from "../state/mapScene";

/** The farthest the camera is left from a placeable it was sent to, in engine units. */
const FOCUS_REACH = 1500;

/** The marker's radius, in engine units, which is a champion across. */
const MARKER_RADIUS = 60;

export interface MapFocusProps {
  /** The placeable the outliner sent the camera to, and null before it sends one. */
  readonly focus: Focus | null;
  readonly colors: SceneColors;
}

/**
 * The camera carried to the placeable the outliner picked, and a marker where it stands.
 *
 * The camera keeps the angle the reader left it at and closes in only from farther than
 * `FOCUS_REACH`, so picking down a list pans rather than zooms.
 */
export function MapFocus({ focus, colors }: MapFocusProps) {
  const controls = useThree((state) => state.controls) as CameraControlsImpl | null;
  const reduceMotion = useReducedMotion();
  /* Mirrored the way the map's own group is. */
  const point = useMemo(
    () =>
      focus === null
        ? null
        : (focus.position.map((value, axis) => value * AXIS_SIGN[axis]) as [
            number,
            number,
            number,
          ]),
    [focus],
  );

  useEffect(() => {
    if (point === null || controls === null) return;
    void controls.moveTo(...point, !reduceMotion);
    if (controls.distance > FOCUS_REACH) void controls.dollyTo(FOCUS_REACH, !reduceMotion);
  }, [point, controls, reduceMotion]);

  if (point === null) return null;
  return (
    <mesh position={point}>
      <sphereGeometry args={[MARKER_RADIUS, 12, 8]} />
      <meshBasicMaterial color={colors.gizmo} wireframe depthTest={false} transparent />
    </mesh>
  );
}
