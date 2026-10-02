import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import {
  list,
  number,
  struct,
  valueCurve,
  vector,
} from "../../../engine/drivers/__tests__/driverFixture";
import { fieldLines } from "../driverLayout";
import type { GraphTree, StructItem } from "../graphItems";
import { isForce, listAppend, nodeDuplicate, nodeRemoval } from "../nodeEdits";
import { systemGraph } from "../systemGraph";

const hex = (name: string) => nameHash(name).slice(2);

const EMITTER = `${hex("complexEmitterDefinitionData")}[0]`;

const OVERRIDE = struct("VfxMaterialOverrideDefinitionData", { priority: number(1) });

/** An emitter with a keyed colour, one drag force and a list of two overrides. */
const EMITTER_VALUE = struct("VfxEmitterDefinitionData", {
  emitterName: { type: "string", value: "Spark" },
  birthColor: valueCurve("ValueColor", vector(1, 1, 1, 1), [
    [0, vector(1, 0, 0, 1)],
    [1, vector(0, 0, 1, 1)],
  ]),
  fieldCollectionDefinition: struct("VfxFieldCollectionDefinitionData", {
    fieldDragDefinitions: list(struct("VfxFieldDragDefinitionData", { strength: number(1) })),
  }),
  materialOverrideDefinitions: list(OVERRIDE, OVERRIDE),
});

function nodes(): Map<string, GraphTree["item"]> {
  const root: VfxValue = struct("VfxSystemDefinitionData", {
    complexEmitterDefinitionData: list(EMITTER_VALUE),
  });
  const out = new Map<string, GraphTree["item"]>();
  const visit = (tree: GraphTree) => {
    out.set(tree.item.wire + ":" + tree.item.type, tree.item);
    tree.inputs.forEach((input) => visit(input.tree));
  };
  visit(systemGraph(root)!);
  return out;
}

function nodeAt(wire: string, type: string) {
  const item = nodes().get(`${wire}:${type}`);
  if (item === undefined) throw new Error(`no ${type} node at ${wire}`);
  return item;
}

describe("nodeEdits", () => {
  it("resets a field's node to its default and removes a list item's node", () => {
    const color = nodeAt(`${EMITTER}.${hex("birthColor")}`, "value");
    const overrides = `${EMITTER}.${hex("materialOverrideDefinitions")}`;

    expect(nodeRemoval(color)).toEqual({ type: "property", path: color.wire });
    expect(nodeRemoval(nodeAt(`${overrides}[1]`, "struct"))).toEqual({
      type: "item",
      path: `${overrides}[1]`,
    });
    expect(nodeRemoval(nodeAt(EMITTER, "master"))).toBeNull();
  });

  it("copies a list item after itself under the list's own holder and field", () => {
    const force = `${EMITTER}.${hex("fieldCollectionDefinition")}.${hex("fieldDragDefinitions")}`;
    const item = nodeAt(`${force}[0]`, "struct");

    expect(isForce(item)).toBe(true);
    expect(nodeDuplicate(item)).toEqual({
      holder: `${EMITTER}.${hex("fieldCollectionDefinition")}`,
      field: nameHash("fieldDragDefinitions"),
      edits: [{ type: "copyItem", from: "[0]", path: "", index: 1, unique: null }],
    });
    expect(nodeDuplicate(nodeAt(`${EMITTER}.${hex("birthColor")}`, "value"))).toBeNull();
  });

  it("appends an item of the list's last class, and draws the line that does it", () => {
    const overrides = nodeAt(
      `${EMITTER}.${hex("materialOverrideDefinitions")}`,
      "struct",
    ) as StructItem;

    expect(isForce(overrides)).toBe(false);
    expect(listAppend(overrides)).toEqual({
      holder: EMITTER,
      field: nameHash("materialOverrideDefinitions"),
      edits: [
        {
          type: "insertItem",
          path: "",
          item: { index: null, key: null, class: nameHash("VfxMaterialOverrideDefinitionData") },
        },
      ],
    });
    expect(fieldLines(overrides)).toBe(overrides.rows.length + 1);
  });
});
