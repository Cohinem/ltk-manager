import type { MapChunk, MapChunkItem } from "@/lib/tauri";

import {
  chunkLabel,
  isDrawn,
  isHidden,
  itemId,
  kindCounts,
  outlineRows,
  placeablePath,
} from "../mapOutline";

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

  it("keeps the placeables a filter matches, opens their chunks, and drops a chunk with none", () => {
    const brazier = { text: "brazier", kinds: new Set<MapChunkItem["kind"]>() };
    const rows = outlineRows([PLANTS, UNNAMED], new Set(), brazier);

    expect(rows.map((row) => row.id)).toEqual([
      "0xaaaaaaaa",
      "0xaaaaaaaa/0x00000001",
      "0xaaaaaaaa/0x00000002",
      "0xbbbbbbbb",
      "0xbbbbbbbb/0x00000001",
    ]);

    const locators = { text: "", kinds: new Set<MapChunkItem["kind"]>(["locator"]) };
    const narrowed = outlineRows([PLANTS, UNNAMED], new Set(), locators, new Set(["0xaaaaaaaa"]));
    expect(narrowed).toEqual([
      expect.objectContaining({ id: "0xaaaaaaaa", open: false, shown: 1 }),
    ]);
  });

  it("keeps every placeable of a chunk whose own name matches", () => {
    const named = item({ key: "0x00000003", name: "Rose" });
    const plants = { ...PLANTS, items: [...PLANTS.items, named] };
    const rows = outlineRows([plants], new Set(), { text: "plants", kinds: new Set() });

    expect(rows[0]).toMatchObject({ type: "chunk", shown: 3 });
  });
});

describe("kindCounts", () => {
  it("counts the placeables of each kind across the chunks", () => {
    expect([...kindCounts([PLANTS, UNNAMED])]).toEqual([
      ["particle", 2],
      ["locator", 1],
    ]);
  });
});

describe("placeablePath", () => {
  it("spells a placeable as its chunk's items entry under the key's eight digits", () => {
    expect(placeablePath("0x00c0ffee")).toBe("3a79338f{00c0ffee}");
  });
});
