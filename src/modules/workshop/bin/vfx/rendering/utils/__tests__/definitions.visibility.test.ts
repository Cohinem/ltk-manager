import { describe, expect, it } from "vitest";

import { type DrawVisibility, hiddenIn, underChild } from "../definitions";

function run(over: Partial<DrawVisibility> = {}): DrawVisibility {
  return {
    muted: new Set(),
    soloed: new Set(),
    mutedChildren: new Set(),
    soloedChildren: new Set(),
    ...over,
  };
}

const ROOT = { root: 3, path: "" };
const CHILD = { root: 3, path: "3.0" };
const SIBLING = { root: 3, path: "3.1" };
const GRANDCHILD = { root: 3, path: "3.0/1.0" };
const OTHER = { root: 5, path: "" };

describe("underChild", () => {
  it("matches a child's own path and every path under it", () => {
    const paths = new Set(["3.0"]);

    expect(underChild(paths, "3.0")).toBe(true);
    expect(underChild(paths, "3.0/1.0")).toBe(true);
  });

  it("matches neither the opened system's emitters nor a path that only starts alike", () => {
    const paths = new Set(["3.0"]);

    expect(underChild(paths, "")).toBe(false);
    expect(underChild(paths, "3.01")).toBe(false);
    expect(underChild(paths, "3.1")).toBe(false);
  });
});

describe("hiddenIn", () => {
  it("draws everything while nothing is muted or soloed", () => {
    expect([ROOT, CHILD, GRANDCHILD].map((each) => hiddenIn(each, run()))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("hides a muted emitter with every child it carries", () => {
    const muted = run({ muted: new Set([3]) });

    expect([ROOT, CHILD, GRANDCHILD, OTHER].map((each) => hiddenIn(each, muted))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("hides a muted child with the children under it, and leaves its parent and sibling", () => {
    const muted = run({ mutedChildren: new Set(["3.0"]) });

    expect([ROOT, CHILD, GRANDCHILD, SIBLING].map((each) => hiddenIn(each, muted))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("draws a soloed child alone, without the emitter that carries it", () => {
    const soloed = run({ soloedChildren: new Set(["3.0"]) });

    expect([ROOT, CHILD, GRANDCHILD, SIBLING, OTHER].map((each) => hiddenIn(each, soloed))).toEqual(
      [true, false, false, true, true],
    );
  });

  it("draws a soloed emitter with its children, beside a soloed child of another", () => {
    const soloed = run({ soloed: new Set([5]), soloedChildren: new Set(["3.1"]) });

    expect([ROOT, CHILD, SIBLING, OTHER].map((each) => hiddenIn(each, soloed))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("keeps a muted child hidden under a soloed emitter", () => {
    const both = run({ soloed: new Set([3]), mutedChildren: new Set(["3.0"]) });

    expect([ROOT, CHILD].map((each) => hiddenIn(each, both))).toEqual([false, true]);
  });
});
