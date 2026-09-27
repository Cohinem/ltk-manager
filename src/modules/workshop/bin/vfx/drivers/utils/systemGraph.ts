import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { DriverDiagnostic } from "../../engine/drivers/diagnostics";
import type { DriverKind, DriverNode } from "../../engine/drivers/node";
import { readDriver } from "../../engine/drivers/readDriver";
import { driverClass, graphRootKind, hashOf } from "../../engine/drivers/registry";
import { field, flag, text } from "../../engine/parsing/readValue";
import { classicEmitters, hex, materialTree, NO_PENDING, type PendingFields } from "./emitterGraph";
import type { ComponentLine, GraphItem, GraphTree, LeafTarget } from "./graphItems";
import { holdsMaterial } from "./materialNodes";

export type {
  ComponentItem,
  ComponentLine,
  DriverItem,
  EmitterItem,
  FileItem,
  GraphItem,
  GraphPort,
  GraphTree,
  LeafTarget,
  MasterItem,
  PreviewItem,
  RenderItem,
  StructItem,
  ValueItem,
} from "./graphItems";

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

/**
 * The emitters of a resolved `VfxSystemDefinitionData` as one tree into the preview.
 *
 * Complex and simple emitters come first, as master nodes (`classicEmitters`). Each shimmer
 * emitter is fed by its components, and each `Vfx*DynamicProperty` or `materialDrivers` entry
 * under a component feeds that component through its driver graph. `pending` holds the
 * fields Add field picked, by master id. Null for a system that holds no emitter.
 */
export function systemGraph(root: VfxValue, pending: PendingFields = NO_PENDING): GraphTree | null {
  const emitters = [...classicEmitters(root, pending), ...shimmerEmitters(root)];
  if (emitters.length === 0) return null;

  return {
    item: {
      type: "preview",
      id: "preview",
      wire: "",
      ports: emitters.map(({ item }) => ({ id: item.id, label: emitterName(item), kind: null })),
    },
    inputs: emitters.map((tree) => ({ port: tree.item.id, tree })),
  };
}

function emitterName(item: GraphItem): string {
  return item.type === "emitter" || item.type === "master" ? item.name : item.id;
}

function shimmerEmitters(root: VfxValue): GraphTree[] {
  const list = field(root, SHIMMER_LIST);
  if (list?.type !== "container") return [];

  return list.items.map((emitter, index) =>
    emitterTree(emitter, `e${index}`, `${hex(SHIMMER_LIST)}[${index}]`, index),
  );
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
  const walk = new ComponentWalk(id);
  walk.struct(component, "", wire, 0);

  return {
    item: {
      type: "component",
      id,
      wire,
      slot,
      className: component.type === "struct" ? (component.class ?? component.classHash) : "",
      classHash: component.type === "struct" ? component.classHash : "",
      lines: walk.lines,
      ports: walk.inputs.map(({ port, kind, label }) => ({ id: port, label, kind })),
    },
    inputs: walk.inputs.map(({ port, tree }) => ({ port, tree })),
  };
}

/**
 * One component's body and the driver graphs that feed it, read in one pass.
 *
 * Every struct under the component heads a section of its own, a list item under its list,
 * and a dynamic property or a `materialDrivers` entry is an input where it sits. A port is
 * named by the field path from the component, which the edges key on.
 */
class ComponentWalk {
  readonly lines: ComponentLine[] = [];
  readonly inputs: {
    port: string;
    label: string;
    kind: DriverKind | null;
    tree: GraphTree;
  }[] = [];

  constructor(private readonly id: string) {}

  struct(value: VfxValue, label: string, wire: string, depth: number): void {
    if (value.type !== "struct" || depth > MAX_DEPTH) return;

    const holder = { holder: wire, holderRows: value.fields.length };
    for (const { name, hash, value: held } of value.fields) {
      const named = label === "" ? (name ?? hash) : `${label}.${name ?? hash}`;
      const at = `${wire}.${hex(hash)}`;
      const field = { depth, name: name ?? hash, hash };

      if (hash === MATERIAL_DRIVERS && held.type === "map") {
        this.section({ ...field, index: null, className: null });
        for (const entry of held.entries) {
          const graph = { value: entry.value, wire: `${at}{${entry.key}}`, kind: "vec4" as const };
          this.input(`${named}.${entry.key}`, graph, {
            ...holder,
            depth: depth + 1,
            name: entry.key,
            hash: null,
          });
        }
        continue;
      }

      const kind = held.type === "struct" ? graphRootKind(held.classHash) : null;
      if (kind !== null) {
        this.input(named, { value: held, wire: at, kind }, { ...holder, ...field });
        continue;
      }

      if (holdsMaterial(held)) {
        const port = `${this.id}/${named}`;
        const tree = materialTree(held, { id: port, ...holder, field: hash }, name ?? hash);
        if (tree !== null) {
          const className = held.type === "struct" ? materialClass(held) : null;
          this.lines.push({ type: "material", ...holder, ...field, port, className });
          this.inputs.push({ port, label: named, kind: null, tree });
          continue;
        }
      }

      if (held.type === "struct") {
        this.section({ ...field, index: null, className: held.class ?? held.classHash });
        this.struct(held, named, at, depth + 1);
        continue;
      }

      if (held.type === "container" && held.items.some((item) => item.type === "struct")) {
        this.section({ ...field, index: null, className: null });
        held.items.forEach((item, index) => this.item(item, named, at, index, depth + 1, field));
        continue;
      }

      this.lines.push({ type: "field", ...holder, ...field });
    }
  }

  private item(
    value: VfxValue,
    label: string,
    wire: string,
    index: number,
    depth: number,
    field: { name: string; hash: string },
  ): void {
    if (value.type !== "struct") return;

    const named = `${label}[${index}]`;
    const at = `${wire}[${index}]`;
    const kind = graphRootKind(value.classHash);
    if (kind !== null) {
      this.input(
        named,
        { value, wire: at, kind },
        {
          holder: wire,
          holderRows: 0,
          depth,
          name: `[${index}]`,
          hash: null,
        },
      );
      return;
    }

    this.section({ ...field, depth, index, className: value.class ?? value.classHash });
    this.struct(value, named, at, depth + 1);
  }

  private section(line: Omit<Extract<ComponentLine, { type: "section" }>, "type">): void {
    this.lines.push({ type: "section", ...line });
  }

  private input(
    label: string,
    graph: { value: VfxValue; wire: string; kind: DriverKind },
    line: { holder: string; holderRows: number; depth: number; name: string; hash: string | null },
  ): void {
    const port = `${this.id}/${label}`;
    const read = readDriver(graph.value, graph.kind, port);
    const root = read.node;
    const driver = root.type === "property" ? root.driver : root;
    const tree = driverTree(
      driver,
      wireUnder(graph.wire, root.path, driver.path),
      read.diagnostics,
    );

    this.lines.push({ type: "input", ...line, port, kind: graph.kind, driver });
    this.inputs.push({ port, label, kind: graph.kind, tree });
  }
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
  if (node.type === "operator" || node.type === "easing") {
    return node.inputs.map((input) => input.node);
  }
  return [];
}

/** What a node's body edits. A curve leaf's is the `constantValue` of its value class. */
function leavesOf(node: DriverNode, wire: string): LeafTarget[] {
  switch (node.type) {
    case "operator":
      return node.stored.map((each) => ({ holder: wire, field: hashOf(each.field) }));
    case "random":
    case "easing":
      return (driverClass(node.classHash)?.leaves ?? []).map((each) => ({
        holder: wire,
        field: hashOf(each),
      }));
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

/** The class a material line names: the material's own, where a container holds it. */
function materialClass(value: Extract<VfxValue, { type: "struct" }>): string {
  const inner = value.fields.find(({ value: held }) => held.type === "struct")?.value;
  const held = inner?.type === "struct" && value.fields.length === 1 ? inner : value;
  return held.class ?? held.classHash;
}
