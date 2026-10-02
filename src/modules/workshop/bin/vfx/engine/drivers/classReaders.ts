/*
 * The readers of each family of driver class, which the registry lists by class hash.
 */
import type { VfxValue } from "@/lib/tauri";

import { hashOf, nameHash } from "../../../shared/utils/binHash";
import type { ValueCurve } from "../model/model";
import { components, curve, field, flagOr, number } from "../parsing/readValue";
import type { DriverDiagnosticCode } from "./diagnostics";
import type {
  DriverKind,
  DriverNode,
  Operator,
  OperatorInput,
  StoredValue,
  SupportLevel,
} from "./node";

type StructValue = Extract<VfxValue, { type: "struct" }>;

/** The callbacks a class reader uses to read its child drivers and to report diagnostics. */
export interface DriverReader {
  /** The driver a pointer field holds, read as `kind`. */
  child(value: VfxValue | null, kind: DriverKind, path: string): DriverNode;
  report(code: DriverDiagnosticCode, classHash: string | null, path: string): void;
}

/** One input of a class: the field that holds a child driver, and the kind it outputs. */
export interface DriverPort {
  readonly field: string;
  readonly kind: DriverKind;
  /** The field is a list of drivers, `params`, rather than one pointer. */
  readonly list: boolean;
}

/** One class the evaluator has a reading for. */
export interface DriverClass {
  /** The class as the meta schema names it, and its hex hash for an unnamed class. */
  readonly name: string;
  /** What the class outputs, and for a wrapper what the field it wraps reads as. */
  readonly kind: DriverKind;
  readonly level: SupportLevel;
  /** The fields that hold child drivers, in the order the editor draws their ports. */
  readonly inputs: readonly DriverPort[];
  /** The class outputs a colour, which the editor draws as a swatch. */
  readonly color: boolean;
  /** The fields of the values a node body edits: a constant's value, a clamp's bounds. */
  readonly leaves: readonly string[];
  read(node: StructValue, path: string, reader: DriverReader): DriverNode;
}

/** A wrapper's own pointer field and the kind its driver outputs. */
export function property(name: string, kind: DriverKind, slot: string): [string, DriverClass] {
  const slotHash = nameHash(slot);
  return [
    nameHash(name),
    {
      name,
      kind,
      level: "attested",
      inputs: [port(slot, kind)],
      color: false,
      leaves: [],
      read(node, path, reader) {
        const at = `${path}/${slot}`;
        return {
          type: "property",
          kind,
          path,
          classHash: node.classHash,
          driver: reader.child(field(node, slotHash), kind, at),
        };
      },
    },
  ];
}

/** A constant's value field and the schema default for a file that writes none. */
export function constantDriver(
  name: string,
  kind: DriverKind,
  slot: string,
  fallback: readonly number[],
): [string, DriverClass] {
  const slotHash = nameHash(slot);
  return [
    nameHash(name),
    {
      name,
      kind,
      level: "attested",
      inputs: [],
      color: slot === "Color",
      leaves: [slot],
      read(node, path) {
        const value = components(field(node, slotHash)) ?? fallback;
        return { type: "constant", kind, path, classHash: node.classHash, value };
      },
    },
  ];
}

const FREQUENCY = nameHash("frequency");
const LOOPING = nameHash("looping");
const SHARE_RANDOM = nameHash("ShareRandom");

/**
 * A curve leaf by its unnamed class hash, the field its value class sits in, and the
 * default of that field.
 */
export function curveLeaf(
  hash: string,
  kind: DriverKind,
  slot: string,
  fallback: ValueCurve,
): [string, DriverClass] {
  const slotHash = nameHash(slot);
  return [
    hash,
    {
      name: hash,
      kind,
      level: "inferred",
      inputs: [],
      color: slot === "colors",
      leaves: [slot],
      read(node, path, reader) {
        const held = curve(field(node, slotHash), fallback);
        const frequency = number(field(node, FREQUENCY)) ?? 0;
        const looping = flagOr(field(node, LOOPING), false);

        reader.report("inferred", node.classHash, path);
        if (frequency > 1) reader.report("unreadFrequency", node.classHash, path);
        if (looping) reader.report("unreadLooping", node.classHash, path);
        if (held.tables.length > 0) reader.report("undrawnTables", node.classHash, path);

        return {
          type: "curve",
          kind,
          path,
          classHash: node.classHash,
          curve: held,
          frequency,
          looping,
          shareRandom: flagOr(field(node, SHARE_RANDOM), false),
        };
      },
    },
  ];
}

export function port(name: string, kind: DriverKind): DriverPort {
  return { field: name, kind, list: false };
}

/** The `params` list of an n-ary class. */
export function params(kind: DriverKind): DriverPort {
  return { field: "params", kind, list: true };
}

/** A value an operator class stores, and the schema default for a file that writes none. */
interface StoredField {
  readonly field: string;
  readonly fallback: readonly number[];
}

export function stored(name: string, fallback: readonly number[]): StoredField {
  return { field: name, fallback };
}

/** An operator class of D1, marked `inferred` until section 5 confirms its operation. */
export function operatorClass(
  name: string,
  operator: Operator,
  kind: DriverKind,
  ports: readonly DriverPort[],
  values: readonly StoredField[] = [],
): [string, DriverClass] {
  return [
    hashOf(name),
    {
      name,
      kind,
      level: "inferred",
      inputs: ports,
      color: false,
      leaves: values.map((each) => each.field),
      read(node, path, reader) {
        reader.report("inferred", node.classHash, path);

        const inputs = ports.flatMap((each) => readPort(node, path, each, reader));
        const held = values.map(({ field: name, fallback }) => ({
          field: name,
          value: components(field(node, hashOf(name))) ?? fallback,
        }));

        if (ports.some((each) => each.list) && inputs.length === 0) {
          reader.report("emptyParams", node.classHash, path);
        }
        if (operator === "clamp" && crossed(held)) {
          reader.report("inverseBounds", node.classHash, path);
        }

        return {
          type: "operator",
          kind,
          path,
          classHash: node.classHash,
          operator,
          inputs,
          stored: held,
        };
      },
    },
  ];
}

function readPort(
  node: StructValue,
  path: string,
  { field: name, kind, list }: DriverPort,
  reader: DriverReader,
): OperatorInput[] {
  const held = field(node, hashOf(name));
  if (!list) return [{ field: name, node: reader.child(held, kind, `${path}/${name}`) }];
  if (held?.type !== "container") return [];

  return held.items.map((item, at) => {
    const entry = `${name}[${at}]`;
    return { field: entry, node: reader.child(item, kind, `${path}/${entry}`) };
  });
}

/** A clamp's `Low` exceeds its `High` in some component. */
function crossed([low, high]: readonly StoredValue[]): boolean {
  if (low === undefined || high === undefined) return false;
  return low.value.some((bound, at) => bound > (high.value[at] ?? bound));
}

/**
 * A random node and its range field. Its draw's scope follows the consumer's, since
 * section 5.3 has not answered.
 */
export function randomClass(hash: string, range: string): [string, DriverClass] {
  const rangeHash = nameHash(range);
  return [
    hash,
    {
      name: hash,
      kind: "float",
      level: "inferred",
      inputs: [],
      color: false,
      leaves: [range],
      read(node, path, reader) {
        reader.report("inferred", node.classHash, path);
        const range = components(field(node, rangeHash)) ?? [0, 1];
        return { type: "random", kind: "float", path, classHash: node.classHash, range };
      },
    },
  ];
}

const EASING = {
  easing: nameHash("Easing"),
  function: nameHash("EasingFunction"),
  duration: nameHash("duration"),
} as const;

/** The last `EasingType` member's value. */
const LAST_EASING = 33;

const EASING_PORTS: readonly DriverPort[] = [port("Left", "float"), port("Right", "float")];

/** `VfxFloatEasingDriver`, with `EasingFunction` read as `EasingType`. */
export const EASING_CLASS: [string, DriverClass] = [
  nameHash("VfxFloatEasingDriver"),
  {
    name: "VfxFloatEasingDriver",
    kind: "float",
    level: "inferred",
    inputs: EASING_PORTS,
    color: false,
    leaves: ["duration"],
    read(node, path, reader) {
      const easingFunction = number(field(node, EASING.function)) ?? 0;
      const duration = number(field(node, EASING.duration)) ?? 1;
      const frequency = number(field(node, FREQUENCY)) ?? 0;

      reader.report("inferred", node.classHash, path);
      if ((number(field(node, EASING.easing)) ?? 0) !== 0) {
        reader.report("unreadEasing", node.classHash, path);
      }
      if (easingFunction > LAST_EASING) {
        reader.report("unknownEasingFunction", node.classHash, path);
      }
      if (duration <= 0) reader.report("nonPositiveDuration", node.classHash, path);
      if (frequency > 1) reader.report("unreadFrequency", node.classHash, path);

      return {
        type: "easing",
        kind: "float",
        path,
        classHash: node.classHash,
        inputs: EASING_PORTS.flatMap((each) => readPort(node, path, each, reader)),
        easingFunction,
        duration,
        frequency,
        looping: flagOr(field(node, LOOPING), false),
      };
    },
  },
];

/** The unnamed field an extension class appends to its input. */
export const EXTENSION = "0xb1ea6248";

/** `entry` with its class marked as outputting a colour. */
export function colored([hash, entry]: [string, DriverClass]): [string, DriverClass] {
  return [hash, { ...entry, color: true }];
}
