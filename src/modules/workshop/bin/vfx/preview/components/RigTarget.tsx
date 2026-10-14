import { TransformControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group } from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import { beamReach } from "../../engine/model/autoRig";
import { aimedAt, type Point, retargeted } from "../../engine/model/rig";
import { useVfxRun } from "../../playback/state/run";

interface Props {
  /** Called on each press on the gizmo, so that a viewport pick ignores the press. */
  onGrab?: () => void;
}

/**
 * Translate gizmo on the system's target, for a still rig and a flight.
 *
 * Each drag step writes the target to the rig as a custom choice: the still rig's `target`,
 * or the flight's landing point. If the system has a [`beamReach`], a still rig's drag sets
 * only the direction, and the target stays on the ground at that reach, as the game keeps a
 * fixed-range beam at the end of its range. The driver reads the rig every frame, so beams and
 * the flight follow the drag while the run keeps playing.
 */
export function RigTarget({ onGrab }: Props) {
  const { driver, system, rig, setRig } = useVfxRun();
  const object = useMemo(() => new Group(), []);
  const reach = useMemo(
    () => (system === null ? null : beamReach(system.emitters.filter((each) => !each.disabled))),
    [system],
  );
  const dragging = useRef(false);

  useFrame(() => {
    if (dragging.current) return;

    const [x, y, z] = driver.target;
    object.position.set(x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]);
    object.updateMatrixWorld();
  });

  function change() {
    if (!dragging.current) return;

    const { x, y, z } = object.position;
    const dragged: Point = [x * AXIS_SIGN[0], y * AXIS_SIGN[1] - rig.rig.height, z * AXIS_SIGN[2]];
    const aimed = reach !== null && rig.rig.motion.kind === "still";
    const target = aimed ? aimedAt(dragged, reach) : dragged;
    if (target === null || !target.every(Number.isFinite)) return;

    const motion = retargeted(rig.rig.motion, target);
    if (motion === null) return;

    if (aimed) {
      object.position.set(
        target[0] * AXIS_SIGN[0],
        (target[1] + rig.rig.height) * AXIS_SIGN[1],
        target[2] * AXIS_SIGN[2],
      );
    }

    setRig({ source: { kind: "custom" }, rig: { ...rig.rig, motion } });
  }

  return (
    <>
      <primitive object={object} />
      <TransformControls
        object={object}
        mode="translate"
        space="world"
        onMouseDown={() => {
          onGrab?.();
          dragging.current = true;
        }}
        onObjectChange={change}
        onMouseUp={() => {
          dragging.current = false;
        }}
      />
    </>
  );
}
