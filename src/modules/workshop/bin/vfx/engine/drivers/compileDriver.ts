import type { ValueCurve } from "../model/model";
import { sampleCurveInto } from "../utils/sampleCurve";
import type { DriverContext } from "./context";
import {
  type DriverKind,
  type DriverNode,
  type DriverScope,
  KIND_WIDTH,
  type OperatorNode,
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
  readonly evaluate: Evaluate;
}

/** How the consumer evaluates the graph. */
export interface CompileOptions {
  readonly scope: DriverScope;
}

/**
 * The graph at `node` as an evaluator, with every constant subgraph folded.
 *
 * A curve leaf samples its curve at the scope's normalized time: the particle's age for
 * `particle`, and the emitter's phase for `emitter`. A `particle` scope evaluated with no
 * particle samples at time 0. An operator whose inputs all fold folds too. Nodes
 * `readDriver` could not read evaluate to the kind's zero.
 */
export function compileDriver(node: DriverNode, options: CompileOptions): CompiledDriver {
  const width = KIND_WIDTH[node.kind];
  return { kind: node.kind, width, ...compileNode(node, width, options.scope) };
}

interface Compiled {
  readonly variability: Variability;
  readonly constant: Float32Array | null;
  readonly evaluate: Evaluate;
}

function compileNode(node: DriverNode, width: number, scope: DriverScope): Compiled {
  switch (node.type) {
    case "property":
      return compileNode(node.driver, width, scope);
    case "constant":
      return folded(Float32Array.from(fit(node.value, width)));
    case "curve":
      return compileCurve(fitCurve(node.curve, width), scope);
    case "operator":
      return compileOperator(node, width, scope);
    case "unknown":
    case "empty":
      return folded(new Float32Array(width));
  }
}

/** A curve fitted to its kind's width. Every key writes that many floats. */
function compileCurve(curve: ValueCurve, scope: DriverScope): Compiled {
  if (curve.keys.length === 0) return folded(Float32Array.from(curve.constant));

  const timeOf =
    scope === "particle"
      ? (context: DriverContext) => context.particle?.age01 ?? 0
      : (context: DriverContext) => context.emitterPhase;
  return {
    variability: scope,
    constant: null,
    evaluate: (context, out, at) => sampleCurveInto(curve, timeOf(context), out, at),
  };
}

/** The variabilities from lowest to highest. */
const VARIABILITY_ORDER: readonly Variability[] = ["constant", "emitter", "particle"];

/** A context for folding, which a graph of constants never reads. */
const FOLD_CONTEXT: DriverContext = { now: 0, emitterAge: 0, emitterPhase: 0, particle: null };

/**
 * An operator over its compiled inputs. Each input evaluates into a buffer of its own,
 * allocated once here, so an evaluation allocates nothing.
 */
function compileOperator(node: OperatorNode, width: number, scope: DriverScope): Compiled {
  const inputs = node.inputs.map(({ node: input }) =>
    compileNode(input, KIND_WIDTH[input.kind], scope),
  );
  const args = node.inputs.map(({ node: input }) => new Float32Array(KIND_WIDTH[input.kind]));
  const apply = operation(
    node.operator,
    width,
    args,
    node.stored.map((each) => each.value),
  );

  const evaluate: Evaluate = (context, out, at) => {
    for (let each = 0; each < inputs.length; each += 1) {
      inputs[each].evaluate(context, args[each], 0);
    }
    apply(out, at);
  };

  const variability = inputs.reduce<Variability>(
    (highest, input) =>
      VARIABILITY_ORDER.indexOf(input.variability) > VARIABILITY_ORDER.indexOf(highest)
        ? input.variability
        : highest,
    "constant",
  );
  if (variability !== "constant") return { variability, constant: null, evaluate };

  const value = new Float32Array(width);
  evaluate(FOLD_CONTEXT, value, 0);
  return folded(value);
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
