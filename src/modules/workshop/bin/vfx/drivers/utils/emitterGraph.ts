import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { classFamily } from "../../../values/utils/valueRows";
import type { DriverKind } from "../../engine/drivers/node";
import type { ValueCurve } from "../../engine/model/model";
import { curve, field, flag, text } from "../../engine/parsing/readValue";
import { type EmitterGroup, fieldGroup, GROUP_ORDER } from "../../inspector/utils/emitterGroups";
import type {
  FileKind,
  GraphPort,
  GraphTree,
  InputItem,
  MasterField,
  MasterGroup,
  StructRow,
} from "./graphItems";

/** The two lists of classic emitters, with the prefix of their master ids. */
const LISTS = [
  { hash: nameHash("complexEmitterDefinitionData"), prefix: "c", simple: false },
  { hash: nameHash("simpleEmitterDefinitionData"), prefix: "s", simple: true },
] as const;

/** The fields a master node's header draws, which its groups leave out. */
const HEADER = { name: nameHash("emitterName"), disabled: nameHash("disabled") } as const;

/** The output kind of each value class a curve node carries. */
const VALUE_KIND: ReadonlyMap<string, DriverKind> = new Map([
  [nameHash("ValueFloat"), "float"],
  [nameHash("ValueVector2"), "vec2"],
  [nameHash("ValueVector3"), "vec3"],
  [nameHash("ValueColorRgb"), "vec3"],
  [nameHash("ValueColor"), "vec4"],
  [nameHash("IntegratedValueFloat"), "float"],
  [nameHash("IntegratedValueVector2"), "vec2"],
  [nameHash("IntegratedValueVector3"), "vec3"],
]);

/** The depth past which a struct draws as a leaf rather than a node. */
const MAX_DEPTH = 16;

const FLAT: ValueCurve = { constant: [], keys: [], tables: [] };

/** The fields Add field picked and no edit has authored yet, by master id. */
export type PendingFields = ReadonlyMap<string, readonly string[]>;

export const NO_PENDING: PendingFields = new Map();

/** Every complex and then simple emitter of a resolved system, as a master node's tree. */
export function classicEmitters(root: VfxValue, pending: PendingFields): GraphTree[] {
  return LISTS.flatMap(({ hash, prefix, simple }) => {
    const list = field(root, hash);
    if (list?.type !== "container") return [];

    return list.items.flatMap((emitter, index) => {
      const id = `${prefix}${index}`;
      const wire = `${hex(hash)}[${index}]`;
      return [masterTree(emitter, { id, wire, index, simple }, pending.get(id) ?? [])];
    });
  });
}

interface MasterPlace {
  readonly id: string;
  readonly wire: string;
  readonly index: number;
  readonly simple: boolean;
}

function masterTree(emitter: VfxValue, at: MasterPlace, pending: readonly string[]): GraphTree {
  const fields = emitter.type === "struct" ? emitter.fields : [];
  const byGroup = new Map<EmitterGroup, MasterField[]>();
  const inputs = new Map<string, GraphTree>();
  const put = (hash: string, each: MasterField) => {
    const group = fieldGroup(hash);
    byGroup.set(group, [...(byGroup.get(group) ?? []), each]);
  };

  for (const { hash, name, value } of fields) {
    if (hash === HEADER.name || hash === HEADER.disabled) continue;

    const place = {
      id: `${at.id}/${name ?? hash}`,
      holder: at.wire,
      holderRows: fields.length,
      field: hash,
    };
    const input = inputOf(value, place, name ?? hash, 0);
    if (input !== null) inputs.set(hash, input);
    put(hash, { hash, input: fedBy(input), pending: false });
  }
  const authored = new Set(fields.map((each) => each.hash));
  for (const hash of pending) {
    if (!authored.has(hash)) put(hash, { hash, input: null, pending: true });
  }

  const groups: MasterGroup[] = GROUP_ORDER.flatMap((group) => {
    const held = byGroup.get(group);
    return held === undefined ? [] : [{ group, fields: held }];
  });
  const ordered = groups
    .flatMap((each) => each.fields)
    .flatMap((each) => {
      const input = inputs.get(each.hash);
      return input === undefined ? [] : [input];
    });

  return {
    item: {
      type: "master",
      id: at.id,
      wire: at.wire,
      name: text(field(emitter, HEADER.name)) ?? `[${at.index}]`,
      disabled: flag(field(emitter, HEADER.disabled)),
      simple: at.simple,
      listIndex: at.index,
      classHash: emitter.type === "struct" ? emitter.classHash : "",
      className: emitter.type === "struct" ? emitter.class : null,
      groups,
      rowCount: fields.length,
      ports: ordered.map(portOf),
    },
    inputs: ordered.map((tree) => ({ port: tree.item.id, tree })),
  };
}

interface InputPlace {
  readonly id: string;
  /** The wire path of the struct or list holding the value. */
  readonly holder: string;
  /** The number of rows `holder` holds. */
  readonly holderRows: number;
  /** The field of `holder` the value is, and null for a list item or a map value. */
  readonly field: string | null;
  /** The wire segment after `holder`, which a field's own hash gives where this is empty. */
  readonly segment?: string;
}

/**
 * The node a value feeds its holder through, and null for a leaf the holder edits in place.
 *
 * A keyed value is a curve node, and a struct, list or map the file writes is a struct node. A
 * struct the resolver inlined from another object stays a leaf, since its fields are not
 * the emitter's.
 */
function inputOf(value: VfxValue, at: InputPlace, label: string, depth: number): GraphTree | null {
  if (depth > MAX_DEPTH) return null;

  const wire = at.holder + (at.segment ?? `.${hex(at.field ?? "")}`);
  if (value.type === "asset") return fileTree(value, { ...at, wire, label });
  if (value.type === "struct") {
    if (value.object !== null) return null;

    if (classFamily(value.classHash) !== null) return valueTree(value, { ...at, wire, label });
    const rows = value.fields.map(({ hash, name, value: held }) => ({
      key: hash,
      name: name ?? hash,
      tree: inputOf(
        held,
        {
          id: `${at.id}/${name ?? hash}`,
          holder: wire,
          holderRows: value.fields.length,
          field: hash,
        },
        name ?? hash,
        depth + 1,
      ),
    }));
    return structTree({ ...at, wire, label, shape: "struct", held: value }, rows);
  }

  if (value.type === "container" && value.items.length > 0) {
    const rows = value.items.map((item, index) => ({
      key: `[${index}]`,
      name: `[${index}]`,
      tree: inputOf(
        item,
        {
          id: `${at.id}[${index}]`,
          holder: wire,
          holderRows: value.items.length,
          field: null,
          segment: `[${index}]`,
        },
        `[${index}]`,
        depth + 1,
      ),
    }));
    return structTree({ ...at, wire, label, shape: "list", held: null }, rows);
  }

  if (value.type === "map" && value.entries.length > 0) {
    const rows = value.entries.map((entry) => ({
      key: entry.key,
      name: entry.key,
      tree: inputOf(
        entry.value,
        {
          id: `${at.id}{${entry.key}}`,
          holder: wire,
          holderRows: value.entries.length,
          field: null,
          segment: `{${entry.key}}`,
        },
        entry.key,
        depth + 1,
      ),
    }));
    return structTree({ ...at, wire, label, shape: "map", held: null }, rows);
  }

  return null;
}

function valueTree(
  value: Extract<VfxValue, { type: "struct" }>,
  at: { id: string; wire: string; holder: string; holderRows: number; label: string },
): GraphTree | null {
  const read = curve(value, FLAT);
  if (read.keys.length === 0 && read.tables.length === 0) return null;

  return {
    item: {
      type: "value",
      id: at.id,
      wire: at.wire,
      holder: at.holder,
      holderRows: at.holderRows,
      label: at.label,
      classHash: value.classHash,
      className: value.class,
      kind: VALUE_KIND.get(value.classHash) ?? null,
      curve: read,
      ports: [],
    },
    inputs: [],
  };
}

function fileTree(
  value: Extract<VfxValue, { type: "asset" }>,
  at: { id: string; wire: string; holder: string; holderRows: number; label: string },
): GraphTree {
  return {
    item: {
      type: "file",
      id: at.id,
      wire: at.wire,
      holder: at.holder,
      holderRows: at.holderRows,
      label: at.label,
      path: value.path,
      asset: value.asset,
      kind: fileKind(value.path),
      ports: [],
    },
    inputs: [],
  };
}

/* The extensions a file node draws as a picture or as a mesh, as the preview layer reads them. */
const TEXTURE_EXTENSIONS = [".tex", ".dds", ".png", ".jpg", ".jpeg", ".tga"] as const;
const MESH_EXTENSIONS = [".scb", ".sco", ".gmesh", ".tmesh"] as const;

function fileKind(path: string): FileKind {
  const lower = path.toLowerCase();
  if (TEXTURE_EXTENSIONS.some((extension) => lower.endsWith(extension))) return "texture";
  if (MESH_EXTENSIONS.some((extension) => lower.endsWith(extension))) return "mesh";
  return "other";
}

interface StructPlace extends InputPlace {
  readonly wire: string;
  readonly label: string;
  readonly shape: "struct" | "list" | "map";
  readonly held: Extract<VfxValue, { type: "struct" }> | null;
}

/**
 * A struct, list or map node over its rows.
 *
 * A struct whose one field holds another struct draws that struct as a section of its own
 * node, whose inputs it takes over, so a pointer chain reads as one node. A file under a
 * struct is drawn in place: its path on its row, and its picture on the node.
 */
function structTree(
  at: StructPlace,
  rows: readonly { key: string; name: string; tree: GraphTree | null }[],
): GraphTree {
  const lone = at.shape === "struct" && rows.length === 1 ? rows[0]?.tree : null;
  const section = lone?.item.type === "struct" && lone.item.shape === "struct" ? lone : null;
  const nested = section?.item.type === "struct" ? section.item : null;

  const shown = section === null ? rows : [];
  const files = shown.flatMap(({ tree }) => (tree?.item.type === "file" ? [tree.item] : []));
  const fed = [
    ...shown.flatMap(({ tree }) => (tree === null || tree.item.type === "file" ? [] : [tree])),
    ...(section?.inputs.map((input) => input.tree) ?? []),
  ];
  const structRows: StructRow[] = shown.map(({ key, name, tree }) => ({
    key,
    name,
    input: tree?.item.type === "file" ? null : fedBy(tree),
  }));

  return {
    item: {
      type: "struct",
      id: at.id,
      wire: at.wire,
      shape: at.shape,
      label: at.label,
      classHash: at.held?.classHash ?? null,
      className: at.held?.class ?? null,
      holder: at.holder,
      field: at.field,
      rows: structRows,
      nested,
      picture: files[0] ?? nested?.picture ?? null,
      ports: fed.map(portOf),
    },
    inputs: fed.map((tree) => ({ port: tree.item.id, tree })),
  };
}

/** The port an input tree feeds its holder through, labelled as the holder's row reads. */
function portOf(tree: GraphTree): GraphPort {
  const { item } = tree;
  const label =
    item.type === "struct" || item.type === "value" || item.type === "file" ? item.label : item.id;
  return { id: item.id, label, kind: item.type === "value" ? item.kind : null };
}

/** The struct or curve item at the root of an input tree, and null for no input. */
function fedBy(tree: GraphTree | null): InputItem | null {
  const item = tree?.item;
  return item?.type === "struct" || item?.type === "value" || item?.type === "file" ? item : null;
}

/** A `0x` hash as a wire segment writes it: its eight hex digits alone. */
function hex(hash: string): string {
  return hash.slice(2);
}
