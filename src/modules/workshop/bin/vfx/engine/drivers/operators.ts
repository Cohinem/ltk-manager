import type { Operator } from "./node";

/** An operation's result written into `out` from `at`, read from the buffers of its inputs. */
export type Apply = (out: Float32Array, at: number) => void;

/**
 * The operation `operator` writing `width` floats, over `args`, the buffers its inputs
 * evaluate into, and `stored`, the values its class stores.
 *
 * Every edge case section 5.3 of docs/plans/shimmer-driver-graph.md has not answered writes
 * the kind's zero: an empty `params` list, a clamp whose bounds cross, and a zero vector to
 * normalize. A zero divisor writes zero for the components it divides.
 */
export function operation(
  operator: Operator,
  width: number,
  args: readonly Float32Array[],
  stored: readonly (readonly number[])[],
): Apply {
  const [first, second, third] = args;

  switch (operator) {
    case "add":
      return fold(args, width, (sum, value) => sum + value);
    case "multiply":
      return fold(args, width, (product, value) => product * value);
    case "min":
      return fold(args, width, Math.min);
    case "max":
      return fold(args, width, Math.max);
    case "abs":
      return (out, at) => {
        for (let c = 0; c < width; c += 1) out[at + c] = Math.abs(first[c]);
      };
    case "normalize":
      return (out, at) => {
        const length = lengthOf(first);
        for (let c = 0; c < width; c += 1) out[at + c] = length === 0 ? 0 : first[c] / length;
      };
    case "length":
      return (out, at) => {
        out[at] = lengthOf(first);
      };
    case "clamp":
      return clamp(first, width, fit(stored[0], width), fit(stored[1], width));
    case "lerp":
      return (out, at) => {
        const factor = third[0];
        for (let c = 0; c < width; c += 1) out[at + c] = first[c] + (second[c] - first[c]) * factor;
      };
    case "scale":
      return (out, at) => {
        for (let c = 0; c < width; c += 1) out[at + c] = first[c] * second[0];
      };
    case "divide":
      return (out, at) => {
        const each = second.length > 1;
        for (let c = 0; c < width; c += 1) {
          const divisor = each ? second[c] : second[0];
          out[at + c] = divisor === 0 ? 0 : first[c] / divisor;
        }
      };
    case "broadcast":
      return (out, at) => {
        out.fill(first[0], at, at + width);
      };
    case "compose":
    case "extend":
      return concat([...args, ...stored.map((value) => Float32Array.from(value))], width);
  }
}

/** A component-wise reduction over `args`, and zero over none. */
function fold(
  args: readonly Float32Array[],
  width: number,
  step: (held: number, value: number) => number,
): Apply {
  if (args.length === 0) return zero(width);

  return (out, at) => {
    for (let c = 0; c < width; c += 1) {
      let held = args[0][c];
      for (let each = 1; each < args.length; each += 1) held = step(held, args[each][c]);
      out[at + c] = held;
    }
  };
}

function clamp(
  param: Float32Array,
  width: number,
  low: readonly number[],
  high: readonly number[],
): Apply {
  if (low.some((bound, c) => bound > high[c])) return zero(width);

  return (out, at) => {
    for (let c = 0; c < width; c += 1) out[at + c] = Math.min(Math.max(param[c], low[c]), high[c]);
  };
}

/** `parts` laid end to end, cut or padded with zeros to `width`. */
function concat(parts: readonly Float32Array[], width: number): Apply {
  return (out, at) => {
    out.fill(0, at, at + width);
    let c = 0;
    for (const part of parts) {
      for (let each = 0; each < part.length && c < width; each += 1, c += 1) {
        out[at + c] = part[each];
      }
    }
  };
}

function zero(width: number): Apply {
  return (out, at) => {
    out.fill(0, at, at + width);
  };
}

function lengthOf(vector: Float32Array): number {
  let sum = 0;
  for (const component of vector) sum += component * component;
  return Math.sqrt(sum);
}

/** `values` cut or padded with zeros to `width`. */
export function fit(values: readonly number[] | undefined, width: number): number[] {
  const held = values ?? [];
  const out = new Array<number>(width).fill(0);
  for (let c = 0; c < Math.min(width, held.length); c += 1) out[c] = held[c];
  return out;
}
