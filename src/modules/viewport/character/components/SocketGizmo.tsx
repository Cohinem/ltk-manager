import { TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { type Group, Matrix4, type Object3D, Quaternion, Vector3 } from "three";

import type { Pose } from "../../animation/evaluation/pose";
import type { SceneClock } from "../../animation/state/clock";
import type { Vec3 } from "../../dynamics/model";
import type { PlacementMode } from "../../scene/components/Placement";
import {
  dragged,
  type Grab,
  holds,
  type Released,
  type Standing,
  toScene,
  toSkeleton,
} from "../utils/socketHandle";

/** Where a drag left a socket, in the skeleton's space. */
export interface SocketPlace {
  readonly position: Vec3;
  /** The facing as a quaternion, `x`, `y`, `z`, `w`. */
  readonly rotation: readonly [number, number, number, number];
  /** The clock's time at the release, which is the pose the place is measured on. */
  readonly time: number;
}

export interface SocketGizmoProps {
  /** The pose the character draws, which answers the socket's slot. */
  readonly pose: Pose;
  readonly clock: SceneClock;
  /** `skinScale`, which the character is drawn at. */
  readonly scale: number;
  /** The slot the socket answers under on `pose`. */
  readonly slot: number;
  readonly mode: PlacementMode;
  /** Where the character stands in the scene, read where `anchor` holds no object. */
  readonly position: readonly [number, number, number];
  /** The character's yaw in radians, read where `anchor` holds no object. */
  readonly facing: number;
  /** An object in the group a placement gizmo moves, whose parent is where the unit stands. */
  readonly anchor?: RefObject<Object3D | null>;
  readonly onMove: (place: SocketPlace) => void;
}

const UP = new Vector3(0, 1, 0);

/** The gizmo's size, as a share of the size a placement gizmo draws at. */
const HANDLE_SIZE = 0.7;

/**
 * A gizmo that moves or turns one socket of the character.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md. The handle stands in the scene's own space
 * and not under the character's mirrored group, since the gizmo turns the wrong way under
 * a mirror. So the socket's place is carried out to the scene each frame, and a drag's
 * result is carried back to the skeleton's space on release.
 */
export function SocketGizmo({
  pose,
  clock,
  scale,
  slot,
  mode,
  position,
  facing,
  anchor,
  onMove,
}: SocketGizmoProps) {
  const [held, setHeld] = useState<Group | null>(null);
  const grab = useRef<Grab | null>(null);
  /* The handle stays where a drag dropped it until the edit reaches the pose, since
     following the socket before the edit lands reads as a snap back. */
  const released = useRef<Released | null>(null);
  const scratch = useMemo(
    () => ({
      world: new Float32Array(16),
      matrix: new Matrix4(),
      place: new Vector3(),
      turn: new Quaternion(),
      size: new Vector3(),
      unit: { position: new Vector3(), turn: new Quaternion() },
    }),
    [],
  );
  const drawnAt = scale || 1;
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;

  /* drei stops listening for the end of a drag when the gizmo unmounts, which leaves the
     scene's controls off where a drag was under way. */
  useEffect(
    () => () => {
      if (grab.current !== null && controls !== null) {
        controls.enabled = true;
      }
    },
    [controls],
  );

  /* The props report a placement on its release alone, so a unit being dragged is read
     off the group the placement gizmo moves. */
  const standing = (): Standing => {
    const { unit } = scratch;
    const group = anchor?.current?.parent ?? null;

    if (group === null) {
      unit.position.set(position[0], position[1], position[2]);
      unit.turn.setFromAxisAngle(UP, facing);
    } else {
      unit.position.copy(group.position);
      unit.turn.copy(group.quaternion);
    }

    return unit;
  };

  /* The handle follows the socket through the clip until a drag takes it. */
  useFrame(() => {
    if (held === null || grab.current !== null) return;
    if (holds(released.current, pose, slot, performance.now())) return;

    released.current = null;
    const { world, matrix, place, turn, size } = scratch;
    matrix.fromArray(pose.worldInto(slot, clock.time, world)).decompose(place, turn, size);
    toScene(place, turn, standing(), drawnAt);

    held.position.copy(place);
    held.quaternion.copy(turn);
  });

  const press = () => {
    if (held === null) return;

    grab.current = { slot, position: held.position.clone(), quaternion: held.quaternion.clone() };
  };

  const release = () => {
    const from = grab.current;
    grab.current = null;
    if (held === null || !dragged(from, slot, held)) return;

    released.current = { pose, slot, at: performance.now() };
    const { place, turn } = scratch;
    place.copy(held.position);
    turn.copy(held.quaternion);
    toSkeleton(place, turn, standing(), drawnAt);

    onMove({
      position: [place.x, place.y, place.z],
      rotation: [turn.x, turn.y, turn.z, turn.w],
      time: clock.time,
    });
  };

  return (
    <>
      <group ref={setHeld} />
      {held !== null && (
        <TransformControls
          object={held}
          mode={mode}
          /* A turn is about the socket's own axes, which are what its angles are of. */
          space={mode === "rotate" ? "local" : "world"}
          size={HANDLE_SIZE}
          onMouseDown={press}
          onMouseUp={release}
        />
      )}
    </>
  );
}
