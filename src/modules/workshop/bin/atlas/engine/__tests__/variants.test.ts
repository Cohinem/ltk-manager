import { describe, expect, it } from "vitest";

import type { UiFile, UiVariantRecord } from "@/lib/tauri";

import { buildTree } from "../model/tree";
import { variantPatched, variantSlots, variantTargets } from "../model/variants";
import { element, icon, scene, view } from "./fixtures";

const ASSET = { kind: "file", path: "x" } as const;

function file(slot: string, role: UiFile["role"], path: string, shipped = true): UiFile {
  return { slot, role, path, asset: shipped ? ASSET : null };
}

function record(object: string, path: string, skipped: string | null = null): UiVariantRecord {
  return { object, path, fields: path, skipped };
}

describe("variantSlots", () => {
  it("lists the override slots alone, marking the ones the Windows client never lays", () => {
    const slots = variantSlots([
      file("BaseLoadable", "base", "ux/test/uibase"),
      file("EsportsLoadable", "loadable", "ux/test/esports"),
      file("RTLOverride", "override", "ux/test/uirtl"),
      file("MobileOverride", "override", "ux/test/uimobile"),
      file("0x1234abcd", "override", "ux/test/uitablet"),
      file("FlippedOverride", "override", "ux/test/uiflipped", false),
    ]);

    expect(slots).toEqual([
      { slot: "RTLOverride", path: "ux/test/uirtl", shipped: true, onPc: true },
      { slot: "MobileOverride", path: "ux/test/uimobile", shipped: true, onPc: false },
      { slot: "0x1234abcd", path: "ux/test/uitablet", shipped: true, onPc: false },
      { slot: "FlippedOverride", path: "ux/test/uiflipped", shipped: false, onPc: true },
    ]);
  });
});

describe("variantTargets", () => {
  const records = [
    record("icon", "Position.UIRect"),
    record("root", "Layer"),
    record("icon", "Scene"),
    record("gone", "Layer", "no object 0x0badf00d"),
  ];
  const tree = buildTree({
    ...view([scene("root", 1)], [element("icon", "root", 0, icon())]),
    variant: { slot: "RTLOverride", records, added: [], deleted: [] },
  });

  it("groups the records under the object each patches, first record first", () => {
    const targets = variantTargets(tree);

    expect(targets.map((target) => [target.object, target.label, target.element])).toEqual([
      ["icon", "icon", true],
      ["root", "root", false],
      ["gone", "gone", false],
    ]);
    expect(targets[0].records.map((each) => each.path)).toEqual(["Position.UIRect", "Scene"]);
  });

  it("names the elements a record of the variant applied to", () => {
    expect([...variantPatched(tree)]).toEqual(["icon"]);
  });
});
