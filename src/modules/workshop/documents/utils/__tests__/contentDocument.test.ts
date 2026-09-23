// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  type ContentDocument,
  type ContentDocumentOf,
  declaringFileContext,
  documentLayerName,
  objectDocument,
  objectDocumentId,
  objectTitle,
  previewDocument,
} from "../contentDocument";

/* Every factory in this file returns the union, so a test that reads a
   preview's own fields narrows first. */
function asPreview(document: ContentDocument): ContentDocumentOf<"preview"> {
  if (document.kind !== "preview") throw new Error(`expected a preview, got ${document.kind}`);
  return document;
}

describe("previewDocument", () => {
  it("names a layer file after the file", () => {
    const document = asPreview(
      previewDocument({
        kind: "layer",
        project: "C:/mods/skin",
        layer: "base",
        path: "assets/characters/smolder/hud/icon.tex",
      }),
    );

    expect(document.title).toBe("icon.tex");
    expect(document.context).toBe("base");
    expect(document.path).toBe("C:/mods/skin/content/base/assets/characters/smolder/hud/icon.tex");
  });

  /* A chunk reference holds a hash and no path, so a document built from one
     alone reads as hex. The tree row is what knows the resolved path. */
  it("takes the path the caller resolved over the hash the reference holds", () => {
    const asset = {
      kind: "gameChunk",
      wad: "Champions/Aatrox.wad.client",
      pathHash: "0123456789abcdef",
    } as const;

    expect(asPreview(previewDocument(asset)).title).toBe("0123456789abcdef");

    const named = asPreview(
      previewDocument(asset, "assets/characters/aatrox/hud/aatrox_square_0.aatrox.dds"),
    );
    expect(named.title).toBe("aatrox_square_0.aatrox.dds");
    expect(named.context).toBe("Aatrox");
    expect(named.path).toBe(
      "Champions/Aatrox.wad.client/assets/characters/aatrox/hud/aatrox_square_0.aatrox.dds",
    );
  });

  /* The resolved path is display only, so two spellings of one chunk are one tab. */
  it("keys on the reference and not on the resolved path", () => {
    const asset = { kind: "gameChunk", wad: "UI.wad.client", pathHash: "abc" } as const;

    expect(previewDocument(asset, "hud/icon.tex").id).toBe(previewDocument(asset).id);
  });
});

describe("objectDocument", () => {
  const chunk = {
    kind: "gameChunk",
    wad: "Champions/Aatrox.wad.client",
    pathHash: "0123456789abcdef",
  } as const;
  const layer = {
    kind: "layer",
    project: "C:/mods/skin",
    layer: "base",
    path: "data/characters/aatrox/skins/skin0.bin",
  } as const;

  /* Two files declaring one hash are two tabs, per ADR-0028. */
  it("keys on the declaration: the asset and the object hash", () => {
    const document = objectDocument(
      chunk,
      "0x2a1f3c7d",
      "Characters/Aatrox/Skins/Skin0/Resources",
      "data/characters/aatrox/skins/skin0.bin",
    );

    expect(document.id).toBe(objectDocumentId(chunk, "0x2a1f3c7d"));
    expect(document.id).toBe("object:game:Champions/Aatrox.wad.client:0123456789abcdef:0x2a1f3c7d");
    expect(objectDocumentId(layer, "0x2a1f3c7d")).not.toBe(document.id);
    expect(objectDocumentId(chunk, "0x2a1f3c7e")).not.toBe(document.id);
  });

  it("titles the tab by the last segment of the object path", () => {
    expect(objectTitle("Characters/Aatrox/Skins/Skin0/Resources")).toBe("Resources");
    expect(objectTitle("0x2a1f3c7d")).toBe("0x2a1f3c7d");
  });

  it("names the declaring file in the context field with the middle elided", () => {
    expect(declaringFileContext(chunk, "data/characters/aatrox/skins/skin0.bin")).toBe(
      "Aatrox/…/skin0.bin",
    );
    expect(declaringFileContext(chunk, "0123456789abcdef")).toBe("Aatrox/0123456789abcdef");
    expect(declaringFileContext(layer, layer.path)).toBe("base/…/skin0.bin");
    expect(declaringFileContext({ kind: "file", path: "C:/x/skin0.bin" }, "C:/x/skin0.bin")).toBe(
      "skin0.bin",
    );
  });

  it("belongs to the layer its asset sits in", () => {
    expect(documentLayerName(objectDocument(layer, "0x1", "a", layer.path))).toBe("base");
    expect(documentLayerName(objectDocument(chunk, "0x1", "a", "f"))).toBeNull();
  });
});
