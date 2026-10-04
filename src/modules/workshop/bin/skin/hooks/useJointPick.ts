import { useCallback, useRef } from "react";

import type { Pose } from "@/modules/viewport";

export interface JointPick {
  /** Select the joint at `slot`, or clear the selection where it is the selected one. */
  readonly pickJoint: (slot: number) => void;
  /** Pick a submesh, unless the same click picked a joint. */
  readonly pickSubmesh: (name: string | null) => void;
}

/**
 * The joint pick of a skin's viewport, and the submesh pick that yields to it.
 *
 * A click that lands on a joint picks the joint, and the submesh under it is left alone.
 */
export function useJointPick(
  pose: Pose | null,
  selected: number,
  setJoint: (joint: string | null) => void,
  pickSubmesh: (name: string | null) => void,
): JointPick {
  const taken = useRef(false);

  const pickJoint = useCallback(
    (slot: number) => {
      const name = pose?.skeleton.joints[slot]?.name;
      if (name === undefined) return;

      /* Both picks answer one pointer release, and the mark is dropped once it is over. */
      taken.current = true;
      window.setTimeout(() => {
        taken.current = false;
      });

      setJoint(slot === selected ? null : name);
    },
    [pose, selected, setJoint],
  );

  const pickSubmeshUnlessJoint = useCallback(
    (name: string | null) => {
      if (!taken.current) pickSubmesh(name);
    },
    [pickSubmesh],
  );

  return { pickJoint, pickSubmesh: pickSubmeshUnlessJoint };
}
