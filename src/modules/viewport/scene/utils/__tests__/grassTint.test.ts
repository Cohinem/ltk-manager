import { Texture } from "three";
import { describe, expect, it } from "vitest";

import type { MapGrassTint } from "@/lib/tauri";

import { grassTextureFor, grassTextures, grassTintAssets, grassTintOf } from "../grassTint";

const tint = (skin: string, alternates: MapGrassTint["alternates"] = []): MapGrassTint => ({
  skin,
  texture: { kind: "file", path: `${skin}.tex` },
  alternates,
});

const TINTS = [tint("SR_Seasonal_Map"), tint("Default"), tint("Bloom")];

describe("grassTintOf", () => {
  it("returns the tint of the named skin regardless of case", () => {
    expect(grassTintOf(TINTS, "bloom")?.skin).toBe("Bloom");
  });

  it("falls back to the Default skin if no skin is named or the name is missing", () => {
    expect(grassTintOf(TINTS, null)?.skin).toBe("Default");
    expect(grassTintOf(TINTS, "Arcade")?.skin).toBe("Default");
  });

  it("falls back to the first skin if no Default skin states a tint", () => {
    expect(grassTintOf([tint("Odyssey"), tint("Bloom")], null)?.skin).toBe("Odyssey");
  });

  it("returns null if no skin states a tint", () => {
    expect(grassTintOf([], "Bloom")).toBeNull();
  });
});

describe("grassTextureFor", () => {
  const elemental = tint("Default", [
    { bit: 1, texture: { kind: "file", path: "infernal.tex" } },
    { bit: 3, texture: { kind: "file", path: "ocean.tex" } },
  ]);
  const base = new Texture();
  const infernal = new Texture();
  const ocean = new Texture();
  const loaded = grassTextures(
    elemental,
    new Map([
      ["base", base],
      ["0", infernal],
      ["1", ocean],
    ]),
  );

  it("loads the base and every alternate", () => {
    expect([...grassTintAssets(elemental).keys()]).toEqual(["base", "0", "1"]);
  });

  it("returns the base tint if no alternate flag is on", () => {
    expect(loaded && grassTextureFor(loaded, 0b1)).toBe(base);
  });

  it("returns the first alternate whose flag is on", () => {
    expect(loaded && grassTextureFor(loaded, 0b1001)).toBe(ocean);
    expect(loaded && grassTextureFor(loaded, 0b1011)).toBe(infernal);
  });
});
