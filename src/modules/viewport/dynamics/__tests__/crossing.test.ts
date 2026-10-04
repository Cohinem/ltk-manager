import { describe, expect, it } from "vitest";

import {
  crossing,
  ENDS,
  ENDS_THEN_STARTS,
  endsFirst,
  endsLast,
  NONE,
  spanOf,
  STARTS,
  starts,
  STARTS_THEN_ENDS,
} from "../crossing";

describe("spanOf", () => {
  it("holds a cue with no end to the end of the pass", () => {
    expect(spanOf(0.25, null, 1)).toEqual({ at: 0.25, until: 1 });
  });

  it("cuts a cue that runs past the pass to the pass", () => {
    expect(spanOf(-0.5, 1.5, 1)).toEqual({ at: 0, until: 1 });
  });

  it("holds a cue that ends at or before its start to the end of the pass", () => {
    expect(spanOf(0.5, 0.5, 1)).toEqual({ at: 0.5, until: 1 });
    expect(spanOf(0.5, 0.2, 1)).toEqual({ at: 0.5, until: 1 });
  });

  it("answers nothing for a cue that starts at the end of the pass or past it", () => {
    expect(spanOf(1, null, 1)).toBeNull();
    expect(spanOf(1.5, 2, 1)).toBeNull();
  });
});

describe("crossing", () => {
  const span = { at: 0.25, until: 0.5 };

  it("crosses a moment the step ends on, and not one it starts on", () => {
    expect(crossing(span, 0.125, 0.25, 1)).toBe(STARTS);
    expect(crossing(span, 0.25, 0.375, 1)).toBe(NONE);
    expect(crossing(span, 0.375, 0.5, 1)).toBe(ENDS);
    expect(crossing(span, 0.5, 0.625, 1)).toBe(NONE);
  });

  it("starts and then ends a span the step holds whole", () => {
    expect(crossing(span, 0.125, 0.75, 1)).toBe(STARTS_THEN_ENDS);
  });

  it("ends and then starts a span whose end the step met first", () => {
    /* From inside the span, over the seam and into the span of the next pass. */
    expect(crossing(span, 0.375, 1.3, 1)).toBe(ENDS_THEN_STARTS);
  });

  it("takes the end of a pass and the start of the next for one moment, an end and then a start", () => {
    const whole = { at: 0, until: 1 };

    expect(crossing(whole, 0.875, 1, 1)).toBe(ENDS_THEN_STARTS);
    expect(crossing({ at: 0.5, until: 1 }, 0.875, 1, 1)).toBe(ENDS);
    expect(crossing({ at: 0, until: 0.5 }, 0.875, 1, 1)).toBe(STARTS);
  });

  it("starts a span at the start of the pass on the first step, with no pass before it to end", () => {
    expect(crossing({ at: 0, until: 1 }, -0.125, 0, 1)).toBe(STARTS);
    expect(crossing({ at: 0.5, until: 1 }, -0.125, 0, 1)).toBe(NONE);
  });

  it("crosses every moment on a step of a whole pass, and leaves the span as the pass's start has it", () => {
    expect(crossing(span, 0, 1, 1)).toBe(STARTS_THEN_ENDS);
    expect(crossing({ at: 0, until: 0.5 }, 0, 1, 1)).toBe(ENDS_THEN_STARTS);
  });

  it("crosses nothing on a step that stands still in the pass", () => {
    expect(crossing(span, 0.25, 0.25, 1)).toBe(NONE);
  });
});

describe("the order a crossing is applied in", () => {
  it("applies an end before a start, a start, and an end after a start", () => {
    const applied = (order: number) => [endsFirst(order), starts(order), endsLast(order)];

    expect(applied(NONE)).toEqual([false, false, false]);
    expect(applied(STARTS)).toEqual([false, true, false]);
    expect(applied(ENDS)).toEqual([true, false, false]);
    expect(applied(ENDS_THEN_STARTS)).toEqual([true, true, false]);
    expect(applied(STARTS_THEN_ENDS)).toEqual([false, true, true]);
  });
});
