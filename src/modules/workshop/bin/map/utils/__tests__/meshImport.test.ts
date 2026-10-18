import { describe, expect, it } from "vitest";

import type { ModelSummary } from "@/lib/tauri";

import {
  defaultMaterialChoices,
  importEdit,
  isModelPath,
  materialImports,
  newMaterialName,
  placementTransform,
} from "../meshImport";

const MAP = "Maps/MapGeometry/Map11/Base";

function summary(materials: { name: string; alpha: boolean }[]): ModelSummary {
  return {
    meshes: [],
    materials: materials.map((material) => ({
      ...material,
      texture: null,
      embedded: false,
      missing: false,
    })),
    scale: 1,
    up: "y",
    skipped: [],
  };
}

describe("newMaterialName", () => {
  it("names the material under the map's Materials folder", () => {
    expect(newMaterialName(MAP, "Stone Wall", new Set())).toBe(`${MAP}/Materials/Stone_Wall`);
  });

  it("appends a number while the name is taken, compared lowercased", () => {
    const taken = new Set([`${MAP}/Materials/Stone`.toLowerCase()]);
    expect(newMaterialName(MAP, "Stone", taken)).toBe(`${MAP}/Materials/Stone2`);
  });
});

describe("defaultMaterialChoices", () => {
  it("creates each material apart from existing and from each other", () => {
    const choices = defaultMaterialChoices(
      summary([
        { name: "Leaf", alpha: true },
        { name: "Leaf", alpha: false },
      ]),
      MAP,
      [`${MAP}/Materials/Leaf`],
    );

    expect(choices).toEqual([
      { mode: "create", name: `${MAP}/Materials/Leaf2`, template: "flatAlphaTest", texture: null },
      { mode: "create", name: `${MAP}/Materials/Leaf3`, template: "flat", texture: null },
    ]);
  });
});

describe("materialImports", () => {
  it("lists only created materials with their index in the file", () => {
    const imports = materialImports("C:/rock.glb", [
      { mode: "use", material: "Maps/Shared/Rock" },
      { mode: "create", name: "Maps/New", template: "flat", texture: "C:/rock.png" },
    ]);

    expect(imports).toEqual([
      {
        name: "Maps/New",
        template: "flat",
        model: "C:/rock.glb",
        material: 1,
        texture: "C:/rock.png",
      },
    ]);
  });
});

describe("importEdit", () => {
  it("names a material per choice and places the meshes at the point", () => {
    const edit = importEdit("C:/rock.glb", {
      meshes: [0, 2],
      scale: 100,
      up: "z",
      materials: [
        { mode: "use", material: "Maps/Shared/Rock" },
        { mode: "create", name: "Maps/New", template: "flat", texture: null },
      ],
      visibility: 0xff,
      controller: null,
      at: [10, 0, 20],
    });

    expect(edit).toEqual({
      kind: "import",
      source: "C:/rock.glb",
      meshes: [0, 2],
      scale: 100,
      up: "z",
      materials: ["Maps/Shared/Rock", "Maps/New"],
      visibility: 0xff,
      controller: null,
      transform: placementTransform([10, 0, 20]),
    });
  });
});

describe("placementTransform", () => {
  it("returns the identity for the file's origin", () => {
    expect(placementTransform(null)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe("isModelPath", () => {
  it("matches the importer's extensions in any case", () => {
    expect(isModelPath("C:/models/Rock.GLB")).toBe(true);
    expect(isModelPath("C:/models/rock.blend")).toBe(false);
  });
});
