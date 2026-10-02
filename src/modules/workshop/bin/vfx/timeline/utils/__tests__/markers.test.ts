import { describe, expect, it } from "vitest";

import type { ContentTree } from "@/lib/tauri";

import {
  addedMarker,
  markerKey,
  movedMarker,
  readMarkers,
  removedMarker,
  renamedLayerMarkers,
  renamedMarker,
  restoredMarker,
  staleMarkerKeys,
  type TimelineMarker,
} from "../markers";
import { rulerTicks, snapTargets } from "../snapping";

const IMPACT: TimelineMarker = { id: "a", time: 0.5, name: "impact" };
const FADE: TimelineMarker = { id: "b", time: 1.2, name: null };

describe("markers", () => {
  it("keeps a system's markers under its file and its object", () => {
    const asset = { kind: "layer", project: "C:/mods/skin", layer: "base", path: "a.bin" } as const;

    expect(markerKey(asset, "0x1a2b3c4d")).toContain("0x1a2b3c4d");
    expect(markerKey(asset, "0x1a2b3c4d")).not.toBe(markerKey(asset, "0x00000001"));
  });

  it("adds a marker unnamed and keeps them in time order", () => {
    expect(addedMarker([IMPACT, FADE], 0.8, "c").map((marker) => marker.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(addedMarker([], 0.8, "c")[0]?.name).toBeNull();
  });

  it("adds no second marker where one already stands", () => {
    const markers = [IMPACT];

    expect(addedMarker(markers, 0.502, "c")).toBe(markers);
  });

  it("puts a removed marker back in its place", () => {
    expect(restoredMarker([FADE], IMPACT)).toEqual([IMPACT, FADE]);
    expect(restoredMarker([IMPACT, FADE], IMPACT)).toEqual([IMPACT, FADE]);
  });

  it("follows a layer rename, and leaves other files' markers where they are", () => {
    const asset = { kind: "layer", project: "p", layer: "base", path: "a.bin" } as const;
    const game = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0x1" } as const;
    const markers = { [markerKey(asset, "0x1")]: [IMPACT], [markerKey(game, "0x1")]: [FADE] };

    expect(renamedLayerMarkers(markers, "base", "extra")).toEqual({
      [markerKey({ ...asset, layer: "extra" }, "0x1")]: [IMPACT],
      [markerKey(game, "0x1")]: [FADE],
    });
    expect(renamedLayerMarkers(markers, "other", "extra")).toBeNull();
  });

  it("moves a marker and never before the run starts", () => {
    expect(movedMarker([IMPACT, FADE], "a", 2).map((marker) => marker.id)).toEqual(["b", "a"]);
    expect(movedMarker([IMPACT], "a", -1)[0]?.time).toBe(0);
  });

  it("renames a marker, and a blank name clears it", () => {
    expect(renamedMarker([IMPACT], "a", "  hit ")[0]?.name).toBe("hit");
    expect(renamedMarker([IMPACT], "a", "  ")[0]?.name).toBeNull();
  });

  it("removes a marker", () => {
    expect(removedMarker([IMPACT, FADE], "a")).toEqual([FADE]);
  });

  it("reads only well-shaped markers from the editor file", () => {
    const read = readMarkers({
      kept: [FADE, IMPACT, { id: "c", time: -1, name: null }, "nonsense"],
      empty: [{ time: 1 }],
      broken: "nonsense",
    });

    expect(read).toEqual({ kept: [IMPACT, FADE] });
    expect(readMarkers(null)).toEqual({});
  });
});

describe("snapTargets", () => {
  it("lists every time the timeline marks, the ticks first", () => {
    const targets = snapTargets({
      span: 2,
      loop: { from: 0.25, to: 1.5 },
      markers: [IMPACT],
      edges: [0.1, 0.9],
      playhead: 0.7,
      ticks: [0.5, 1],
    });

    expect(targets.slice(0, 2)).toEqual([0.5, 1]);
    expect(targets).toEqual(expect.arrayContaining([0, 2, 0.1, 0.9, 0.25, 1.5, 0.5, 0.7]));
    expect(targets.lastIndexOf(0.5)).toBeGreaterThan(1);
  });

  it("leaves the playhead out while the time snapping is the playhead's", () => {
    const targets = snapTargets({
      span: 2,
      loop: null,
      markers: [],
      edges: [],
      playhead: null,
      ticks: [],
    });

    expect(targets).toEqual([0, 2]);
  });
});

describe("rulerTicks", () => {
  const view = { from: 0, to: 4 };

  it("snaps to whole seconds as well as the ticks between them", () => {
    const every = rulerTicks(view, 400, true);

    expect(every).toEqual(expect.arrayContaining([1, 2, 1.25]));
  });

  it("keeps the labelled ticks and drops the minor ones for a scrub", () => {
    const labelled = rulerTicks(view, 400, false);

    expect(labelled).toEqual(expect.arrayContaining([1, 2]));
    expect(labelled).not.toContain(1.25);
  });
});

describe("staleMarkerKeys", () => {
  const layer = (path: string) => ({ kind: "layer", project: "p", layer: "base", path }) as const;
  const object = (objectHash: string) => ({ objectHash, path: "", class: "", classHash: "" });
  const entry = (relativePath: string, objects: ReturnType<typeof object>[]) => ({
    relativePath,
    sizeBytes: 0,
    kind: "property_bin" as const,
    objects,
    ignoredBy: null,
  });
  const tree: ContentTree = {
    layers: [
      {
        name: "base",
        fileCount: 2,
        totalSizeBytes: 0,
        entries: [entry("fx.bin", [object("0x1")]), entry("big.bin", [])],
        ignoredDirectories: [
          { relativePath: "wip", ignoredBy: { pattern: "wip/", source: ".modignore", line: 1 } },
        ],
      },
    ],
  };

  it("names a deleted file's markers and a deleted system's", () => {
    const markers = {
      [markerKey(layer("gone.bin"), "0x1")]: [IMPACT],
      [markerKey(layer("fx.bin"), "0x2")]: [IMPACT],
    };

    expect(staleMarkerKeys(markers, tree).sort()).toEqual(Object.keys(markers).sort());
  });

  it("keeps a live system's markers, and any the tree cannot vouch for", () => {
    const game = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0x9" } as const;
    const markers = {
      [markerKey(layer("fx.bin"), "0x1")]: [IMPACT],
      [markerKey(layer("big.bin"), "0x7")]: [IMPACT],
      [markerKey(layer("wip/draft.bin"), "0x3")]: [IMPACT],
      [markerKey(game, "0x1")]: [IMPACT],
    };

    expect(staleMarkerKeys(markers, tree)).toEqual([]);
  });
});
