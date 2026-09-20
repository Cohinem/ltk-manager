import type { MapChunk, MapChunkItem } from "@/lib/tauri";

import { chunkLabel, isDrawn, isHidden, itemId, outlineRows } from "../mapOutline";

function item(overrides: Partial<MapChunkItem>): MapChunkItem {
  return {
    key: "0x00000001",
    name: "Brazier",
    class: "MapParticle",
    kind: "particle",
    position: [0, 0, 0],
    visibility: 255,
    controller: null,
    ...overrides,
  };
}

const PLANTS: MapChunk = {
  entry: "0xaaaaaaaa",
  name: "Maps/MapGeometry/Map11/Chunks/Plants",
  items: [item({ key: "0x00000001" }), item({ key: "0x00000002", kind: "locator" })],
};
const UNNAMED: MapChunk = { entry: "0xbbbbbbbb", name: null, items: [item({})] };

describe("isHidden", () => {
  it("hides a placeable by itself and with the whole of its chunk", () => {
    expect(
      isHidden(new Set([itemId("0xaaaaaaaa", "0x00000001")]), "0xaaaaaaaa", "0x00000001"),
    ).toBe(true);
    expect(isHidden(new Set(["0xaaaaaaaa"]), "0xaaaaaaaa", "0x00000002")).toBe(true);
    expect(isHidden(new Set(["0xbbbbbbbb"]), "0xaaaaaaaa", "0x00000001")).toBe(false);
  });
});

describe("chunkLabel", () => {
  it("reads as the last segment of the path, and as the hash of a chunk nothing names", () => {
    expect(chunkLabel(PLANTS)).toBe("Plants");
    expect(chunkLabel(UNNAMED)).toBe("0xbbbbbbbb");
  });
});

describe("isDrawn", () => {
  it("holds for what the scene draws, a particle and a character", () => {
    expect(isDrawn(item({ kind: "particle" }))).toBe(true);
    expect(isDrawn(item({ kind: "character" }))).toBe(true);
    expect(isDrawn(item({ kind: "locator" }))).toBe(false);
  });
});

describe("outlineRows", () => {
  it("lists every chunk and the placeables of the open ones alone", () => {
    const rows = outlineRows([PLANTS, UNNAMED], new Set(["0xaaaaaaaa"]));

    expect(rows.map((row) => row.id)).toEqual([
      "0xaaaaaaaa",
      "0xaaaaaaaa/0x00000001",
      "0xaaaaaaaa/0x00000002",
      "0xbbbbbbbb",
    ]);
    expect(rows[0]).toMatchObject({ type: "chunk", open: true });
    expect(rows[3]).toMatchObject({ type: "chunk", open: false });
  });
});
