import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { DriverDiagnostic } from "../../engine/drivers/diagnostics";
import type { DriverKind, DriverNode } from "../../engine/drivers/node";
import { readDriver } from "../../engine/drivers/readDriver";
import { driverClass, graphRootKind, hashOf } from "../../engine/drivers/registry";
import { field, flag, text } from "../../engine/parsing/readValue";

/** `shimmerEmitterDefinitionData` of `VfxSystemDefinitionData`. */
const SHIMMER_LIST = nameHash("shimmerEmitterDefinitionData");

const EMITTER = {
  name: nameHash("emitterName"),
  disabled: nameHash("disabled"),
  components: nameHash("VfxComponents"),
} as const;

/** `materialDrivers`, a map of shader parameter name to a `vec4` driver pointer. */
const MATERIAL_DRIVERS = nameHash("materialDrivers");

/** `constantValue` of every value class, which a curve leaf's body edits. */
const CONSTANT_VALUE = nameHash("constantValue");

/** A path segment naming a list entry, `params[2]`: the field and the index. */
const LIST_ENTRY = /^(.*)(\[\d+\])$/;

/** The depth past which the walk for graphs under a component stops. */
const MAX_DEPTH = 32;

/** One input of a graph node: its handle id, what it is labelled, and the kind it takes. */
export interface GraphPort {
  readonly id: string;
  readonly label: string;
  readonly kind: DriverKind | null;
}

/** A leaf a node body edits: the struct holding it, by wire path, and its field hash. */
export interface LeafTarget {
  readonly holder: string;
  readonly field: string;
}

interface ItemBase {
  readonly id: string;
  /** The wire path of the row the item stands for, under the system object. */
  readonly wire: string;
  readonly ports: readonly GraphPort[];
}

/** The node every emitter feeds: the system's live preview. */
export interface PreviewItem extends ItemBase {
  readonly type: "preview";
}

/** One shimmer emitter, fed by each of its components. */
export interface EmitterItem extends ItemBase {
  readonly type: "emitter";
  readonly name: string;
  readonly disabled: boolean;
}

/** One component of an emitter, fed by the driver graph of each dynamic property it holds. */
export interface ComponentItem extends ItemBase {
  readonly type: "component";
  /** The `VfxComponents` field the component sits in, or `components[n]`. */
  readonly slot: string;
  /** The component's class name, or its hash where nothing names it. */
  readonly className: string;
}

/** One driver node, and the diagnostics reported at its path. */
export interface DriverItem extends ItemBase {
  readonly type: "driver";
  readonly node: DriverNode;
  readonly diagnostics: readonly DriverDiagnostic[];
  /**
   * The leaves the node body edits: a constant's value, a flat curve leaf's constant, or an
   * operator's stored values in the order of its `stored`.
   */
  readonly leaves: readonly LeafTarget[];
}

export type GraphItem = PreviewItem | EmitterItem | ComponentItem | DriverItem;

/** One item and the items that feed its ports, in port order. */
export interface GraphTree {
  readonly item: GraphItem;
  readonly inputs: readonly { readonly port: string; readonly tree: GraphTree }[];
}

/**
 * The shimmer emitters of a resolved `VfxSystemDefinitionData` as one tree into the preview.
 *
 * Each emitter feeds the preview, each component of `VfxComponents` feeds its emitter, and
 * each `Vfx*DynamicProperty` or `materialDrivers` entry under a component feeds that
 * component through its driver graph. Null for a system that holds no shimmer emitter.
 */
export function systemGraph(root: VfxValue): GraphTree | null {
  const list = field(root, SHIMMER_LIST);
  if (list?.type !== "container" || list.items.length === 0) return null;

  const emitters = list.items.map((emitter, index) =>
    emitterTree(emitter, `e${index}`, `${hex(SHIMMER_LIST)}[${index}]`, index),
  );
  return {
    item: {
      type: "preview",
      id: "preview",
      wire: "",
      ports: emitters.map(({ item }) => ({
        id: item.id,
        label: item.type === "emitter" ? item.name : item.id,
        kind: null,
      })),
    },
    inputs: emitters.map((tree) => ({ port: tree.item.id, tree })),
  };
}

function emitterTree(emitter: VfxValue, id: string, wire: string, index: number): GraphTree {
  const componentsWire = `${wire}.${hex(EMITTER.components)}`;
  const components = componentsOf(field(emitter, EMITTER.components)).map((each) =>
    componentTree(each.value, `${id}/${each.slot}`, `${componentsWire}${each.wire}`, each.slot),
  );

  return {
    item: {
      type: "emitter",
      id,
      wire,
      name: text(field(emitter, EMITTER.name)) ?? `[${index}]`,
      disabled: flag(field(emitter, EMITTER.disabled)),
      ports: components.map(({ item }) => ({
        id: item.id,
        label: item.type === "component" ? item.slot : item.id,
        kind: null,
      })),
    },
    inputs: components.map((tree) => ({ port: tree.item.id, tree })),
  };
}

/** Every component struct `VfxComponents` holds, by its slot and its wire segment. */
function componentsOf(held: VfxValue | null): { slot: string; wire: string; value: VfxValue }[] {
  if (held?.type !== "struct") return [];

  return held.fields.flatMap(({ name, hash, value }) => {
    const slot = name ?? hash;
    if (value.type === "struct") return [{ slot, wire: `.${hex(hash)}`, value }];
    if (value.type !== "container") return [];
    return value.items.flatMap((item, at) =>
      item.type === "struct"
        ? [{ slot: `${slot}[${at}]`, wire: `.${hex(hash)}[${at}]`, value: item }]
        : [],
    );
  });
}

function componentTree(component: VfxValue, id: string, wire: string, slot: string): GraphTree {
  const inputs = graphsUnder(component, "", wire, 0).map((graph) => {
    const port = `${id}/${graph.label}`;
    const read = readDriver(graph.value, graph.kind, port);
    const root = read.node;
    const driver = root.type === "property" ? root.driver : root;
    const driverWire = wireUnder(graph.wire, root.path, driver.path);
    return { port, graph, tree: driverTree(driver, driverWire, read.diagnostics) };
  });

  return {
    item: {
      type: "component",
      id,
      wire,
      slot,
      className: component.type === "struct" ? (component.class ?? component.classHash) : "",
      ports: inputs.map(({ port, graph }) => ({ id: port, label: graph.label, kind: graph.kind })),
    },
    inputs: inputs.map(({ port, tree }) => ({ port, tree })),
  };
}

interface GraphRoot {
  readonly label: string;
  readonly wire: string;
  readonly value: VfxValue;
  readonly kind: DriverKind;
}

/** The graph roots under `value`, each with its label and wire path. */
function graphsUnder(value: VfxValue, label: string, wire: string, depth: number): GraphRoot[] {
  if (depth > MAX_DEPTH) return [];

  if (value.type === "container") {
    return value.items.flatMap((item, at) =>
      graphsUnder(item, `${label}[${at}]`, `${wire}[${at}]`, depth + 1),
    );
  }
  if (value.type !== "struct") return [];

  return value.fields.flatMap(({ name, hash, value: held }) => {
    const named = label === "" ? (name ?? hash) : `${label}.${name ?? hash}`;
    const at = `${wire}.${hex(hash)}`;

    if (hash === MATERIAL_DRIVERS && held.type === "map") {
      return held.entries.map((entry) => ({
        label: `${named}.${entry.key}`,
        wire: `${at}{${entry.key}}`,
        value: entry.value,
        kind: "vec4" as const,
      }));
    }

    const kind = held.type === "struct" ? graphRootKind(held.classHash) : null;
    if (kind !== null) return [{ label: named, wire: at, value: held, kind }];
    return graphsUnder(held, named, at, depth + 1);
  });
}

function driverTree(
  node: DriverNode,
  wire: string,
  diagnostics: readonly DriverDiagnostic[],
): GraphTree {
  const inputs = childrenOf(node);

  return {
    item: {
      type: "driver",
      id: node.path,
      wire,
      node,
      diagnostics: diagnostics.filter((each) => each.path === node.path),
      leaves: leavesOf(node, wire),
      ports: inputs.map((input) => ({
        id: input.path,
        label: input.path.slice(node.path.length + 1),
        kind: input.kind,
      })),
    },
    inputs: inputs.map((input) => ({
      port: input.path,
      tree: driverTree(input, wireUnder(wire, node.path, input.path), diagnostics),
    })),
  };
}

function childrenOf(node: DriverNode): DriverNode[] {
  if (node.type === "property") return [node.driver];
  if (node.type === "operator") return node.inputs.map((input) => input.node);
  return [];
}

/** What a node's body edits. A curve leaf's is the `constantValue` of its value class. */
function leavesOf(node: DriverNode, wire: string): LeafTarget[] {
  switch (node.type) {
    case "operator":
      return node.stored.map((each) => ({ holder: wire, field: hashOf(each.field) }));
    case "constant":
    case "curve": {
      const slot = driverClass(node.classHash)?.leaves[0];
      if (slot === undefined) return [];
      if (node.type === "constant") return [{ holder: wire, field: hashOf(slot) }];
      return [{ holder: `${wire}.${hex(hashOf(slot))}`, field: CONSTANT_VALUE }];
    }
    case "property":
    case "unknown":
    case "empty":
      return [];
  }
}

/**
 * The wire path of a driver at `path`, under the one at `rootPath` whose wire is `rootWire`.
 *
 * `readDriver` joins the field names of its path with `/`, and a wire path joins their hashes.
 * A list entry's segment, `params[2]`, keeps its index.
 */
function wireUnder(rootWire: string, rootPath: string, path: string): string {
  const rest = path.slice(rootPath.length);
  if (rest === "") return rootWire;

  return (
    rootWire +
    rest
      .split("/")
      .filter((segment) => segment !== "")
      .map((segment) => {
        const entry = LIST_ENTRY.exec(segment);
        if (entry === null) return `.${hex(hashOf(segment))}`;
        return `.${hex(hashOf(entry[1]))}${entry[2]}`;
      })
      .join("")
  );
}

/** A `0x` hash as a wire segment writes it: its eight hex digits alone. */
function hex(hash: string): string {
  return hash.slice(2);
}
