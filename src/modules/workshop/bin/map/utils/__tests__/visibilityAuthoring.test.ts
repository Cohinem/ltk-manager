import { describe, expect, it } from "vitest";

import type { MapChunk, MapGeometryMesh } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import {
  childEdits,
  controllerCreation,
  controllerMeshIds,
  controllerPlaceableIds,
  isolation,
  layerMeshIds,
  type NewController,
  placeableControllerEdits,
  splitSelection,
} from "../visibilityAuthoring";

const OCEAN = "0x3c5b24f7";
const PIT = "0x5e652742";
const CHUNK = "0x11111111";

function mesh(index: number, controller: string | null, visibility = 0xff): MapGeometryMesh {
  return {
    index,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    min: [0, 0, 0],
    max: [1, 1, 1],
    visibility,
    controller,
    region: null,
    quality: 31,
    backfaceCullingDisabled: false,
    vertexCount: 3,
    materials: [],
  };
}

function chunk(items: { key: string; controller: string | null }[]): MapChunk {
  return { entry: CHUNK, items } as unknown as MapChunk;
}

const NEW: NewController = {
  kind: "named",
  name: "Elemental_Ocean",
  defaultVisible: false,
  mask: 0,
  parents: [],
  mode: 0,
  mutator: "",
};

describe("splitSelection", () => {
  it("splits mesh ids from placeable ids", () => {
    expect(splitSelection(["mesh:4", `${CHUNK}/0xaaaaaaaa`])).toEqual({
      meshes: [4],
      placeables: [{ chunk: CHUNK, key: "0xaaaaaaaa" }],
    });
  });
});

describe("placeableControllerEdits", () => {
  it("links the VisibilityController of each placeable", () => {
    const [edit] = placeableControllerEdits([{ chunk: CHUNK, key: "0xaaaaaaaa" }], OCEAN);

    expect(edit).toEqual({
      entry: CHUNK,
      holder: `${nameHash("items").slice(2)}{aaaaaaaa}`,
      field: nameHash("VisibilityController"),
      edits: [
        {
          type: "setLeaf",
          path: "",
          value: { type: "objectLink", text: OCEAN },
        },
      ],
    });
  });

  it("writes a zero link for no controller", () => {
    const [edit] = placeableControllerEdits([{ chunk: CHUNK, key: "0xaaaaaaaa" }], null);

    expect(edit?.edits[0]).toMatchObject({ value: { text: "0x00000000" } });
  });
});

describe("controllerCreation", () => {
  it("creates the class of the kind and sets PathHash to the entry", () => {
    const path = "Maps/MapGeometry/Map11/Base_SRX/Controllers/Ocean";
    const { entry, objects, edits } = controllerCreation(path, NEW);

    expect(entry).toBe(nameHash(path));
    expect(objects).toEqual([{ name: path, origin: { type: "class", class: "0xe07edfa4" } }]);
    expect(edits.map((edit) => edit.field)).toEqual([
      nameHash("PathHash"),
      nameHash("name"),
      nameHash("DefaultVisible"),
    ]);
    expect(edits[0]?.edits[0]).toMatchObject({
      value: { type: "hash", text: entry },
    });
  });

  it("writes the terrain mask of a terrain controller", () => {
    const { edits } = controllerCreation("A", {
      ...NEW,
      kind: "terrain",
      mask: 8,
    });

    expect(edits.at(-1)).toMatchObject({
      field: "0x27639032",
      edits: [{ value: { type: "integer", text: "8" } }],
    });
  });

  it("writes only the PathHash of a logic driver controller", () => {
    const { objects, edits } = controllerCreation("A", {
      ...NEW,
      kind: "driver",
    });

    expect(objects[0]?.origin).toEqual({
      type: "class",
      class: "LogicDriverVisibilityController",
    });
    expect(edits).toHaveLength(1);
  });
});

describe("childEdits", () => {
  it("removes the held parents from the end, then inserts the new ones and sets the mode", () => {
    const [parents, mode] = childEdits("0x1", 2, [OCEAN], 3);

    expect(parents?.edits).toEqual([
      { type: "removeItem", path: "[1]" },
      { type: "removeItem", path: "[0]" },
      {
        type: "insertItem",
        path: "",
        item: { index: null, key: null, class: null },
      },
      {
        type: "setLeaf",
        path: "[0]",
        value: { type: "objectLink", text: OCEAN },
      },
    ]);
    expect(mode).toMatchObject({
      field: nameHash("ParentMode"),
      edits: [{ value: { type: "integer", text: "3" } }],
    });
  });
});

describe("controller selection", () => {
  const meshes = [mesh(0, OCEAN), mesh(1, PIT), mesh(2, null)];
  const chunks = [
    chunk([
      { key: "0xa", controller: OCEAN },
      { key: "0xb", controller: null },
    ]),
  ];

  it("selects the meshes and the placeables under a controller", () => {
    expect(controllerMeshIds(meshes, OCEAN)).toEqual(["mesh:0"]);
    expect(controllerPlaceableIds(chunks, OCEAN)).toEqual([`${CHUNK}/0xa`]);
  });

  it("isolates by hiding objects of another controller and keeping objects of none", () => {
    expect(isolation(meshes, chunks, PIT)).toEqual({
      hide: ["mesh:0", `${CHUNK}/0xa`],
      show: ["mesh:1"],
    });
  });
});

describe("layerMeshIds", () => {
  it("returns meshes without a controller whose mask holds the bit and is not every layer", () => {
    const meshes = [
      mesh(0, null, 0b1000),
      mesh(1, null, 0xff),
      mesh(2, OCEAN, 0b1000),
      mesh(3, null, 1),
    ];

    expect(layerMeshIds(meshes, 3)).toEqual(["mesh:0"]);
  });
});
