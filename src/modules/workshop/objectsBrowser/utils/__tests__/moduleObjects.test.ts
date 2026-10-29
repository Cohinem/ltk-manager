import { describe, expect, it } from "vitest";

import type {
  IndexResponse,
  ModuleObject,
  ObjectDeclaration,
  ObjectFindHit,
  SearchHits,
  WorkshopProject,
} from "@/lib/tauri";

import {
  createdOfClass,
  findCreatedObjects,
  withCreatedHits,
  withModuleDeclarations,
} from "../moduleObjects";
import { layerMarks, NO_LAYER_DECLARATIONS } from "../objectTree";

const PROJECT = { layers: [] } as unknown as WorkshopProject;

const DECLARATION: ObjectDeclaration = {
  asset: { kind: "gameChunk", wad: "Champions/Teemo.wad.client", pathHash: "0123456789abcdef" },
  file: "data/characters/teemo/skins/skin0.bin",
  classHash: "0x45cd899f",
  class: "VfxSystemDefinitionData",
};

function created(path: string, objectHash: string, module = 0): ModuleObject {
  return {
    objectHash,
    path,
    layer: "base",
    module,
    moduleName: null,
    action: { kind: "create", declaration: DECLARATION },
  };
}

function acting(objectHash: string, kind: "edit" | "remove", moduleName: string): ModuleObject {
  return { objectHash, path: objectHash, layer: "base", module: 1, moduleName, action: { kind } };
}

describe("withModuleDeclarations", () => {
  it("adds a created object's target chunk as its declaration", () => {
    const joined = withModuleDeclarations(
      NO_LAYER_DECLARATIONS,
      [created("Mods/jade/Burst", "0x00000001")],
      PROJECT,
    );

    expect(joined.get("0x00000001")?.[0]?.declaration).toBe(DECLARATION);
  });

  it("marks an edit and a removal of one layer under one layer mark", () => {
    const joined = withModuleDeclarations(
      NO_LAYER_DECLARATIONS,
      [acting("0x00000002", "edit", "glow"), acting("0x00000002", "remove", "cleanup")],
      PROJECT,
    );

    const declared = joined.get("0x00000002") ?? [];
    expect(declared.every((entry) => entry.declaration === null)).toBe(true);
    expect(layerMarks(declared)).toEqual([
      {
        name: "base",
        title: "base",
        modules: [
          { action: "edit", name: "glow" },
          { action: "remove", name: "cleanup" },
        ],
      },
    ]);
  });

  it("names a module the author left unnamed by its position from 1", () => {
    const joined = withModuleDeclarations(
      NO_LAYER_DECLARATIONS,
      [created("Mods/jade/Burst", "0x00000001", 2)],
      PROJECT,
    );

    expect(joined.get("0x00000001")?.[0]?.module).toEqual({ action: "create", name: "#3" });
  });
});

describe("findCreatedObjects", () => {
  const objects = [
    created("Mods/jade/Burst", "0x00000001"),
    created("Mods/jade/Glow", "0x00000002"),
  ];

  it("matches the pattern's characters in any case and marks the run", () => {
    const hits = findCreatedObjects(objects, "burst", false, null);

    expect(hits.map((hit) => [hit.path, hit.ranges])).toEqual([["Mods/jade/Burst", [[10, 15]]]]);
  });

  it("reads the pattern as a regular expression when regex is set", () => {
    expect(findCreatedObjects(objects, "jade/(b|g)", true, null)).toHaveLength(2);
  });

  it("matches nothing if the regular expression does not parse", () => {
    expect(findCreatedObjects(objects, "(", true, null)).toEqual([]);
  });

  it("narrows to a class by name prefix or by hash", () => {
    expect(findCreatedObjects(objects, "", false, "vfxsys")).toHaveLength(2);
    expect(findCreatedObjects(objects, "", false, "0x45CD899F")).toHaveLength(2);
    expect(findCreatedObjects(objects, "", false, "Skin")).toEqual([]);
  });

  it("matches nothing for an empty pattern without a class term", () => {
    expect(findCreatedObjects(objects, "", false, null)).toEqual([]);
  });
});

describe("withCreatedHits", () => {
  const ready = (hits: ObjectFindHit[]): IndexResponse<SearchHits<ObjectFindHit>> => ({
    status: "ready",
    value: { hits, total: hits.length, superseded: false, unnamed: false },
  });

  it("adds the created objects a find matches and counts them", () => {
    const answer = withCreatedHits(
      ready([]),
      [created("Mods/jade/Burst", "0x00000001")],
      "jade",
      false,
    );

    expect(answer?.status === "ready" && answer.value.total).toBe(1);
  });

  it("returns an answer that is not ready as it is", () => {
    const building: IndexResponse<SearchHits<ObjectFindHit>> = { status: "building" };

    expect(
      withCreatedHits(building, [created("Mods/jade/Burst", "0x00000001")], "jade", false),
    ).toBe(building);
  });
});

describe("createdOfClass", () => {
  it("counts each created object once", () => {
    const objects = [
      created("Mods/jade/Burst", "0x00000001"),
      created("Mods/jade/Burst", "0x00000001", 1),
    ];

    expect(createdOfClass(objects, DECLARATION.classHash)).toBe(1);
  });
});
