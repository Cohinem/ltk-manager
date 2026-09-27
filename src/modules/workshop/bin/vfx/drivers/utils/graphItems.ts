import type { AssetRef } from "@/lib/tauri";

import type { DriverDiagnostic } from "../../engine/drivers/diagnostics";
import type { DriverKind, DriverNode } from "../../engine/drivers/node";
import type { ValueCurve } from "../../engine/model/model";
import type { EmitterGroup } from "../../inspector/utils/emitterGroups";

/** One input of a graph node: its handle id, what it is labelled, and the kind it takes. */
export interface GraphPort {
  readonly id: string;
  readonly label: string;
  readonly kind: DriverKind | null;
  /** The driver drawn inside the socket rather than as a node of its own. */
  readonly embed?: DriverItem;
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
  readonly classHash: string;
  /** The component's body, one line each, in the order the file writes its fields. */
  readonly lines: readonly ComponentLine[];
}

/**
 * One line of a component node's body: the heading of a struct it holds, a field it edits in
 * place, or the input a dynamic property's driver graph feeds. `depth` counts the structs
 * between the line and the component.
 */
export type ComponentLine =
  | {
      readonly type: "section";
      readonly depth: number;
      /** The field the struct sits in, and its place for a list item. */
      readonly name: string;
      readonly hash: string | null;
      readonly index: number | null;
      readonly className: string | null;
    }
  | {
      readonly type: "field";
      readonly depth: number;
      /** The wire path of the struct holding the field, and how many fields it holds. */
      readonly holder: string;
      readonly holderRows: number;
      readonly hash: string;
      readonly name: string;
    }
  | {
      readonly type: "input";
      readonly depth: number;
      readonly holder: string;
      readonly holderRows: number;
      /** The port the graph's edge lands on. */
      readonly port: string;
      readonly name: string;
      readonly hash: string | null;
      readonly kind: DriverKind;
      /** The driver at the root of the graph, which the line summarizes. */
      readonly driver: DriverNode;
    }
  | {
      readonly type: "material";
      readonly depth: number;
      readonly holder: string;
      readonly holderRows: number;
      /** The port the material node's edge lands on. */
      readonly port: string;
      readonly name: string;
      readonly hash: string;
      /** The material's class, which the line names. */
      readonly className: string | null;
    };

/** One driver node, and the diagnostics reported at its path. */
export interface DriverItem extends ItemBase {
  readonly type: "driver";
  readonly node: DriverNode;
  readonly diagnostics: readonly DriverDiagnostic[];
  /**
   * The leaves the node body edits: a constant's value, a flat curve leaf's constant, an
   * operator's stored values in the order of its `stored`, a random node's `Range` or an
   * easing driver's `duration`.
   */
  readonly leaves: readonly LeafTarget[];
}

/** One field of a master node: a leaf it edits in place, or an input another node connects to. */
export interface MasterField {
  /** The field's hash, `0x` and eight hex digits. */
  readonly hash: string;
  /** The node drawing a keyed value or a struct, and null for a leaf. */
  readonly input: InputItem | null;
  /** A field the file does not write yet, drawn at its default until an edit authors it. */
  readonly pending: boolean;
}

/** One inspector group of a master node, and its fields in file order. */
export interface MasterGroup {
  readonly group: EmitterGroup;
  readonly fields: readonly MasterField[];
}

/** A complex or simple emitter: its leaf fields, and an input per keyed value or struct. */
export interface MasterItem extends ItemBase {
  readonly type: "master";
  readonly name: string;
  readonly disabled: boolean;
  /** An entry of `simpleEmitterDefinitionData` rather than `complexEmitterDefinitionData`. */
  readonly simple: boolean;
  /** Its place in its own list. */
  readonly listIndex: number;
  readonly classHash: string;
  readonly className: string | null;
  readonly groups: readonly MasterGroup[];
  /** The number of fields the emitter writes, which its row read asks for. */
  readonly rowCount: number;
}

/** One row of a struct node: a field or an item, and the node drawing it if it is not a leaf. */
export interface StructRow {
  /** A struct's field hash, a list's `[n]` or a map's key. */
  readonly key: string;
  /** The field's name where the hash tables name it, else `key`. */
  readonly name: string;
  readonly input: InputItem | null;
  /** The items of a list or map a material holds, drawn under the row, and null elsewhere. */
  readonly entries: readonly ListEntry[] | null;
}

/** One item of a list or map a material holds, as one line of the material's node. */
export interface ListEntry {
  /** The item's name where it has one, else its place in the list. */
  readonly key: string;
  /** The item's first other values, written out. */
  readonly text: string;
}

/** A struct, pointer, list or map an emitter holds, connected to its holder's input. */
export interface StructItem extends ItemBase {
  readonly type: "struct";
  readonly shape: "struct" | "list" | "map";
  /** The field, item or key of the holder. */
  readonly label: string;
  readonly classHash: string | null;
  readonly className: string | null;
  /** The wire path of the holder. */
  readonly holder: string;
  /** The field of `holder`, and null for a list item or a map value. */
  readonly field: string | null;
  readonly rows: readonly StructRow[];
  /**
   * The struct its one field holds, drawn as a section of this node rather than a node of
   * its own, and null where it holds anything else.
   */
  readonly nested: StructItem | null;
  /** The first file among its rows or its section's, drawn as the node's preview. */
  readonly picture: FileItem | null;
}

/** A keyed or randomised `Value*` field, which the curve panel edits. */
export interface ValueItem extends ItemBase {
  readonly type: "value";
  readonly label: string;
  /** The wire path of the struct or list holding the value. */
  readonly holder: string;
  /** The number of rows `holder` holds, which the value's row read asks for. */
  readonly holderRows: number;
  readonly classHash: string;
  readonly className: string | null;
  readonly kind: DriverKind | null;
  readonly curve: ValueCurve;
}

/** What a file node previews a file as, from its extension. */
export type FileKind = "texture" | "mesh" | "other";

/** A file an emitter names, previewed as what it holds. */
export interface FileItem extends ItemBase {
  readonly type: "file";
  /** The field, item or key of the holder. */
  readonly label: string;
  /** The wire path of the struct or list holding the path. */
  readonly holder: string;
  /** The number of rows `holder` holds, which the path's row read asks for. */
  readonly holderRows: number;
  readonly path: string;
  /** Where the file resolved to, and null for a path nothing resolves. */
  readonly asset: AssetRef | null;
  readonly kind: FileKind;
}

/** A node that feeds a field of a master or struct node. */
export type InputItem = StructItem | ValueItem | FileItem;

export type GraphItem =
  | PreviewItem
  | EmitterItem
  | ComponentItem
  | DriverItem
  | MasterItem
  | StructItem
  | ValueItem
  | FileItem;

/** One item and the items that feed its ports, in port order. */
export interface GraphTree {
  readonly item: GraphItem;
  readonly inputs: readonly { readonly port: string; readonly tree: GraphTree }[];
}
