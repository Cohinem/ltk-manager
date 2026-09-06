import { describe, expect, it } from "vitest";

import type { AssetInfo } from "@/lib/tauri";

import { fileLinkMark } from "../fileLinkMark";

const TEXTURE: AssetInfo = {
  kind: "texture",
  width: 256,
  height: 256,
  container: "TEX",
  format: "BC3",
  mipCount: 9,
  sizeBytes: 87_424n,
};

describe("fileLinkMark", () => {
  it("gives a texture named by its extension a swatch, and asks the bytes nothing", () => {
    expect(fileLinkMark("texture", undefined)).toEqual({ kind: "swatch" });
    expect(fileLinkMark("texture_dds", undefined)).toEqual({ kind: "swatch" });
  });

  it("gives any other named kind its badge", () => {
    expect(fileLinkMark("property_bin", undefined)).toEqual({
      kind: "badge",
      fileKind: "property_bin",
    });
    expect(fileLinkMark("png", undefined)).toEqual({ kind: "badge", fileKind: "png" });
  });

  it("waits on the bytes for a name with no extension", () => {
    expect(fileLinkMark("unknown", undefined)).toEqual({ kind: "pending" });
  });

  it("reads a sniffed texture as a swatch and a sniffed kind as its badge", () => {
    expect(fileLinkMark("unknown", TEXTURE)).toEqual({ kind: "swatch" });
    expect(fileLinkMark("unknown", { kind: "unsupported", fileKind: "skeleton" })).toEqual({
      kind: "badge",
      fileKind: "skeleton",
    });
  });

  it("badges a sniffed image by its kind, and unreadable bytes as unknown", () => {
    expect(
      fileLinkMark("unknown", {
        kind: "image",
        width: 4,
        height: 4,
        sizeBytes: 1n,
        fileKind: "png",
      }),
    ).toEqual({ kind: "badge", fileKind: "png" });
    expect(fileLinkMark("unknown", null)).toEqual({ kind: "badge", fileKind: "unknown" });
  });
});
