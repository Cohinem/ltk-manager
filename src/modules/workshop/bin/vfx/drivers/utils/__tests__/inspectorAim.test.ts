import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import { childSet, emitter, identifier, SPARKS } from "../../../children/__tests__/childFixture";
import {
  list,
  number,
  struct,
  valueCurve,
  vector,
} from "../../../engine/drivers/__tests__/driverFixture";
import type { GraphItem, GraphTree, MasterItem } from "../graphItems";
import { inspectorAim } from "../inspectorAim";
import { systemGraph } from "../systemGraph";

const ENTRY = "0x12345678";
const hex = (name: string) => nameHash(name).slice(2);
const SECOND = `${hex("complexEmitterDefinitionData")}[1]`;
const CARD = `${ENTRY}:${SECOND}`;

const KEYED = valueCurve("ValueColor", vector(1, 1, 1, 1), [
  [0, vector(1, 0, 0, 1)],
  [1, vector(0, 0, 1, 1)],
]);

const ROOT: VfxValue = struct("VfxSystemDefinitionData", {
  complexEmitterDefinitionData: list(
    emitter("First"),
    emitter("Orb", {
      birthColor: KEYED,
      texture: { type: "asset", path: "ASSETS/Glow.tex", asset: null },
      primitive: struct("VfxPrimitiveMesh", {
        mMesh: struct("VfxMeshDefinitionData", { mSimpleMeshName: number(0) }),
      }),
      fieldCollectionDefinition: struct("VfxFieldCollectionDefinitionData", {
        fieldDragDefinitions: list(struct("VfxFieldDragDefinitionData", { strength: number(1) })),
      }),
      childParticleSetDefinition: childSet([identifier("effect", SPARKS)]),
    }),
  ),
});

function items(): { masters: MasterItem[]; all: GraphItem[] } {
  const all: GraphItem[] = [];
  const visit = (tree: GraphTree) => {
    all.push(tree.item);
    tree.inputs.forEach((input) => visit(input.tree));
  };
  const graph = systemGraph(ROOT);
  if (graph !== null) visit(graph);

  return { masters: all.filter((item) => item.type === "master"), all };
}

const { masters, all } = items();
const find = (wanted: (item: GraphItem) => boolean) => {
  const item = all.find((each) => each.id.startsWith("c1") && wanted(each));
  if (item === undefined) throw new Error("the graph has no such node");
  return item;
};

describe("inspectorAim", () => {
  it("aims a value node at its own row in the group of its field", () => {
    const value = find((item) => item.type === "value");

    expect(inspectorAim(ENTRY, value, masters)).toEqual({
      card: CARD,
      group: "birth",
      rows: [`${CARD}.${hex("birthColor")}`],
    });
  });

  it("aims a force node at its row, then at the force collection", () => {
    const force = find((item) => item.type === "struct" && item.wire.endsWith("[0]"));

    expect(inspectorAim(ENTRY, force, masters)).toEqual({
      card: CARD,
      group: "effects",
      rows: [
        `${CARD}.${hex("fieldCollectionDefinition")}.${hex("fieldDragDefinitions")}[0]`,
        `${CARD}.${hex("fieldCollectionDefinition")}`,
      ],
    });
  });

  it("aims a child system node at its identifier, then at the child set", () => {
    const system = find((item) => item.type === "system");
    const set = `${CARD}.${hex("childParticleSetDefinition")}`;

    expect(inspectorAim(ENTRY, system, masters)).toEqual({
      card: CARD,
      group: "effects",
      rows: [`${set}.${hex("childrenIdentifiers")}[0]`, set],
    });
    expect(
      inspectorAim(
        ENTRY,
        find((item) => item.type === "children"),
        masters,
      )?.rows,
    ).toEqual([set]);
  });

  it("aims a Texture and a Geometry node at their group, and at no row", () => {
    const texture = find((item) => item.type === "render" && item.role === "texture");
    const geometry = find((item) => item.type === "render" && item.role === "geometry");

    expect(inspectorAim(ENTRY, texture, masters)).toEqual({
      card: CARD,
      group: "texture",
      rows: [],
    });
    expect(inspectorAim(ENTRY, geometry, masters)).toEqual({
      card: CARD,
      group: "primitive",
      rows: [],
    });
  });

  it("answers no aim for an emitter node and for the preview", () => {
    const preview = all.find((item) => item.type === "preview");

    expect(inspectorAim(ENTRY, masters[1]!, masters)).toBeNull();
    expect(inspectorAim(ENTRY, preview!, masters)).toBeNull();
  });
});
