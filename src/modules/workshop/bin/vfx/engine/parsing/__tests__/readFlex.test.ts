import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { hashOf, nameHash } from "../../../../shared/utils/binHash";
import { readFlex } from "../readFlex";

function struct(className: string, fields: Record<string, VfxValue>): VfxValue {
  return {
    type: "struct",
    classHash: nameHash(className),
    class: null,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({ hash: hashOf(name), name, value })),
  };
}

function number(value: number): VfxValue {
  return { type: "number", value };
}

describe("readFlex", () => {
  it("returns null for an emitter writing no flex field", () => {
    expect(readFlex(struct("VfxEmitterDefinitionData", {}))).toBeNull();
  });

  it("reads a flex value's channel and curve and a flex scale's number", () => {
    const flex = readFlex(
      struct("VfxEmitterDefinitionData", {
        flexRate: struct("FlexValueFloat", {
          mFlexID: number(2),
          mValue: struct("ValueFloat", { constantValue: number(4) }),
        }),
        FlexInstanceScale: struct("FlexTypeFloat", { mValue: number(0.5) }),
      }),
    );

    expect(flex?.rate).toEqual({ channel: 2, value: expect.objectContaining({ constant: [4] }) });
    expect(flex?.instanceScale).toEqual({ channel: 0, value: 0.5 });
    expect(flex?.lifetime).toBeNull();
  });
});
