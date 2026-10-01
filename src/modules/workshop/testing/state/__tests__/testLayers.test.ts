import { beforeEach, describe, expect, it } from "vitest";

import type { WorkshopLayer } from "@/lib/tauri";

import { testedLayers, useTestLayersStore } from "../testLayers";

function layer(name: string, priority: number): WorkshopLayer {
  return { name, displayName: name, priority, description: null, stringOverrides: {} };
}

const LAYERS = [layer("base", 0), layer("chroma", 10), layer("vfx", 20)];

beforeEach(() => {
  useTestLayersStore.setState({ excluded: {} });
});

describe("testedLayers", () => {
  it("turns every layer on when none is left out", () => {
    expect(testedLayers(LAYERS, [])).toBeNull();
  });

  it("names the layers a partial test turns on", () => {
    expect(testedLayers(LAYERS, ["chroma"])).toEqual(["base", "vfx"]);
  });

  it("keeps base on even when it is listed", () => {
    expect(testedLayers(LAYERS, ["base"])).toBeNull();
  });

  it("ignores a left-out layer the project no longer declares", () => {
    expect(testedLayers(LAYERS, ["removed"])).toBeNull();
  });
});

describe("useTestLayersStore", () => {
  it("toggles a layer out and back in", () => {
    const { toggleLayer } = useTestLayersStore.getState();

    toggleLayer("X:/mods/one", "chroma");
    expect(useTestLayersStore.getState().excluded).toEqual({ "X:/mods/one": ["chroma"] });

    toggleLayer("X:/mods/one", "chroma");
    expect(useTestLayersStore.getState().excluded).toEqual({});
  });
});
