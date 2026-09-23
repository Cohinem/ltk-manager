import { describe, expect, it } from "vitest";

import { BufferError } from "../../utils/bufferReader";
import { readMipBuffer } from "../mipBuffer";

const MAGIC = 0x544b544c;

interface Level {
  width: number;
  height: number;
  png: number[];
}

/** The buffer `mips.rs` writes, built here so both halves of the layout are asserted. */
function buffer(levels: Level[], { magic = MAGIC, extra = 0 } = {}): ArrayBuffer {
  const bytes = 12 + levels.reduce((sum, level) => sum + 12 + level.png.length, 0) + extra;
  const out = new ArrayBuffer(bytes);
  const view = new DataView(out);
  let at = 0;
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  u32(magic);
  u32(1);
  u32(levels.length);
  for (const level of levels) {
    u32(level.width);
    u32(level.height);
    u32(level.png.length);
    new Uint8Array(out, at, level.png.length).set(level.png);
    at += level.png.length;
  }
  return out;
}

describe("readMipBuffer", () => {
  it("reads every level widest first, each with its own bytes", () => {
    const levels = readMipBuffer(
      buffer([
        { width: 4, height: 2, png: [1, 2, 3] },
        { width: 2, height: 1, png: [4] },
        { width: 1, height: 1, png: [5, 6] },
      ]),
    );

    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [4, 2],
      [2, 1],
      [1, 1],
    ]);
    expect(Array.from(levels[0].png)).toEqual([1, 2, 3]);
    expect(Array.from(levels[2].png)).toEqual([5, 6]);
  });

  it("refuses a buffer that is not a mip chain", () => {
    expect(() => readMipBuffer(buffer([{ width: 1, height: 1, png: [0] }], { magic: 1 }))).toThrow(
      BufferError,
    );
  });

  it("refuses a chain with no level", () => {
    expect(() => readMipBuffer(buffer([]))).toThrow(BufferError);
  });

  it("refuses bytes left over past the last level", () => {
    expect(() => readMipBuffer(buffer([{ width: 1, height: 1, png: [0] }], { extra: 4 }))).toThrow(
      BufferError,
    );
  });
});
