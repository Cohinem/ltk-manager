import { describe, expect, it } from "vitest";

import type { AssetRef, IndexResponse, ReferenceResult } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { linkingMaterials } from "../../hooks/useShaderMaterial";
import { definesOf } from "../../state/previewDefines";

const SKIN: AssetRef = { kind: "gameChunk", wad: "Ahri.wad.client", pathHash: "0123456789abcdef" };

function answer(
  objects: { objectHash: string; className: string }[],
): IndexResponse<ReferenceResult> {
  return {
    status: "ready",
    value: {
      groups: [
        {
          asset: SKIN,
          file: "data/characters/ahri/skins/skin0.bin",
          objects: objects.map(({ objectHash, className }) => ({
            objectHash,
            path: `Characters/Ahri/Skins/Skin0/Materials/${objectHash}`,
            classHash: nameHash(className),
            class: className,
            property: null,
          })),
        },
      ],
      total: objects.length,
      superseded: false,
      cancelled: false,
    },
  };
}

describe("linkingMaterials", () => {
  it("returns only the StaticMaterialDef hits, each with the bin that declares it", () => {
    const linking = linkingMaterials(
      answer([
        { objectHash: "0x00000001", className: "StaticMaterialDef" },
        { objectHash: "0x00000002", className: "VfxSystemDefinitionData" },
      ]),
    );

    expect(linking).toEqual([
      {
        asset: SKIN,
        entry: "0x00000001",
        path: "Characters/Ahri/Skins/Skin0/Materials/0x00000001",
        file: "data/characters/ahri/skins/skin0.bin",
      },
    ]);
  });

  it("returns no materials if the walk is not ready", () => {
    expect(linkingMaterials({ status: "building" })).toEqual([]);
    expect(linkingMaterials(undefined)).toEqual([]);
  });
});

describe("definesOf", () => {
  it("lists the picked defines as NAME=VALUE sorted by name", () => {
    expect(definesOf({ USE_RIM: "0", ADD_GLOW: "1" })).toEqual(["ADD_GLOW=1", "USE_RIM=0"]);
  });
});
