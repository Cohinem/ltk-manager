import type { MapVariant } from "@/lib/tauri";

import { openingVariant, variantLabel } from "../mapVariants";

const BLOOM: MapVariant = {
  skin: "Bloom",
  map: "Maps/MapGeometry/Map11/Bloom",
  materials: "data/maps/mapgeometry/map11/bloom.materials.bin",
};
const BASE: MapVariant = {
  skin: "Default",
  map: "Maps/MapGeometry/Map11/Base_SRX",
  materials: "data/maps/mapgeometry/map11/base_srx.materials.bin",
};

describe("openingVariant", () => {
  it("opens on the default skin wherever the map lists it", () => {
    expect(openingVariant([BLOOM, BASE])).toBe(BASE);
  });

  it("opens on the first variant of a map that names no default, and on none of none", () => {
    expect(openingVariant([BLOOM])).toBe(BLOOM);
    expect(openingVariant([])).toBeNull();
  });
});

describe("variantLabel", () => {
  it("reads as the skin, and as the last segment of the path where a container states it", () => {
    expect(variantLabel(BLOOM)).toBe("Bloom");
    expect(variantLabel({ ...BASE, skin: null })).toBe("Base_SRX");
  });
});
