import type { CurveKeys, ScaledCurve } from "./model";

/** A span drawn straight from its key to the next. */
export const LINEAR = 0;
/** A span that holds its key's value. */
export const STEPPED = 1;
/** A span drawn as a cubic through its key, two slopes and the next key. */
export const CUBIC = 2;

/**
 * `curve` sampled at `t`, as the game samples a `CurveFloat`.
 *
 * Before the first key it answers the first value, and past the last key the last entry
 * of `values`. Between them it walks the spans with a cursor of its own into `values`,
 * because a cubic span takes four values where the others take two. A span of any other
 * mode moves no cursor and is not evaluated, so a `t` inside one answers the last entry.
 * A curve of no value answers zero.
 */
export function sampleCurve(curve: CurveKeys, t: number): number {
  const { times, values, modes } = curve;
  if (values.length === 0) return 0;
  if (values.length === 1 || times.length === 0 || t <= times[0]) return values[0];

  const last = times.length - 1;
  if (t >= times[last]) return values[values.length - 1];

  let cursor = 0;
  for (let span = 0; span < last; span += 1) {
    const mode = modes.length === 0 ? LINEAR : (modes[span] ?? LINEAR);
    const from = times[span];
    const width = times[span + 1] - from;

    if (t < times[span + 1]) {
      if (cursorAdvance(mode) === 0) break;

      const along = width > 0 ? (t - from) / width : 0;
      return spanValue(values, cursor, mode, along, width);
    }
    cursor += cursorAdvance(mode);
  }

  return values[values.length - 1];
}

/** How many values a span of `mode` moves the cursor past. */
function cursorAdvance(mode: number): number {
  if (mode === CUBIC) return 3;
  return mode === LINEAR || mode === STEPPED ? 1 : 0;
}

function spanValue(
  values: readonly number[],
  cursor: number,
  mode: number,
  along: number,
  width: number,
): number {
  const from = values[cursor] ?? 0;
  if (mode === STEPPED) return from;

  if (mode === CUBIC) {
    const to = values[cursor + 3] ?? from;
    const control1 = from + (width / 3) * (values[cursor + 1] ?? 0);
    const control2 = to - (width / 3) * (values[cursor + 2] ?? 0);
    const rest = 1 - along;

    return (
      rest * rest * rest * from +
      3 * rest * rest * along * control1 +
      3 * rest * along * along * control2 +
      along * along * along * to
    );
  }

  const to = values[cursor + 1] ?? from;
  return from + (to - from) * along;
}

/**
 * A `CurveScaledFloat` at `t` along the tree: its value, times its curve clamped to 0..1
 * where it uses one.
 */
export function scaledValue(scaled: ScaledCurve, t: number): number {
  if (!scaled.useCurve || scaled.curve === null) return scaled.value;
  return scaled.value * clamp01(sampleCurve(scaled.curve, t));
}

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** The compliance a rod's stretch or shear stiffness of 0..1 stands for: 0.1 down to zero. */
export function stretchCompliance(stiffness: number): number {
  return 10 ** -(1 + 9 * clamp01(stiffness)) - 1e-10;
}

/** The compliance a rod's bend or twist stiffness of 0..1 stands for, scaled by its length. */
export function bendCompliance(stiffness: number, restLength: number): number {
  return (10 ** (1 - 8 * clamp01(stiffness)) - 1e-7) * restLength;
}
