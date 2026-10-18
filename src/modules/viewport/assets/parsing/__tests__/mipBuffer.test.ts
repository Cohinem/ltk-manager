import { describe, expect, it } from "vitest";

import { BufferError } from "../../utils/bufferReader";
import { readMipBuffer } from "../mipBuffer";

const MAGIC = 0x544b544c;

interface Level {
  width: number;
  height: number;
  data: number[];
}

/** The buffer `mips.rs` writes, built here so both halves of the layout are asserted. */
function buffer(levels: Level[], { magic = MAGIC, encoding = 0, extra = 0 } = {}): ArrayBuffer {
  const bytes = 16 + levels.reduce((sum, level) => sum + 12 + level.data.length, 0) + extra;
  const out = new ArrayBuffer(bytes);
  const view = new DataView(out);
  let at = 0;
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  u32(magic);
  u32(2);
  u32(levels.length);
  u32(encoding);
  for (const level of levels) {
    u32(level.width);
    u32(level.height);
    u32(level.data.length);
    new Uint8Array(out, at, level.data.length).set(level.data);
    at += level.data.length;
  }
  return out;
}

describe("readMipBuffer", () => {
  it("reads every level widest first, each with its own bytes", () => {
    const { encoding, levels } = readMipBuffer(
      buffer([
        { width: 4, height: 2, data: [1, 2, 3] },
        { width: 2, height: 1, data: [4] },
        { width: 1, height: 1, data: [5, 6] },
      ]),
    );

    expect(encoding).toBe("png");
    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [4, 2],
      [2, 1],
      [1, 1],
    ]);
    expect(Array.from(levels[0]?.data ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(levels[2]?.data ?? [])).toEqual([5, 6]);
  });

  it("reads the block encoding a chain names", () => {
    const chain = readMipBuffer(buffer([{ width: 4, height: 4, data: [0] }], { encoding: 2 }));

    expect(chain.encoding).toBe("bc3");
  });

  it("refuses an encoding it does not know", () => {
    expect(() =>
      readMipBuffer(buffer([{ width: 1, height: 1, data: [0] }], { encoding: 9 })),
    ).toThrow(BufferError);
  });

  it("refuses a buffer that is not a mip chain", () => {
    expect(() => readMipBuffer(buffer([{ width: 1, height: 1, data: [0] }], { magic: 1 }))).toThrow(
      BufferError,
    );
  });

  it("refuses a chain with no level", () => {
    expect(() => readMipBuffer(buffer([]))).toThrow(BufferError);
  });

  it("refuses bytes left over past the last level", () => {
    expect(() => readMipBuffer(buffer([{ width: 1, height: 1, data: [0] }], { extra: 4 }))).toThrow(
      BufferError,
    );
  });
});
