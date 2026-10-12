import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import {
  childSet,
  emitter,
  EMITTER,
  hex,
  identifier,
  SET,
  SMOKE,
  SPARKS,
  text,
} from "../../../children/__tests__/childFixture";
import {
  bool,
  list,
  number,
  struct,
  valueCurve,
} from "../../../engine/drivers/__tests__/driverFixture";
import {
  childrenLines,
  FIELD_PADDING,
  HEADER_HEIGHT,
  layoutGraph,
  LINE_HEIGHT,
  sizeOf,
} from "../driverLayout";
import { childrenIdOf, childSystemIdOf } from "../graphEmitter";
import type { ChildrenItem, ChildSystemItem, GraphTree } from "../graphItems";
import { childRemoval, nodeRemoval } from "../nodeEdits";
import { inputSummary, itemSubtitle, itemTitle } from "../nodeText";
import { embedSockets } from "../socketEmbed";
import { systemGraph } from "../systemGraph";

const KEYED = valueCurve("ValueFloat", number(0), [
  [0, number(0)],
  [1, number(1)],
]);

const UNREACHED = identifier("effectKey", { type: "hash", hash: "0x000000bb", name: null });

function treeOf(set: VfxValue): GraphTree {
  const root = struct("VfxSystemDefinitionData", {
    complexEmitterDefinitionData: list(emitter("Orb", { childParticleSetDefinition: set })),
  });
  const master = systemGraph(root)?.inputs[0]?.tree;
  if (master === undefined) throw new Error("the system has no master node");
  return master;
}

function children(set: VfxValue): { tree: GraphTree; item: ChildrenItem } {
  const tree = treeOf(set).inputs.find((input) => input.tree.item.type === "children")?.tree;
  if (tree?.item.type !== "children") throw new Error("the emitter has no Children node");
  return { tree, item: tree.item };
}

function systems(tree: GraphTree): ChildSystemItem[] {
  return tree.inputs.flatMap(({ tree: fed }) => (fed.item.type === "system" ? [fed.item] : []));
}

describe("systemGraph, a child set", () => {
  const set = childSet([identifier("effect", SPARKS), identifier("effect", SMOKE), UNREACHED], {
    childEmitOnDeath: bool(true),
  });

  it("draws one Children node on the master's field, in place of the set's struct and lists", () => {
    const master = treeOf(set);
    const fed = master.inputs.map((input) => input.tree.item);

    expect(fed.map((item) => [item.type, item.id])).toEqual([["children", childrenIdOf("c0")]]);
    expect(master.item.type === "master" && master.item.groups).toEqual([
      {
        group: "effects",
        fields: [
          {
            hash: nameHash("childParticleSetDefinition"),
            input: expect.objectContaining({ type: "children", wire: SET, emitterPath: EMITTER }),
            pending: false,
          },
        ],
      },
    ]);
  });

  it("feeds the Children node a system node per child, an unreached child included", () => {
    const { tree, item } = children(set);

    expect(systems(tree).map((system) => [system.id, system.child.label, system.wire])).toEqual([
      [
        childSystemIdOf("c0", 0),
        "Particles/Sparks_Child",
        `${SET}.${hex("childrenIdentifiers")}[0]`,
      ],
      [
        childSystemIdOf("c0", 1),
        "Particles/Smoke_Child",
        `${SET}.${hex("childrenIdentifiers")}[1]`,
      ],
      [childSystemIdOf("c0", 2), "0x000000bb", `${SET}.${hex("childrenIdentifiers")}[2]`],
    ]);
    expect(item.systems).toHaveLength(3);
    expect(item.ports.map((port) => port.id)).toEqual(systems(tree).map((system) => system.id));
    expect(systems(tree)[0]?.parent).toEqual({ simple: false, listIndex: 0 });
  });

  it("lists the set's own fields in order, the unwritten ones pending", () => {
    const { item } = children(set);

    expect(item.fields).toEqual([
      { hash: nameHash("childEmitOnDeath"), input: null, pending: false },
      { hash: nameHash("childrenProbability"), input: null, pending: true },
      { hash: nameHash("ParentInheritanceDefinition"), input: null, pending: true },
    ]);
  });

  it("embeds a keyed probability in its socket, as a master does a keyed value", () => {
    const keyed = childSet([identifier("effect", SPARKS), identifier("effect", SMOKE)], {
      childrenProbability: KEYED,
    });
    const { tree, item } = children(keyed);
    const probability = item.fields.find((each) => each.hash === nameHash("childrenProbability"));
    const shown = embedSockets(tree, new Set());

    expect(probability?.input?.type).toBe("value");
    expect(shown.inputs.map((input) => input.tree.item.type)).toEqual(["system", "system"]);
    expect(shown.item.ports[0]?.embed?.type).toBe("value");
  });

  it("names the nodes: the section's title, and a system by its leaf over its path", () => {
    const { tree, item } = children(set);
    const [sparks, , unreached] = systems(tree);

    expect(itemTitle(item)).toBe("Child particles");
    expect(inputSummary(item)).toBe("3 items");
    expect([itemTitle(sparks!), itemSubtitle(sparks!)]).toEqual([
      "Sparks_Child",
      "Particles/Sparks_Child",
    ]);
    expect(itemTitle(unreached!)).toBe("0x000000bb");
  });
});

describe("layout of a child set", () => {
  const set = childSet([identifier("effect", SPARKS), UNREACHED], {
    boneToSpawnAt: list(text("Head"), text("Root")),
  });

  it("sizes a Children node by its three fields, its children and its add line", () => {
    const { item } = children(set);

    expect(childrenLines(item)).toBe(3 + 2 + 1);
    expect(sizeOf(item).height).toBe(HEADER_HEIGHT + 3 + 6 * LINE_HEIGHT + 2 * FIELD_PADDING);
  });

  it("folds a system node to its header and preview, and an unreached one to its header", () => {
    const [sparks, unreached] = systems(children(set).tree);
    const folded = sizeOf(sparks!, true);
    const open = sizeOf(sparks!, false);

    expect(open.height - folded.height).toBe(LINE_HEIGHT + 2 * FIELD_PADDING);
    expect(folded.height).toBeGreaterThan(HEADER_HEIGHT + 3);
    expect(sizeOf(unreached!, true).height).toBe(HEADER_HEIGHT + 3);
  });

  it("places each system node left of the Children node it feeds", () => {
    const layout = layoutGraph(treeOf(set));
    const at = (type: string) => layout.items.filter((placed) => placed.item.type === type);
    const [node] = at("children");

    expect(at("system")).toHaveLength(2);
    for (const system of at("system")) {
      expect(system.x + system.width).toBeLessThan(node!.x);
    }
    expect(layout.edges.filter((edge) => edge.target === node!.item.id)).toHaveLength(2);
  });
});

describe("removal of child nodes", () => {
  const set = childSet([identifier("effect", SPARKS), identifier("effect", SMOKE)], {
    boneToSpawnAt: list(text("Head"), text("Root")),
  });

  it("removes a system node's identifier and its bone under the emitter's set", () => {
    const [, smoke] = systems(children(set).tree);

    expect(nodeRemoval(smoke!)).toBeNull();
    expect(childRemoval(smoke!)).toEqual({
      holder: EMITTER,
      field: nameHash("childParticleSetDefinition"),
      edits: [
        { type: "removeItem", path: `${hex("childrenIdentifiers")}[1]` },
        { type: "removeItem", path: `${hex("boneToSpawnAt")}[1]` },
      ],
    });
  });

  it("resets the whole set from the Children node", () => {
    const { item } = children(set);

    expect(childRemoval(item)).toBeNull();
    expect(nodeRemoval(item)).toEqual({ type: "property", path: SET });
  });
});
