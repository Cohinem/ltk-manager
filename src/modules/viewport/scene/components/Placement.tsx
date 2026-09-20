import { TransformControls } from "@react-three/drei";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Group, Vector3 } from "three";

/** How a placement gizmo is being dragged. */
export type PlacementMode = "translate" | "rotate";

/** Where the subject stands and which way it faces, in the scene's own space. */
export interface Placed {
  readonly position: readonly [number, number, number];
  /** Yaw in radians, the only rotation a unit standing on ground has. */
  readonly facing: number;
}

export interface PlacementProps extends Placed {
  /** The gizmo is drawn and the subject can be dragged by it. */
  readonly enabled: boolean;
  readonly mode: PlacementMode;
  readonly onMove: (placed: Placed) => void;
  readonly children: ReactNode;
}

/** Scratch the facing is read in. */
const FACING = new Vector3();

/** How far two placements may differ and still count as the same one. */
const SAME = 1e-4;

/**
 * The subject stood somewhere in the scene, with a gizmo to move it by.
 *
 * A backdrop keeps the map's own coordinates, so a creator frames a shot by moving the
 * subject rather than the map. Rotation is yaw alone, which is the only one a unit
 * standing on ground has.
 *
 * The group's transform is written imperatively rather than as a prop, because the gizmo
 * mutates the same object and a re-render would otherwise put it back where the last
 * published value had it.
 */
export function Placement({ enabled, mode, position, facing, onMove, children }: PlacementProps) {
  const [held, setHeld] = useState<Group | null>(null);
  /* What this component last published. A placement that comes back in matching it is
     the gizmo's own drag returning, so the group already stands there and writing it
     again is what a drag reads as a snap. */
  const published = useRef<Placed | null>(null);

  useEffect(() => {
    if (held === null) return;
    const own = published.current;
    if (own !== null && same(own, position, facing)) return;
    held.position.set(position[0], position[1], position[2]);
    held.rotation.set(0, facing, 0);
  }, [held, position, facing]);

  return (
    <>
      <group ref={setHeld}>{children}</group>
      {enabled && held !== null && (
        <TransformControls
          object={held}
          mode={mode}
          /* Yaw alone: a champion stood on ground has no pitch and no roll. The screen
             and free rings stay on whatever these say, so the flattening below is what
             actually keeps the subject upright. */
          showX={mode === "translate"}
          showZ={mode === "translate"}
          onObjectChange={() => {
            if (mode === "rotate") held.rotation.set(0, yawOf(held), 0);
          }}
          onMouseUp={() => {
            const placed: Placed = {
              position: [held.position.x, held.position.y, held.position.z],
              facing: held.rotation.y,
            };
            published.current = placed;
            onMove(placed);
          }}
        />
      )}
    </>
  );
}

/**
 * Which way `held` faces about the up axis, whichever ring turned it.
 *
 * The gizmo's screen ring and its free sphere turn about axes of their own, so a drag on
 * either leaves a rotation that is not a yaw. Reading the yaw back out and writing it
 * alone keeps the subject upright while the drag is still under way, rather than
 * righting it on release where it reads as the gizmo undoing the drag.
 */
function yawOf(held: Group): number {
  FACING.set(0, 0, 1).applyQuaternion(held.quaternion);
  return Math.atan2(FACING.x, FACING.z);
}

function same(own: Placed, position: readonly [number, number, number], facing: number): boolean {
  return (
    Math.abs(own.facing - facing) < SAME &&
    own.position.every((value, axis) => Math.abs(value - position[axis]) < SAME)
  );
}
