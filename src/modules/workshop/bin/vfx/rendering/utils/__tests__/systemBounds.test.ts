import { describe, expect, it } from "vitest";

import { DRAG_MOTION } from "../../../engine/model/enums";
import type { EmitterModel, SystemModel } from "../../../engine/model/model";
import { flightPath, type RigModel } from "../../../engine/model/rig";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import type { DrawnEmitter } from "../definitions";
import { definitionBounds, rigGround, STANDING_REACH } from "../systemBounds";

/** A rig standing still, a champion's half height off the ground. */
const STILL: RigModel = { motion: { kind: "still" }, life: "once", height: 100 };

/** A rig flying 1200 units across the origin at that height. */
const FLYING: RigModel = { motion: flightPath(1200, 800), life: "loop", height: 100 };

function systemOf(...emitters: EmitterModel[]): SystemModel {
  return {
    entry: null,
    name: null,
    emitters,
    transform: null,
    hudLayer: false,
    dragMotion: DRAG_MOTION.stepped,
    buildUpTime: 0,
  };
}

/** A `transform` that turns nothing and moves by `x` along the engine's X. */
function movedBy(x: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
}

function drawnOf(emitter: EmitterModel, path = ""): DrawnEmitter {
  return { key: `${path}:${emitter.index}`, emitter, path, root: emitter.index, rank: 0 };
}

describe("definitionBounds", () => {
  it("frames a champion about a still rig, off the ground by the rig's height", () => {
    expect(definitionBounds(systemOf(), [], STILL)).toEqual({
      min: [-STANDING_REACH, 0, -STANDING_REACH],
      max: [STANDING_REACH, 200, STANDING_REACH],
    });
  });

  it("spans a flying rig from one end of its path to the other", () => {
    const bounds = definitionBounds(systemOf(), [], FLYING);

    expect(bounds.min[0]).toBe(-600 - STANDING_REACH);
    expect(bounds.max[0]).toBe(600 + STANDING_REACH);
    expect(bounds.max[1]).toBe(200);
  });

  it("reaches an emitter's spawn box where its offset stands it, across the mirrored axis", () => {
    const boxed = emitterOf(0, {
      translationOverride: [300, 0, 0],
      shape: { kind: "box", size: [50, 10, 20], volume: true },
    });

    const bounds = definitionBounds(systemOf(boxed), [drawnOf(boxed)], STILL);

    expect(bounds.min[0]).toBe(-350);
    expect(bounds.max[0]).toBe(STANDING_REACH);
  });

  it("stands translationOverride outside the emitter's own turn and scale", () => {
    const boxed = emitterOf(0, {
      translationOverride: [300, 0, 0],
      rotationOverride: [0, 90, 0],
      scaleOverride: [1, 1, 2],
      shape: { kind: "box", size: [50, 10, 20], volume: true },
    });

    const bounds = definitionBounds(systemOf(boxed), [drawnOf(boxed)], STILL);

    /* The box's Z half-extent of 20, doubled, is what the quarter turn lays along X. */
    expect(bounds.min[0]).toBeCloseTo(-340, 3);
  });

  it("stands the transform's translation inside the emitter's frame, scaled by its override", () => {
    const scaled = emitterOf(0, { scaleOverride: [2, 1, 1] });
    const system = { ...systemOf(scaled), transform: movedBy(500) };

    const bounds = definitionBounds(system, [drawnOf(scaled)], STILL);

    /* The translation doubles to 1000, and the mark's arm of 8 doubles with it. */
    expect(bounds.min[0]).toBe(-1016);
    expect(bounds.max[0]).toBe(STANDING_REACH);
  });

  it("moves a HUD-layer system whole by its transform's translation, the champion with it", () => {
    const scaled = emitterOf(0, { scaleOverride: [2, 1, 1] });
    const system = { ...systemOf(scaled), transform: movedBy(500), hudLayer: true };

    const bounds = definitionBounds(system, [drawnOf(scaled)], STILL);

    expect(bounds.min[0]).toBe(-500 - STANDING_REACH);
    expect(bounds.max[0]).toBe(-500 + STANDING_REACH);
  });

  it("is the same box at any moment of the run", () => {
    const boxed = emitterOf(0, { shape: { kind: "sphere", radius: 400, volume: false } });
    const drawn = [drawnOf(boxed)];

    expect(definitionBounds(systemOf(boxed), drawn, STILL)).toEqual(
      definitionBounds(systemOf(boxed), drawn, STILL),
    );
    expect(definitionBounds(systemOf(boxed), drawn, STILL).max[0]).toBe(400);
  });

  it("leaves out a disabled emitter and one of a child set", () => {
    const off = emitterOf(0, {
      disabled: true,
      shape: { kind: "sphere", radius: 900, volume: false },
    });
    const child = emitterOf(0, { shape: { kind: "sphere", radius: 900, volume: false } });

    const bounds = definitionBounds(systemOf(off), [drawnOf(off), drawnOf(child, "0:0")], STILL);

    expect(bounds.max[0]).toBe(STANDING_REACH);
  });
});

describe("rigGround", () => {
  it("stands under a still rig at the origin", () => {
    expect(rigGround(systemOf(), STILL)).toEqual([0, 0, 0]);
  });

  it("stands where a flying rig starts, on the ground and across the mirrored axis", () => {
    expect(rigGround(systemOf(), FLYING)).toEqual([600, 0, 0]);
  });

  it("stays under the rig for a transform's translation, which only a HUD-layer system stands by", () => {
    const moved = { ...systemOf(), transform: movedBy(500) };

    expect(rigGround(moved, STILL)).toEqual([0, 0, 0]);
    expect(rigGround({ ...moved, hudLayer: true }, STILL)).toEqual([-500, 0, 0]);
  });
});
