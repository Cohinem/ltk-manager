import { describe, expect, it } from "vitest";

import type { LayerFilesChanged } from "@/lib/tauri";

import { previewKeys } from "../../api/queries";
import { infoChangedBy } from "../layerChanges";

const CHANGE: LayerFilesChanged = {
  project: "C:/mods/smolder",
  files: [{ layer: "base", path: "smolder.wad.client/assets/Icon.tex" }],
};

describe("infoChangedBy", () => {
  it("matches the info of a file the change names, however its path is cased", () => {
    const key = previewKeys.info({
      kind: "layer",
      project: "C:/mods/smolder",
      layer: "base",
      path: "smolder.wad.client/assets/icon.tex",
    });

    expect(infoChangedBy(key, CHANGE)).toBe(true);
  });

  it("leaves the info of another file, another layer and a game chunk alone", () => {
    const otherFile = previewKeys.info({
      kind: "layer",
      project: "C:/mods/smolder",
      layer: "base",
      path: "smolder.wad.client/assets/other.tex",
    });
    const otherLayer = previewKeys.info({
      kind: "layer",
      project: "C:/mods/smolder",
      layer: "chroma",
      path: "smolder.wad.client/assets/icon.tex",
    });
    const chunk = previewKeys.info({ kind: "gameChunk", wad: "a.wad.client", pathHash: "01" });

    expect(infoChangedBy(otherFile, CHANGE)).toBe(false);
    expect(infoChangedBy(otherLayer, CHANGE)).toBe(false);
    expect(infoChangedBy(chunk, CHANGE)).toBe(false);
  });

  it("leaves a query that is no asset info alone", () => {
    expect(
      infoChangedBy(["workshop", "layer:base:smolder.wad.client/assets/icon.tex"], CHANGE),
    ).toBe(false);
    expect(infoChangedBy(["asset-info"], CHANGE)).toBe(false);
  });
});
