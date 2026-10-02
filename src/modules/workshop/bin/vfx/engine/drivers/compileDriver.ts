import type { ValueCurve } from "../model/model";
import { sampleCurveInto } from "../utils/sampleCurve";
import type { DriverContext, RandomSlots } from "./context";
import { easing } from "./easing";
import {
  type DriverKind,
  type DriverNode,
  type DriverScope,
  type EasingNode,
  frequencyScope,
  KIND_WIDTH,
  type OperatorInput,
  type OperatorNode,
  type RandomNode,
  type Variability,
} from "./node";
import { fit, operation } from "./operators";

/** A graph's value written into `out` from `at`, one float per component of its kind. */
export type Evaluate = (context: DriverContext, out: Float32Array, at: number) => void;

/** A graph ready to evaluate. */
export interface CompiledDriver {
  readonly kind: DriverKind;
  /** The floats one evaluation writes. */
  readonly width: number;
  readonly variability: Variability;
  /** The value of a `constant` graph, folded at compile time, and null for any other. */
  readonly constant: Float32Array | null;
  /** The random slots the graph reads from each block of its context. */
  readonly randomSlots: RandomSlots;
  readonly evaluate: Evaluate;
}

/** How the consumer evaluates the graph. */
export interface CompileOptions {
  readonly scope: DriverScope;
}

/**
 * The graph at `node` as an evaluator, with every constant subgraph folded.
 *
 * A curve leaf and an easing driver sample the time their `frequency` names. A random
 * node takes the next slot of the scope's block, in the order the graph is walked, so a
 * recompile of the same shape keeps every slot. An operator whose inputs all fold folds
 * too. Nodes `readDriver` could not read evaluate to the kind's zero.
 */
export function compileDriver(node: DriverNode, options: CompileOptions): CompiledDriver {
  const width = KIND_WIDTH[node.kind];
  const compiler: Compiler = { scope: options.scope, slots: { emitter: 0, particle: 0 } };
  const compiled = compileNode(node, width, compiler);
  return { kind: node.kind, width, ...compiled, randomSlots: { ...compiler.slots } };
}

interface Compiled {
  readonly variability: Variability;
  readonly constant: Float32Array | null;
  readonly evaluate: Evaluate;
}

interface Compiler {
  readonly scope: DriverScope;
  /** The slots taken so far in each block. */
  readonly slots: { emitter: number; particle: number };
}

function compileNode(node: DriverNode, width: number, compiler: Compiler): Compiled {
  switch (node.type) {
    case "property":
      return compileNode(node.driver, width, compiler);
    case "constant":
      return folded(Float32Array.from(fit(node.value, width)));
    case "curve":
      return compileCurve(fitCurve(node.curve, width), frequencyScope(node.frequency));
    case "operator":
      return compileOperator(node, width, compiler);
    case "random":
      return compileRandom(node, compiler);
    case "easing":
      return compileEasing(node, compiler);
    case "unknown":
    case "empty":
      return folded(new Float32Array(width));
  }
}

/** A curve fitted to its kind's width. Every key writes that many floats. */
function compileCurve(curve: ValueCurve, time: DriverScope): Compiled {
  if (curve.keys.length === 0) return folded(Float32Array.from(curve.constant));

  const timeOf =
    time === "particle"
      ? (context: DriverContext) => context.particle?.age01 ?? 0
      : (context: DriverContext) => context.emitterPhase;
  return {
    variability: time,
    constant: null,
    evaluate: (context, out, at) => sampleCurveInto(curve, timeOf(context), out, at),
  };
}

/** The variabilities from lowest to highest. */
const VARIABILITY_ORDER: readonly Variability[] = ["constant", "emitter", "particle"];

function highest(left: Variability, right: Variability): Variability {
  return VARIABILITY_ORDER.indexOf(right) > VARIABILITY_ORDER.indexOf(left) ? right : left;
}

/** A context for folding, which a graph of constants never reads. */
const FOLD_CONTEXT: DriverContext = {
  now: 0,
  emitterAge: 0,
  emitterPhase: 0,
  emitterRandoms: new Float32Array(0),
  particle: null,
};

interface CompiledInputs {
  readonly variability: Variability;
  /** The buffer each input evaluates into, allocated once here. */
  readonly args: readonly Float32Array[];
  /** Evaluate every input into its buffer. */
  readonly fill: (context: DriverContext) => void;
}

function compileInputs(inputs: readonly OperatorInput[], compiler: Compiler): CompiledInputs {
  const compiled = inputs.map(({ node }) => compileNode(node, KIND_WIDTH[node.kind], compiler));
  const args = inputs.map(({ node }) => new Float32Array(KIND_WIDTH[node.kind]));

  return {
    variability: compiled.reduce<Variability>(
      (held, input) => highest(held, input.variability),
      "constant",
    ),
    args,
    fill: (context) => {
      for (let each = 0; each < compiled.length; each += 1) {
        compiled[each].evaluate(context, args[each], 0);
      }
    },
  };
}

/** An operator over its compiled inputs, folded where every input folds. */
function compileOperator(node: OperatorNode, width: number, compiler: Compiler): Compiled {
  const { variability, args, fill } = compileInputs(node.inputs, compiler);
  const apply = operation(
    node.operator,
    width,
    args,
    node.stored.map((each) => each.value),
  );
  const evaluate: Evaluate = (context, out, at) => {
    fill(context);
    apply(out, at);
  };

  if (variability !== "constant") return { variability, constant: null, evaluate };

  const value = new Float32Array(width);
  evaluate(FOLD_CONTEXT, value, 0);
  return folded(value);
}

/**
 * A random node reading the next slot of the scope's block. A block too short for the
 * slot reads a draw of zero.
 */
function compileRandom(node: RandomNode, compiler: Compiler): Compiled {
  const { scope, slots } = compiler;
  const slot = slots[scope];
  slots[scope] += 1;

  const [low, high] = fit(node.range, 2);
  const blockOf =
    scope === "particle"
      ? (context: DriverContext) => context.particle?.randoms ?? null
      : (context: DriverContext) => context.emitterRandoms;

  return {
    variability: scope,
    constant: null,
    evaluate: (context, out, at) => {
      const block = blockOf(context);
      const draw = block !== null && slot < block.length ? block[slot] : 0;
      out[at] = low + (high - low) * draw;
    },
  };
}

/**
 * An easing driver: `Left` to `Right` eased over `duration` seconds of the time its
 * `frequency` names, held at `Right` past the end or wrapped where it loops.
 */
function compileEasing(node: EasingNode, compiler: Compiler): Compiled {
  if (node.duration <= 0) return folded(new Float32Array(1));

  const { variability, args, fill } = compileInputs(node.inputs, compiler);
  const [left, right] = args;
  const ease = easing(node.easingFunction);
  const { duration, looping } = node;
  const time = frequencyScope(node.frequency);
  const secondsOf =
    time === "particle"
      ? (context: DriverContext) => context.particle?.age ?? 0
      : (context: DriverContext) => context.emitterAge;

  return {
    variability: highest(variability, time),
    constant: null,
    evaluate: (context, out, at) => {
      fill(context);
      const share = secondsOf(context) / duration;
      const t = looping ? share - Math.floor(share) : Math.min(Math.max(share, 0), 1);
      out[at] = left[0] + (right[0] - left[0]) * ease(t);
    },
  };
}

function folded(value: Float32Array): Compiled {
  return {
    variability: "constant",
    constant: value,
    evaluate: (_context, out, at) => out.set(value, at),
  };
}

/** `curve` with its constant and every key cut or padded to `width`. */
function fitCurve(curve: ValueCurve, width: number): ValueCurve {
  return {
    constant: fit(curve.constant, width),
    keys: curve.keys.map((key) => ({ time: key.time, values: fit(key.values, width) })),
    tables: curve.tables,
  };
}
