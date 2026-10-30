import { describe, expect, it } from "vitest";

import { afterEdit, afterStep, NO_HISTORY } from "../bankHistory";

describe("afterEdit", () => {
  it("adds an undo step and drops every redo step", () => {
    expect(afterEdit({ undo: 2, redo: 3 })).toEqual({ undo: 3, redo: 0 });
  });
});

describe("afterStep", () => {
  it("moves one step from undo to redo on an undo", () => {
    expect(afterStep({ undo: 2, redo: 0 }, "undo", true)).toEqual({ undo: 1, redo: 1 });
  });

  it("moves one step from redo to undo on a redo", () => {
    expect(afterStep({ undo: 0, redo: 2 }, "redo", true)).toEqual({ undo: 1, redo: 1 });
  });

  it("empties the direction if the bank took no step", () => {
    expect(afterStep({ undo: 4, redo: 1 }, "undo", false)).toEqual({ undo: 0, redo: 1 });
    expect(afterStep({ undo: 4, redo: 1 }, "redo", false)).toEqual({ undo: 4, redo: 0 });
  });

  it("starts from no history", () => {
    expect(afterStep(NO_HISTORY, "undo", true)).toEqual({ undo: 0, redo: 1 });
  });
});
