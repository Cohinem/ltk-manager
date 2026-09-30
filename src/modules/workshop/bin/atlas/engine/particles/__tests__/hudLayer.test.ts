import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import { hudCamera } from "../../../rendering/utils/hudCamera";
import { hudLayerOf, hudPixelsPerUnit } from "../hudLayer";

function root(fields: Record<string, number>): VfxValue {
  return {
    type: "struct",
    classHash: nameHash("VfxSystemDefinitionData"),
    class: "VfxSystemDefinitionData",
    fields: Object.entries(fields).map(([name, value]) => ({
      hash: nameHash(name),
      name,
      value: { type: "number", value },
    })),
    object: null,
  };
}

describe("hudLayerOf", () => {
  it("is 1024 by 768 where the system leaves its layer at the defaults", () => {
    expect(hudLayerOf(root({}), [1600, 1200])).toEqual({ width: 1024, height: 768 });
  });

  it("takes the element's source resolution under bit 0x200 of flags", () => {
    expect(hudLayerOf(root({ flags: 0x200 }), [1600, 1200])).toEqual({ width: 1600, height: 1200 });
  });

  it("reads the system's own dimension and aspect", () => {
    const layer = hudLayerOf(root({ hudLayerDimension: 2000, HudLayerAspect: 2 }), [1600, 1200]);

    expect(layer).toEqual({ width: 2000, height: 1000 });
  });
});

describe("hudCamera", () => {
  it("puts the system's origin on the element's centre, a unit screenH * scale / layerH pixels", () => {
    const layer = { width: 1024, height: 768 };
    const screen = { width: 1920, height: 1080 };
    const camera = hudCamera(layer, screen, [960, 270], 0.5);
    const perUnit = hudPixelsPerUnit(layer, screen.height, 0.5);

    const origin = new Vector3(0, 0, 0).project(camera);
    const right = new Vector3(100, 0, 0).project(camera);

    expect(origin.x).toBeCloseTo(0);
    expect(origin.y).toBeCloseTo(0.5);
    expect(((right.x - origin.x) / 2) * screen.width).toBeCloseTo(100 * perUnit);
  });
});
