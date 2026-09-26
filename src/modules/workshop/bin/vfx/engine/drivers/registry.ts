import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { ValueCurve } from "../model/model";
import { components, constant, curve, field, flagOr, number } from "../parsing/readValue";
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

/** The hash a class or field is keyed on: the hash of its name, or the hex hash itself. */
export function hashOf(name: string): string {
  return name.startsWith("0x") ? name : nameHash(name);
}

/** A wrapper's own pointer field and the kind its driver outputs. */
function property(name: string, kind: DriverKind, slot: string): [string, DriverClass] {
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
function constantDriver(
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
function curveLeaf(
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
        if (frequency !== 0) reader.report("unreadFrequency", node.classHash, path);
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

function port(name: string, kind: DriverKind): DriverPort {
  return { field: name, kind, list: false };
}

/** The `params` list of an n-ary class. */
function params(kind: DriverKind): DriverPort {
  return { field: "params", kind, list: true };
}

/** A value an operator class stores, and the schema default for a file that writes none. */
interface StoredField {
  readonly field: string;
  readonly fallback: readonly number[];
}

function stored(name: string, fallback: readonly number[]): StoredField {
  return { field: name, fallback };
}

/** An operator class of D1, marked `inferred` until section 5 confirms its operation. */
function operatorClass(
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

/** The unnamed field an extension class appends to its input. */
const EXTENSION = "0xb1ea6248";

/** `entry` with its class marked as outputting a colour. */
function colored([hash, entry]: [string, DriverClass]): [string, DriverClass] {
  return [hash, { ...entry, color: true }];
}

/*
 * Defaults are the meta schema's at 16.19. `VfxColorConstantDriver`'s `Color` is
 * `[0, 0, 0, 1]`, and a curve leaf's value field defaults to a constant of ones except
 * `0x1d04cfa7`'s and `0x44852d75`'s, which default to zeros.
 */
const REGISTRY: ReadonlyMap<string, DriverClass> = new Map([
  property("VfxFloatDynamicProperty", "float", "Float"),
  property("VfxVector2DynamicProperty", "vec2", "Vector2"),
  property("VfxVector3DynamicProperty", "vec3", "Vector3"),
  property("VfxVector4DynamicProperty", "vec4", "Vector4"),

  constantDriver("VfxFloatConstantDriver", "float", "Float", [0]),
  constantDriver("VfxVector2ConstantDriver", "vec2", "Vector2", [0, 0]),
  constantDriver("VfxVector3ConstantDriver", "vec3", "Vector3", [0, 0, 0]),
  constantDriver("VfxColorConstantDriver", "vec4", "Color", [0, 0, 0, 1]),
  constantDriver("VfxColorRgbConstantDriver", "vec3", "Color", [0, 0, 0]),

  curveLeaf("0x1d04cfa7", "float", "Float", constant([0])),
  curveLeaf("0x3eb74cbe", "vec2", "Vector2", constant([1, 1])),
  curveLeaf("0x2d42ea41", "vec3", "Vector3", constant([1, 1, 1])),
  curveLeaf("0x44852d75", "vec3", "colors", constant([0, 0, 0])),
  curveLeaf("0x7cc5a312", "vec4", "colors", constant([1, 1, 1, 1])),

  operatorClass("VfxAddFloatDriver", "add", "float", [params("float")]),
  operatorClass("VfxAddVector2Driver", "add", "vec2", [params("vec2")]),
  operatorClass("VfxAddVector3Driver", "add", "vec3", [params("vec3")]),
  operatorClass("VfxAddVector4Driver", "add", "vec4", [params("vec4")]),
  operatorClass("VfxMultiplyFloatDriver", "multiply", "float", [params("float")]),
  operatorClass("VfxMultiplyVector2Driver", "multiply", "vec2", [params("vec2")]),
  operatorClass("VfxMultiplyVector3Driver", "multiply", "vec3", [params("vec3")]),
  operatorClass("VfxMultiplyVector4Driver", "multiply", "vec4", [params("vec4")]),
  operatorClass("VfxMinFloatDriver", "min", "float", [params("float")]),
  operatorClass("VfxMinVector2Driver", "min", "vec2", [params("vec2")]),
  operatorClass("VfxMinVector3Driver", "min", "vec3", [params("vec3")]),
  operatorClass("VfxMinVector4Driver", "min", "vec4", [params("vec4")]),
  operatorClass("VfxMaxFloatDriver", "max", "float", [params("float")]),
  operatorClass("VfxMaxVector2Driver", "max", "vec2", [params("vec2")]),
  operatorClass("VfxMaxVector3Driver", "max", "vec3", [params("vec3")]),
  operatorClass("VfxMaxVector4Driver", "max", "vec4", [params("vec4")]),

  operatorClass("VfxAbsFloatDriver", "abs", "float", [port("Param", "float")]),
  operatorClass("VfxAbsVector2Driver", "abs", "vec2", [port("Param", "vec2")]),
  operatorClass("VfxAbsVector3Driver", "abs", "vec3", [port("Param", "vec3")]),
  operatorClass("VfxAbsVector4Driver", "abs", "vec4", [port("Param", "vec4")]),
  operatorClass("VfxNormalizeVector2Driver", "normalize", "vec2", [port("Vector2Input", "vec2")]),
  operatorClass("VfxNormalizeVector3Driver", "normalize", "vec3", [port("Vector3Input", "vec3")]),
  operatorClass("VfxLengthVector2Driver", "length", "float", [port("Vector2Input", "vec2")]),
  operatorClass("VfxLengthVector3Driver", "length", "float", [port("Vector3Input", "vec3")]),

  operatorClass(
    "VfxClampFloatDriver",
    "clamp",
    "float",
    [port("Param", "float")],
    [stored("Low", [0]), stored("High", [1])],
  ),
  operatorClass(
    "VfxClampVector2Driver",
    "clamp",
    "vec2",
    [port("Param", "vec2")],
    [stored("Low", [0, 0]), stored("High", [1, 1])],
  ),
  operatorClass(
    "VfxClampVector3Driver",
    "clamp",
    "vec3",
    [port("Param", "vec3")],
    [stored("Low", [0, 0, 0]), stored("High", [1, 1, 1])],
  ),
  operatorClass(
    "VfxClampVector4Driver",
    "clamp",
    "vec4",
    [port("Param", "vec4")],
    [stored("Low", [0, 0, 0, 0]), stored("High", [1, 1, 1, 1])],
  ),

  operatorClass("VfxFloatLerpDriver", "lerp", "float", [
    port("From", "float"),
    port("To", "float"),
    port("Factor", "float"),
  ]),
  operatorClass("VfxVector2LerpDriver", "lerp", "vec2", [
    port("From", "vec2"),
    port("To", "vec2"),
    port("Factor", "float"),
  ]),
  operatorClass("VfxVector3LerpDriver", "lerp", "vec3", [
    port("From", "vec3"),
    port("To", "vec3"),
    port("Factor", "float"),
  ]),
  operatorClass("VfxVector4LerpDriver", "lerp", "vec4", [
    port("From", "vec4"),
    port("To", "vec4"),
    port("Factor", "float"),
  ]),

  operatorClass("VfxScaleVector2Driver", "scale", "vec2", [
    port("Vector2", "vec2"),
    port("ScaleFactor", "float"),
  ]),
  operatorClass("VfxScaleVector3Driver", "scale", "vec3", [
    port("Vector3", "vec3"),
    port("ScaleFactor", "float"),
  ]),

  operatorClass("0xd6738324", "divide", "float", [
    port("value", "float"),
    port("Divisor", "float"),
  ]),
  operatorClass("0x168d2f0d", "divide", "vec2", [
    port("Vector2", "vec2"),
    port("Divisor", "float"),
  ]),
  operatorClass("0x95182f0a", "divide", "vec3", [
    port("Vector3", "vec3"),
    port("Divisor", "float"),
  ]),
  operatorClass("0xff2348d3", "divide", "vec4", [
    port("Vector4", "vec4"),
    port("Divisor", "float"),
  ]),
  operatorClass("0x997d54ab", "divide", "vec2", [port("Vector2", "vec2"), port("Divisor", "vec2")]),
  operatorClass("0x64707da8", "divide", "vec3", [port("Vector3", "vec3"), port("Divisor", "vec3")]),
  operatorClass("0xa995ecc5", "divide", "vec4", [port("Vector4", "vec4"), port("Divisor", "vec4")]),

  operatorClass("0x399295b9", "compose", "vec2", [port("X", "float"), port("Y", "float")]),
  operatorClass("0x65e1b9a2", "compose", "vec3", [
    port("X", "float"),
    port("Y", "float"),
    port("Z", "float"),
  ]),
  operatorClass("0x3624c20b", "compose", "vec4", [
    port("X", "float"),
    port("Y", "float"),
    port("Z", "float"),
    port("W", "float"),
  ]),
  operatorClass("0x791d4f88", "compose", "vec4", [port("xy", "vec2"), port("Zw", "vec2")]),
  colored(
    operatorClass("VfxColorRgbaDriver", "compose", "vec4", [
      port("Rgb", "vec3"),
      port("Alpha", "float"),
    ]),
  ),

  operatorClass("0x9a2d73f2", "broadcast", "vec2", [port("Float", "float")]),
  operatorClass("0xdef9bfd5", "broadcast", "vec3", [port("Float", "float")]),
  operatorClass("0x7c387678", "broadcast", "vec4", [port("Float", "float")]),

  operatorClass("0xe3a77546", "extend", "vec3", [port("Input", "vec2")], [stored(EXTENSION, [0])]),
  operatorClass("0x9c5c4342", "extend", "vec4", [port("Input", "vec3")], [stored(EXTENSION, [0])]),
  operatorClass(
    "0x14daebe5",
    "extend",
    "vec4",
    [port("Input", "vec2")],
    [stored(EXTENSION, [0, 0])],
  ),
]);

/** The class with `classHash`, and undefined for one the evaluator has no reading for. */
export function driverClass(classHash: string): DriverClass | undefined {
  return REGISTRY.get(classHash);
}

/** The four `Vfx*DynamicProperty` wrappers a component field holds a graph through. */
const GRAPH_ROOTS: ReadonlySet<string> = new Set(
  [
    "VfxFloatDynamicProperty",
    "VfxVector2DynamicProperty",
    "VfxVector3DynamicProperty",
    "VfxVector4DynamicProperty",
  ].map(nameHash),
);

/** The kind a wrapper of `classHash` holds, and null for a class that is no wrapper. */
export function graphRootKind(classHash: string): DriverKind | null {
  if (!GRAPH_ROOTS.has(classHash)) return null;
  return REGISTRY.get(classHash)?.kind ?? null;
}

/** Every class the evaluator reads, by class hash. */
export function driverClasses(): ReadonlyMap<string, DriverClass> {
  return REGISTRY;
}
