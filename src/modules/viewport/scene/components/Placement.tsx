import { TransformControls } from "@react-three/drei";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Group } from "three";

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

/**
 * The subject stood somewhere in the scene, with a gizmo to move it by.
 *
 * A backdrop keeps the map's own coordinates, so a creator frames a shot by moving the
 * subject rather than the map. Rotation is yaw alone, which is the only one a unit
 * standing on ground has.
 *
 * The group's transform is written imperatively rather than as a prop, because the
 * gizmo mutates the same object and a re-render mid-drag would snap it back to the last
 * published value.
 */
export function Placement({ enabled, mode, position, facing, onMove, children }: PlacementProps) {
  const [held, setHeld] = useState<Group | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (held === null || dragging.current) return;
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
          /* Yaw alone: a champion stood on ground has no pitch and no roll. */
          showX={mode === "translate"}
          showZ={mode === "translate"}
          onMouseDown={() => {
            dragging.current = true;
          }}
          onMouseUp={() => {
            dragging.current = false;
            onMove({
              position: [held.position.x, held.position.y, held.position.z],
              facing: held.rotation.y,
            });
          }}
        />
      )}
    </>
  );
}
