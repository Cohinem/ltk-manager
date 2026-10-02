import { nameHash } from "../../../shared/utils/binHash";
import { constant } from "../parsing/readValue";
import {
  colored,
  constantDriver,
  curveLeaf,
  type DriverClass,
  EASING_CLASS,
  EXTENSION,
  operatorClass,
  params,
  port,
  property,
  randomClass,
  stored,
} from "./classReaders";
import type { DriverKind } from "./node";

export { type DriverClass, type DriverPort, type DriverReader } from "./classReaders";

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
  colored(constantDriver("VfxColorConstantDriver", "vec4", "Color", [0, 0, 0, 1])),
  colored(constantDriver("VfxColorRgbConstantDriver", "vec3", "Color", [0, 0, 0])),

  curveLeaf("0x1d04cfa7", "float", "Float", constant([0])),
  curveLeaf("0x3eb74cbe", "vec2", "Vector2", constant([1, 1])),
  curveLeaf("0x2d42ea41", "vec3", "Vector3", constant([1, 1, 1])),
  colored(curveLeaf("0x44852d75", "vec3", "colors", constant([0, 0, 0]))),
  colored(curveLeaf("0x7cc5a312", "vec4", "colors", constant([1, 1, 1, 1]))),

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

  operatorClass(
    "VfxFloatSineDriver",
    "sine",
    "float",
    [port("Time", "float"), port("period", "float")],
    [stored("Remap", [0, 1])],
  ),
  EASING_CLASS,
  randomClass("0x414d1503", "Range"),
  randomClass("0xc5e53afa", "Range"),
]);

/** The class with `classHash`, and undefined for one the evaluator has no reading for. */
export function driverClass(classHash: string): DriverClass | undefined {
  return REGISTRY.get(classHash);
}

/** Whether the class with `classHash` drives a colour. */
export function isColorDriver(classHash: string): boolean {
  return REGISTRY.get(classHash)?.color ?? false;
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
