import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { Pose } from "../../../animation/evaluation/pose";
import {
  dragged,
  type Grab,
  holds,
  SETTLE_MS,
  type Standing,
  toScene,
  toSkeleton,
} from "../socketHandle";

const UP = new Vector3(0, 1, 0);

/** Two poses told apart by identity, which is all a hold reads of one. */
const POSE = {} as Pose;
const EDITED = {} as Pose;

function grabAt(slot: number): Grab {
  return { slot, position: new Vector3(1, 2, 3), quaternion: new Quaternion() };
}

function rounded(values: readonly number[]): number[] {
  return values.map((value) => Math.round(value * 1e4) / 1e4 + 0);
}

describe("dragged", () => {
  it("is no drag for a press and release that left the handle where it was", () => {
    const handle = { position: new Vector3(1, 2, 3), quaternion: new Quaternion() };

    expect(dragged(grabAt(4), 4, handle)).toBe(false);
  });

  it("is a drag for a handle that moved, and for one that turned", () => {
    const moved = { position: new Vector3(1, 2, 4), quaternion: new Quaternion() };
    const turned = {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion().setFromAxisAngle(UP, 0.1),
    };

    expect(dragged(grabAt(4), 4, moved)).toBe(true);
    expect(dragged(grabAt(4), 4, turned)).toBe(true);
  });

  it("is no drag for a release on another socket than the press, or with no press", () => {
    const moved = { position: new Vector3(1, 2, 4), quaternion: new Quaternion() };

    expect(dragged(grabAt(4), 5, moved)).toBe(false);
    expect(dragged(null, 4, moved)).toBe(false);
  });
});

describe("holds", () => {
  const released = { pose: POSE, slot: 4, at: 1000 };

  it("holds the handle on the socket and the pose it was released on, for the settle time", () => {
    expect(holds(released, POSE, 4, 1000 + SETTLE_MS - 1)).toBe(true);
    expect(holds(released, POSE, 4, 1000 + SETTLE_MS)).toBe(false);
  });

  it("lets the handle go once the pose changes, and once another socket is picked", () => {
    expect(holds(released, EDITED, 4, 1001)).toBe(false);
    expect(holds(released, POSE, 5, 1001)).toBe(false);
    expect(holds(null, POSE, 4, 1001)).toBe(false);
  });
});

describe("toScene", () => {
  const unit: Standing = {
    position: new Vector3(10, 0, 20),
    turn: new Quaternion().setFromAxisAngle(UP, Math.PI / 2),
  };

  it("mirrors a place on X, scales it, turns it with the unit and stands it where the unit is", () => {
    const place = new Vector3(1, 2, 3);

    toScene(place, new Quaternion(), unit, 2);

    expect(rounded(place.toArray())).toEqual([16, 4, 22]);
  });

  it("reverses a turn about the up axis across the mirror, and keeps one about X", () => {
    const still: Standing = { position: new Vector3(), turn: new Quaternion() };
    const yaw = new Quaternion().setFromAxisAngle(UP, 0.5);
    const pitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5);

    toScene(new Vector3(), yaw, still, 1);
    toScene(new Vector3(), pitch, still, 1);

    expect(rounded(yaw.toArray())).toEqual(
      rounded(new Quaternion().setFromAxisAngle(UP, -0.5).toArray()),
    );
    expect(rounded(pitch.toArray())).toEqual(
      rounded(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5).toArray()),
    );
  });

  it("is undone by toSkeleton", () => {
    const place = new Vector3(1, 2, 3);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 1, 0).normalize(), 0.7);
    const facing = turn.toArray();

    toScene(place, turn, unit, 2);
    toSkeleton(place, turn, unit, 2);

    expect(rounded(place.toArray())).toEqual([1, 2, 3]);
    expect(rounded(turn.toArray())).toEqual(rounded(facing));
  });
});
