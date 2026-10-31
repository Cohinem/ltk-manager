import { describe, expect, it } from "vitest";

import { CANVAS_BINDINGS, CANVAS_KEYS, canvasKey, type KeyTargets } from "../canvasKeys";
import type { ViewTransformControl } from "../useViewTransform";

/** Returns targets that record each call by name. */
function recorder(): { targets: KeyTargets; calls: string[] } {
  const calls: string[] = [];
  const transform = {
    fit: () => calls.push("fit"),
    frame: () => calls.push("frame"),
    zoomTo: () => calls.push("zoomTo"),
    zoomBy: () => calls.push("zoomBy"),
  } as unknown as ViewTransformControl;

  return {
    calls,
    targets: {
      transform,
      selected: { x: 0, y: 0, w: 1, h: 1 },
      clear: () => calls.push("clear"),
      nudge: (dx, dy) => calls.push(`nudge:${dx},${dy}`),
      arrange: (step) => calls.push(`arrange:${step}`),
      remove: () => calls.push("remove"),
    },
  };
}

describe("canvasKey", () => {
  it("answers every key of `CANVAS_BINDINGS`", () => {
    for (const { answers } of Object.values(CANVAS_BINDINGS)) {
      for (const key of answers) {
        const { targets, calls } = recorder();

        expect(canvasKey(key, targets)).toBe(true);
        expect(calls).toHaveLength(1);
      }
    }
  });

  it("returns false for a key outside the table", () => {
    const { targets, calls } = recorder();

    expect(canvasKey("q", targets)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("arranges to the front and back on the braces that the menus show", () => {
    const { targets, calls } = recorder();

    canvasKey(CANVAS_KEYS.front, targets);
    canvasKey(CANVAS_KEYS.back, targets);

    expect(calls).toEqual(["arrange:front", "arrange:back"]);
  });

  it("runs one action for two keys of one binding", () => {
    const first = recorder();
    const second = recorder();

    canvasKey("=", first.targets);
    canvasKey("+", second.targets);

    expect(first.calls).toEqual(second.calls);
  });
});

describe("CANVAS_BINDINGS", () => {
  it("binds each key to one action", () => {
    const keys = Object.values(CANVAS_BINDINGS).flatMap((binding) => binding.answers);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
