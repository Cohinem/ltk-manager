import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { struct } from "../../../engine/drivers/__tests__/driverFixture";
import { holdsMaterial, materialOf } from "../materialNodes";

const LINK: VfxValue = { type: "link", hash: "0xc66593f3", name: null };

function asStruct(value: VfxValue): Extract<VfxValue, { type: "struct" }> {
  if (value.type !== "struct") throw new Error("not a struct");
  return value;
}

describe("materialOf", () => {
  it("reads a classic emitter's custom material as the material it links", () => {
    const custom = asStruct(struct("VfxMaterialDefinitionData", { Material: LINK }));

    expect(holdsMaterial(custom)).toBe(true);
    expect(materialOf(custom, "868eb76a[0].2820c167")).toEqual({
      type: "linked",
      entry: "0xc66593f3",
    });
  });

  it("reads a render component's linking container as the material it links", () => {
    const container = asStruct(struct("0x44ad896b", { Material: LINK }));

    expect(holdsMaterial(container)).toBe(true);
    expect(materialOf(container, "")).toEqual({ type: "linked", entry: "0xc66593f3" });
  });

  it("reads a definition that links nothing as no material", () => {
    const empty = asStruct(struct("VfxMaterialDefinitionData"));

    expect(materialOf(empty, "")).toBeNull();
  });
});
