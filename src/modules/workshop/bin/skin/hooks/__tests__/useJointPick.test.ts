// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Pose } from "@/modules/viewport";

import { useJointPick } from "../useJointPick";

const POSE = {
  skeleton: { joints: [{ name: "Root" }, { name: "Tail" }] },
} as unknown as Pose;

function picks(selected = -1) {
  const setJoint = vi.fn();
  const pickSubmesh = vi.fn();
  const { result } = renderHook(() => useJointPick(POSE, selected, setJoint, pickSubmesh));

  return { pick: result.current, setJoint, pickSubmesh };
}

describe("useJointPick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects the joint a click lands on, by name", () => {
    const { pick, setJoint } = picks();

    pick.pickJoint(1);

    expect(setJoint).toHaveBeenCalledWith("Tail");
  });

  it("clears the selection on a click of the selected joint", () => {
    const { pick, setJoint } = picks(1);

    pick.pickJoint(1);

    expect(setJoint).toHaveBeenCalledWith(null);
  });

  it("picks nothing for a slot the skeleton does not hold", () => {
    const { pick, setJoint } = picks();

    pick.pickJoint(5);

    expect(setJoint).not.toHaveBeenCalled();
  });

  it("leaves the submesh under a picked joint alone", () => {
    const { pick, pickSubmesh } = picks();

    pick.pickJoint(0);
    pick.pickSubmesh("Body");

    expect(pickSubmesh).not.toHaveBeenCalled();
  });

  it("takes the next submesh click after a joint pick that reached no submesh", () => {
    const { pick, pickSubmesh } = picks();
    pick.pickJoint(0);
    vi.runAllTimers();

    pick.pickSubmesh("Body");

    expect(pickSubmesh).toHaveBeenCalledWith("Body");
  });
});
