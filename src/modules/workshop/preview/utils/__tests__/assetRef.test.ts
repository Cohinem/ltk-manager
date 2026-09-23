import { describe, expect, it } from "vitest";

import type { AssetRef } from "@/lib/tauri";

import {
  assetArchive,
  assetContext,
  assetKey,
  assetName,
  assetPath,
  previewUrl,
} from "../assetRef";

const LAYER: AssetRef = {
  kind: "layer",
  project: "C:/mods/skin",
  layer: "base",
  path: "assets/characters/smolder/hud/icon.tex",
};

const CHUNK: AssetRef = {
  kind: "gameChunk",
  wad: "Champions/Aatrox.wad.client",
  pathHash: "0123456789abcdef",
};

describe("assetName", () => {
  it("takes the basename of a reference that holds a path", () => {
    expect(assetName(LAYER)).toBe("icon.tex");
    expect(assetName({ kind: "file", path: "C:/downloads/loose.dds" })).toBe("loose.dds");
  });

  /* A chunk is addressed by hash, so the reference alone has nothing else. */
  it("names a chunk by its hash until a caller resolves one", () => {
    expect(assetName(CHUNK)).toBe("0123456789abcdef");
    expect(assetName(CHUNK, "assets/characters/aatrox/hud/square.dds")).toBe("square.dds");
  });
});

describe("assetPath", () => {
  it("addresses a layer file under the project's content directory", () => {
    expect(assetPath(LAYER)).toBe(
      "C:/mods/skin/content/base/assets/characters/smolder/hud/icon.tex",
    );
  });

  it("addresses a chunk by its archive and then by what names it inside", () => {
    expect(assetPath(CHUNK)).toBe("Champions/Aatrox.wad.client/0123456789abcdef");
    expect(assetPath(CHUNK, "assets/aatrox/square.dds")).toBe(
      "Champions/Aatrox.wad.client/assets/aatrox/square.dds",
    );
  });

  it("leaves a loose file's own path alone", () => {
    expect(assetPath({ kind: "file", path: "C:/downloads/loose.dds" })).toBe(
      "C:/downloads/loose.dds",
    );
  });
});

describe("assetKey", () => {
  /* The key is a document id, so a resolved name must never change it. */
  it("keys a chunk on its archive and hash", () => {
    expect(assetKey(CHUNK)).toBe("game:Champions/Aatrox.wad.client:0123456789abcdef");
  });
});

describe("previewUrl", () => {
  it("carries the reference as one URL-safe token, and no query without a width", () => {
    const url = previewUrl(CHUNK);

    expect(url).toMatch(/^http:\/\/ltk-asset\.localhost\/[A-Za-z0-9_-]+$/);
    expect(url).not.toContain("?");
  });

  it("asks for a width on the query", () => {
    expect(previewUrl(CHUNK, 32)).toBe(`${previewUrl(CHUNK)}?w=32`);
  });
});

describe("assetArchive", () => {
  it("is the archive of a chunk and nothing for a file that mounts none", () => {
    expect(assetArchive(CHUNK)).toBe("Champions/Aatrox.wad.client");
    expect(assetArchive(LAYER)).toBeNull();
    expect(assetArchive({ kind: "file", path: "C:/downloads/loose.dds" })).toBeNull();
  });
});

describe("assetContext", () => {
  /* Every archive carries `.wad.client`, so it separates none of them and only
     costs the tab the width its file name wanted. */
  it("is the layer for a layer file and the bare archive name for a chunk", () => {
    expect(assetContext(LAYER)).toBe("base");
    expect(assetContext(CHUNK)).toBe("Aatrox");
    expect(assetContext({ kind: "gameChunk", wad: "UI.WAD.CLIENT", pathHash: "a" })).toBe("UI");
    expect(assetContext({ kind: "file", path: "C:/downloads/loose.dds" })).toBeUndefined();
  });
});
