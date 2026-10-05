import { describe, expect, it } from "vitest";

import type { EmitterModel } from "../../../engine/model/model";
import type { Point } from "../../../engine/model/rig";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { NO_TRANSFORM, type World } from "../../../engine/simulation/integrate";
import { identityInto, turnInto, yawInto } from "../../../engine/utils/basis";
import { spawnFrameInto, spawnOriginInto, wireframeInto } from "../emitterShape";

const UNTURNED = identityInto(new Float32Array(9));

/** The system facing `+X`, a quarter turn about the up axis: `+X` goes to `-Z`, `+Z` to `+X`. */
const QUARTER = yawInto([1, 0, 0], new Float32Array(9));

/** The same quarter turn, as `rotationOverride` writes it. */
const QUARTER_OVERRIDE: Point = [0, 90, 0];

/** A basis stretching `X` by `factor` and nothing else. */
function stretched(factor: number): Float32Array {
  return Float32Array.of(factor, 0, 0, 0, 1, 0, 0, 0, 1);
}

/** `point` turned by the spawn frame of `emitter`. */
function framed(
  over: Partial<EmitterModel>,
  point: Point,
  transform = UNTURNED,
  orientation = UNTURNED,
): number[] {
  const frame = new Float32Array(9);
  spawnFrameInto(emitterOf(0, over), transform, orientation, frame);

  const out = Float32Array.from(point);
  turnInto(frame, out, 0);
  return Array.from(out);
}

/** `actual` against `expected`, component by component. */
function expectPoint(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 4));
}

describe("spawnFrameInto", () => {
  it("is the identity for an emitter overriding nothing under an unturned system", () => {
    expectPoint(framed({}, [1, 2, 3]), [1, 2, 3]);
  });

  it("scales by scaleOverride before it turns by rotationOverride", () => {
    const over = { rotationOverride: QUARTER_OVERRIDE, scaleOverride: [2, 1, 1] as Point };

    expectPoint(framed(over, [1, 0, 0]), [0, 0, -2]);
    expectPoint(framed(over, [0, 0, 1]), [1, 0, 0]);
  });

  it("applies the definition's transform first, inside the override", () => {
    const over = { rotationOverride: QUARTER_OVERRIDE };

    /* The stretch lands on the point's own `X`, which the override then turns to `-Z`. */
    expectPoint(framed(over, [1, 0, 0], stretched(3)), [0, 0, -3]);
    expectPoint(framed(over, [0, 0, 1], stretched(3)), [1, 0, 0]);
  });

  it("applies the system's orientation last, outside the override", () => {
    const over = { scaleOverride: [2, 1, 1] as Point };

    expectPoint(framed(over, [1, 0, 0], UNTURNED, QUARTER), [0, 0, -2]);
    expectPoint(framed(over, [0, 0, 1], UNTURNED, QUARTER), [1, 0, 0]);
  });

  it("composes orientation, override and transform in that order", () => {
    const over = { rotationOverride: QUARTER_OVERRIDE, scaleOverride: [1, 1, 5] as Point };

    /* `X` is stretched to 3 by the transform, turned to `-Z` by the override, and to `-X`
       by the system. `Z` is scaled to 5, turned to `X`, and then to `-Z`. */
    expectPoint(framed(over, [1, 0, 0], stretched(3), QUARTER), [-3, 0, 0]);
    expectPoint(framed(over, [0, 0, 1], stretched(3), QUARTER), [0, 0, -5]);
  });

  it("leaves the system's orientation out where isLocalOrientation is off", () => {
    const over = { localOrientation: false, rotationOverride: QUARTER_OVERRIDE };

    expectPoint(framed(over, [1, 0, 0], stretched(3), QUARTER), [0, 0, -3]);
  });
});

/** Where the frame of `emitter` stands for a system at `origin`. */
function originOf(
  over: Partial<EmitterModel>,
  origin: Point,
  world: World = NO_TRANSFORM,
  orientation = UNTURNED,
): number[] {
  const out = new Float32Array(3);
  spawnOriginInto(emitterOf(0, over), world, orientation, origin, out);
  return Array.from(out);
}

function worldOf(offset: Point, hud = false): World {
  return { basis: identityInto(new Float32Array(9)), offset, hud };
}

describe("spawnOriginInto", () => {
  it("stands at the system's origin for an emitter overriding nothing", () => {
    expectPoint(originOf({}, [1, 2, 3]), [1, 2, 3]);
  });

  it("adds translationOverride as written, turned by no rotationOverride and no scaleOverride", () => {
    const over: Partial<EmitterModel> = {
      translationOverride: [10, 0, 0],
      rotationOverride: QUARTER_OVERRIDE,
      scaleOverride: [3, 3, 3],
    };

    expectPoint(originOf(over, [1, 2, 3]), [11, 2, 3]);
  });

  it("turns translationOverride by the system's orientation, and by nothing without isLocalOrientation", () => {
    const over: Partial<EmitterModel> = { translationOverride: [10, 0, 0] };

    expectPoint(originOf(over, [1, 2, 3], NO_TRANSFORM, QUARTER), [1, 2, -7]);
    expectPoint(
      originOf({ ...over, localOrientation: false }, [1, 2, 3], NO_TRANSFORM, QUARTER),
      [11, 2, 3],
    );
  });

  it("stands the transform's translation inside the frame, scaled and turned by the override", () => {
    const over: Partial<EmitterModel> = {
      rotationOverride: QUARTER_OVERRIDE,
      scaleOverride: [2, 1, 1],
    };

    expectPoint(originOf(over, [0, 0, 0], worldOf([5, 0, 0])), [0, 0, -10]);
    expectPoint(originOf({}, [1, 2, 3], worldOf([5, 6, 7])), [6, 8, 10]);
  });

  it("turns the transform's translation by the system's orientation after the override", () => {
    const over: Partial<EmitterModel> = {
      rotationOverride: QUARTER_OVERRIDE,
      scaleOverride: [2, 1, 1],
      translationOverride: [0, 0, 4],
    };

    /* The translation goes to `-Z` by 10 inside the override and to `-X` under the system.
       `translationOverride` takes the system's turn alone, `+Z` to `+X`. */
    expectPoint(originOf(over, [0, 100, 0], worldOf([5, 0, 0]), QUARTER), [-10 + 4, 100, 0]);
  });

  it("adds no transform translation for a HUD-layer system, whose origin already carries it", () => {
    const over: Partial<EmitterModel> = { translationOverride: [10, 0, 0] };

    expectPoint(originOf(over, [1, 2, 3], worldOf([5, 6, 7], true)), [11, 2, 3]);
  });
});

describe("wireframeInto", () => {
  /** The vertex at `at` of `out`. */
  const vertex = (out: Float32Array, at: number) => Array.from(out.subarray(at * 3, at * 3 + 3));

  it("marks the frame's own origin, where EmitterPosition stands off it, and the span between", () => {
    const out = new Float32Array(64 * 3);
    const written = wireframeInto(emitterOf(0), Float32Array.of(0, 50, 0), 0, out);

    /* A cross of three arms, the span, a cross at the offset, and the point shape's cross. */
    expect(written).toBe(6 + 2 + 6 + 6);
    expect(vertex(out, 0)).toEqual([-8, 0, 0]);
    expect(vertex(out, 1)).toEqual([8, 0, 0]);
    expect(vertex(out, 6)).toEqual([0, 0, 0]);
    expect(vertex(out, 7)).toEqual([0, 50, 0]);
    expect(vertex(out, 8)).toEqual([-8, 50, 0]);
    expect(vertex(out, 9)).toEqual([8, 50, 0]);
  });

  it("writes no translationOverride inside the frame, which the frame's origin carries", () => {
    const moved = emitterOf(0, { translationOverride: [300, 0, 0] });
    const plain = new Float32Array(64 * 3);
    const out = new Float32Array(64 * 3);

    wireframeInto(emitterOf(0), Float32Array.of(0, 50, 0), 0, plain);
    wireframeInto(moved, Float32Array.of(0, 50, 0), 0, out);

    expect(Array.from(out)).toEqual(Array.from(plain));
  });

  it("draws the shape about the offset, a point shape's own offset added to it", () => {
    const out = new Float32Array(64 * 3);
    const shaped = emitterOf(0, { shape: { kind: "point", offset: [0, 0, 20] } });

    const written = wireframeInto(shaped, Float32Array.of(0, 50, 0), 0, out);

    expect(vertex(out, written - 2)).toEqual([0, 50, 12]);
    expect(vertex(out, written - 1)).toEqual([0, 50, 28]);
  });
});
