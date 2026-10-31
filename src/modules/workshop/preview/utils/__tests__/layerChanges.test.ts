import { describe, expect, it } from "vitest";

import type { LayerFilesChanged } from "@/lib/tauri";

import { previewKeys } from "../../api/queries";
import { assetReadChangedBy, infoChangedBy } from "../layerChanges";

const CHANGE: LayerFilesChanged = {
  project: "C:/mods/smolder",
  files: [{ layer: "base", path: "smolder.wad.client/assets/Icon.tex" }],
};

describe("assetReadChangedBy", () => {
  const changed = {
    kind: "layer",
    project: "C:/mods/smolder",
    layer: "base",
    path: "smolder.wad.client/assets/skin.SKN",
  } as const;

  it("matches a viewport buffer and a clip header of the file, however its path is cased", () => {
    const change = { ...CHANGE, files: [{ layer: "base", path: changed.path.toLowerCase() }] };

    expect(assetReadChangedBy(["viewport", "mesh", changed], change)).toBe(true);
    expect(assetReadChangedBy(["skin-clip-header", changed], change)).toBe(true);
  });

  it("leaves another file, a map buffer and a game chunk alone", () => {
    const change = { ...CHANGE, files: [{ layer: "base", path: changed.path }] };

    expect(assetReadChangedBy(["viewport", "mesh", { ...changed, layer: "chroma" }], change)).toBe(
      false,
    );
    expect(assetReadChangedBy(["viewport", "map", changed], change)).toBe(false);
    expect(
      assetReadChangedBy(
        ["viewport", "mesh", { kind: "gameChunk", wad: "a.wad.client", pathHash: "01" }],
        change,
      ),
    ).toBe(false);
  });
});

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
