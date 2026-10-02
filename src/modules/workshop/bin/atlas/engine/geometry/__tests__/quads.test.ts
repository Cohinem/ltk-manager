import { describe, expect, it } from "vitest";

import { addQuad, addSlice, covered, emptyGeometry, flipped } from "../quads";

const SCREEN = { width: 1000, height: 500 };

describe("addQuad", () => {
  it("writes the client's corner order, index pattern and 0xAARRGGBB colour bytes", () => {
    const geometry = emptyGeometry();

    addQuad(geometry, { x: 100, y: 50, w: 200, h: 100 }, [0, 0, 1, 1], [255, 128, 0, 200], SCREEN);

    expect(geometry.positions).toEqual([0.1, 0.1, 0.3, 0.1, 0.1, 0.3, 0.3, 0.3]);
    expect(geometry.indices).toEqual([0, 2, 1, 1, 2, 3]);
    expect(geometry.colors.slice(0, 4)).toEqual([0, 128, 255, 200]);
    expect(geometry.texcoords).toEqual([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1]);
  });

  it("offsets the indices of a second quad by its first vertex", () => {
    const geometry = emptyGeometry();
    const quad = { x: 0, y: 0, w: 10, h: 10 };

    addQuad(geometry, quad, [0, 0, 1, 1], [255, 255, 255, 255], SCREEN);
    addQuad(geometry, quad, [0, 0, 1, 1], [255, 255, 255, 255], SCREEN);

    expect(geometry.indices.slice(6)).toEqual([4, 6, 5, 5, 6, 7]);
  });
});

describe("addSlice", () => {
  it("cuts a 9-slice into nine quads, each placing zw over the whole rect", () => {
    const geometry = emptyGeometry();
    const slice = {
      kind: "nine" as const,
      us: [0, 0.25, 0.75, 1],
      vs: [0, 0.25, 0.75, 1],
      edges: [10, 10, 10, 10] as const,
    };

    const done = addSlice(
      geometry,
      { x: 0, y: 0, w: 100, h: 60 },
      [0, 0, 1, 1],
      slice,
      [false, false],
      [255, 255, 255, 255],
      SCREEN,
      null,
      2,
    );

    expect(done).toBe(true);
    expect(geometry.indices.length).toBe(9 * 6);
    const xs = new Set(geometry.positions.filter((_, at) => at % 2 === 0).map((x) => x * 1000));
    expect([...xs].sort((a, b) => a - b)).toEqual([0, 20, 80, 100]);
    const lastZw = geometry.texcoords.slice(-2);
    expect(lastZw).toEqual([1, 1]);
  });

  it("places a manifest slice's edges from its UV and the texture size, and waits without one", () => {
    const slice = { kind: "horizontal" as const, us: null, vs: null, edges: [8, 8, 0, 0] as const };
    const draw = (size: readonly [number, number] | null) => {
      const geometry = emptyGeometry();
      const done = addSlice(
        geometry,
        { x: 0, y: 0, w: 100, h: 20 },
        [0.5, 0, 1, 0.25],
        slice,
        [false, false],
        [255, 255, 255, 255],
        SCREEN,
        size,
        1,
      );
      return { done, geometry };
    };

    expect(draw(null).done).toBe(false);
    const { done, geometry } = draw([64, 64]);
    expect(done).toBe(true);
    expect(geometry.indices.length).toBe(3 * 6);
    expect(geometry.texcoords[4]).toBeCloseTo(0.5 + 8 / 64);
  });
});

describe("flipped and covered", () => {
  it("swaps the ends of a flipped axis", () => {
    expect(flipped([0.1, 0.2, 0.3, 0.4], [true, false])).toEqual([0.3, 0.2, 0.1, 0.4]);
  });

  it("crops a wide sprite to a square rect, centred", () => {
    const uv = covered([0, 0, 1, 0.5], { x: 0, y: 0, w: 50, h: 50 }, [200, 200]);

    expect(uv).toEqual([0.25, 0, 0.75, 0.5]);
  });
});
