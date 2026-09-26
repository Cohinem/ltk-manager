import type { VfxValue } from "@/lib/tauri";

import type { ValueCurve } from "../model/model";

/**
 * What a driver outputs: one of the four `IVfx*Driver` interfaces.
 *
 * A colour is a `vec4` or, for the RGB classes, a `vec3`.
 */
export type DriverKind = "float" | "vec2" | "vec3" | "vec4";

/** The components each kind writes, one float each. */
export const KIND_WIDTH: Readonly<Record<DriverKind, number>> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
};

/**
 * How far a node's value can change, lowest first.
 *
 * `constant` holds for the life of the definition, `emitter` is one value per update
 * for every particle, and `particle` is one value per particle.
 */
export type Variability = "constant" | "emitter" | "particle";

/** Where the consumer evaluates a graph: once per emitter update, or once per particle. */
export type DriverScope = "emitter" | "particle";

/**
 * How far an implementation is trusted, per decision 2.4 of docs/plans/shimmer-driver-graph.md.
 *
 * `attested` is read from the binary or fixed by the node's shape, `inferred` is a stated
 * reading section 5 has not confirmed, and `unsupported` evaluates to the kind's zero.
 */
export type SupportLevel = "attested" | "inferred" | "unsupported";

interface NodeBase {
  readonly kind: DriverKind;
  /** The property path from the graph's consumer down to this node. */
  readonly path: string;
}

/** A `Vfx*DynamicProperty`: the wrapper a component field holds its driver through. */
export interface PropertyNode extends NodeBase {
  readonly type: "property";
  readonly classHash: string;
  readonly driver: DriverNode;
}

/** A `Vfx*ConstantDriver`, its value one number per component of its kind. */
export interface ConstantNode extends NodeBase {
  readonly type: "constant";
  readonly classHash: string;
  readonly value: readonly number[];
}

/** A curve leaf: a legacy value class sampled at the normalized time of the scope. */
export interface CurveNode extends NodeBase {
  readonly type: "curve";
  readonly classHash: string;
  readonly curve: ValueCurve;
  /** `frequency`. Only `0`, the schema default, has a reading. */
  readonly frequency: number;
  readonly looping: boolean;
  /** `ShareRandom`, which only the vector classes write. */
  readonly shareRandom: boolean;
}

/**
 * The operation an operator class applies to its inputs, per section 3 of
 * docs/plans/shimmer-driver-graph.md.
 *
 * `compose` and `extend` both concatenate: `compose` its inputs, `extend` its input and the
 * part it stores.
 */
export type Operator =
  | "add"
  | "multiply"
  | "min"
  | "max"
  | "abs"
  | "normalize"
  | "length"
  | "clamp"
  | "lerp"
  | "scale"
  | "divide"
  | "compose"
  | "broadcast"
  | "extend";

/** One input of an operator node: the field that holds it, `params[n]` for a list entry. */
export interface OperatorInput {
  readonly field: string;
  readonly node: DriverNode;
}

/** A value an operator class stores in itself rather than reads from a child driver. */
export interface StoredValue {
  readonly field: string;
  readonly value: readonly number[];
}

/** A math class of D1: a sum, a clamp, a lerp, a composed vector and the like. */
export interface OperatorNode extends NodeBase {
  readonly type: "operator";
  readonly classHash: string;
  readonly operator: Operator;
  /** The child drivers, in the order the operation takes them. */
  readonly inputs: readonly OperatorInput[];
  /** A clamp's `Low` and `High`, or the part an extension appends. */
  readonly stored: readonly StoredValue[];
}

/** A driver of a class the registry has no reading for, kept whole for the editor to draw. */
export interface UnknownNode extends NodeBase {
  readonly type: "unknown";
  readonly classHash: string | null;
  readonly value: VfxValue;
}

/** A driver pointer holding nothing. */
export interface EmptyNode extends NodeBase {
  readonly type: "empty";
}

/** One node of a driver graph, as `readDriver` types it. */
export type DriverNode =
  | PropertyNode
  | ConstantNode
  | CurveNode
  | OperatorNode
  | UnknownNode
  | EmptyNode;
