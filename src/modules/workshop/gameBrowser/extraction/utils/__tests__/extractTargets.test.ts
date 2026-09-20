import { describe, expect, it } from "vitest";

import type { AssetRef } from "@/lib/tauri";

import { chunkPath } from "../extractTargets";

const HASH = "0123456789abcdef";

const chunk: AssetRef = { kind: "gameChunk", wad: "Champions/Aatrox.wad.client", pathHash: HASH };

describe("chunkPath", () => {
  it("drops the archive the tab's path field prefixes", () => {
    const shown = `Champions/Aatrox.wad.client/assets/characters/aatrox/skins/skin0.bin`;
    expect(chunkPath(chunk, shown)).toBe("assets/characters/aatrox/skins/skin0.bin");
  });

  it("is null for a chunk carrying its hash where a path would be", () => {
    expect(chunkPath(chunk, `Champions/Aatrox.wad.client/${HASH}`)).toBeNull();
  });

  it("is null for a tab restored before the path field existed", () => {
    expect(chunkPath(chunk, undefined)).toBeNull();
  });

  it("is null for a file of a layer, which is on disk rather than in an archive", () => {
    const layer: AssetRef = {
      kind: "layer",
      project: "C:/mods/skin",
      layer: "base",
      path: "data/skin0.bin",
    };
    expect(chunkPath(layer, "C:/mods/skin/content/base/data/skin0.bin")).toBeNull();
  });
});
