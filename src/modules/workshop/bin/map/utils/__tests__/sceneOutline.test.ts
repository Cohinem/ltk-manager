import { describe, expect, it } from "vitest";

import type { MapChunk, MapGeometryMesh } from "@/lib/tauri";

import { NO_FILTER } from "../mapOutline";
import { groupId, sceneRows } from "../sceneOutline";

const NONE: ReadonlySet<string> = new Set();

function mesh(index: number, controller: string | null, material = "Maps/Grass"): MapGeometryMesh {
  return {
    index,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    min: [0, 0, 0],
    max: [1, 1, 1],
    visibility: 255,
    controller,
    region: null,
    quality: 31,
    backfaceCullingDisabled: false,
    vertexCount: 3,
    materials: [material],
  };
}

const CHUNK: MapChunk = { entry: "0xaaaaaaaa", name: null, items: [] };
const names = (hash: string) => (hash === "0x2" ? "Baron" : "Arena");

describe("sceneRows", () => {
  it("lists chunks alone when the map has no meshes", () => {
    const rows = sceneRows({
      meshes: [],
      chunks: [CHUNK],
      filter: NO_FILTER,
      opened: NONE,
      shut: NONE,
      controllerName: names,
    });

    expect(rows.map((row) => row.type)).toEqual(["chunk"]);
  });

  it("groups meshes by controller under the meshes section, no controller first", () => {
    const rows = sceneRows({
      meshes: [mesh(0, "0x2"), mesh(1, null), mesh(2, "0x1")],
      chunks: [CHUNK],
      filter: NO_FILTER,
      opened: new Set([groupId("0x2")]),
      shut: NONE,
      controllerName: names,
    });

    expect(rows.map((row) => row.id)).toEqual([
      "section:meshes",
      groupId(null),
      groupId("0x1"),
      groupId("0x2"),
      "mesh:0",
      "section:placeables",
      CHUNK.entry,
    ]);
  });

  it("keeps the meshes whose material holds the search text and opens their group", () => {
    const rows = sceneRows({
      meshes: [mesh(0, null, "Maps/Water"), mesh(1, null)],
      chunks: [CHUNK],
      filter: { text: "water", kinds: new Set() },
      opened: NONE,
      shut: NONE,
      controllerName: names,
    });

    expect(rows.filter((row) => row.type === "mesh").map((row) => row.id)).toEqual(["mesh:0"]);
  });

  it("leaves a shut section's rows out", () => {
    const rows = sceneRows({
      meshes: [mesh(0, null)],
      chunks: [CHUNK],
      filter: NO_FILTER,
      opened: NONE,
      shut: new Set(["section:meshes"]),
      controllerName: names,
    });

    expect(rows.map((row) => row.id)).toEqual([
      "section:meshes",
      "section:placeables",
      CHUNK.entry,
    ]);
  });
});
