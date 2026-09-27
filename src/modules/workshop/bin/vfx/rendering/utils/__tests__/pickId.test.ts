import { describe, expect, it } from "vitest";

import { MOST_PICK_ID, nearestPick, pickColor, pickIdAt } from "../pickId";

/** A `size` by `size` read with `ids` written at their texels, as the GPU stores `pickColor`. */
function readOf(size: number, ids: ReadonlyMap<number, number>): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (const [texel, id] of ids) {
    const channels = pickColor(id).map((channel) => Math.round(channel * 255));
    pixels.set([...channels, 255], texel * 4);
  }
  return pixels;
}

describe("pick ids", () => {
  it("reads back every id a texel's three bytes carry", () => {
    for (const id of [1, 255, 256, 0x1234, 0xabcdef, MOST_PICK_ID]) {
      expect(pickIdAt(readOf(1, new Map([[0, id]])), 0)).toBe(id);
    }
  });

  it("reads a texel nothing drew as no id", () => {
    expect(pickIdAt(new Uint8Array(4), 0)).toBe(0);
  });

  it("keeps every channel of a colour within one byte", () => {
    for (const channel of pickColor(MOST_PICK_ID)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe("nearestPick", () => {
  it("answers no id where nothing drew", () => {
    expect(nearestPick(new Uint8Array(5 * 5 * 4), 5)).toBe(0);
  });

  it("takes the id under the pointer over one nearer the edge", () => {
    const pixels = readOf(
      5,
      new Map([
        [0, 7],
        [12, 3],
      ]),
    );

    expect(nearestPick(pixels, 5)).toBe(3);
  });

  it("takes the id nearest the middle where none is under the pointer", () => {
    const pixels = readOf(
      5,
      new Map([
        [0, 7],
        [13, 4],
        [24, 9],
      ]),
    );

    expect(nearestPick(pixels, 5)).toBe(4);
  });
});
