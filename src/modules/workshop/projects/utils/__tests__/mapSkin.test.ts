import { describe, expect, it } from "vitest";

import type { MapStart } from "@/lib/tauri";

import { skinOf } from "../mapSkin";

const skin = (name: string) => ({ skin: name, container: `Maps/MapGeometry/Map11/${name}` });

const RIFT: MapStart = {
  map: "Map11",
  skins: [skin("SR_Seasonal_Map"), skin("Default"), skin("Bloom")],
};

describe("skinOf", () => {
  it("returns the chosen skin regardless of case", () => {
    expect(skinOf(RIFT, "bloom")).toBe("Bloom");
  });

  it("falls back to the Default skin if no skin is chosen or the choice is missing", () => {
    expect(skinOf(RIFT, null)).toBe("Default");
    expect(skinOf(RIFT, "Arcade")).toBe("Default");
  });

  it("falls back to the first skin if the map has no Default skin", () => {
    expect(skinOf({ map: "Map30", skins: [skin("Arena")] }, null)).toBe("Arena");
  });

  it("returns null if the map lists no skin", () => {
    expect(skinOf({ map: "Map12", skins: [] }, null)).toBeNull();
    expect(skinOf(null, "Default")).toBeNull();
  });
});
