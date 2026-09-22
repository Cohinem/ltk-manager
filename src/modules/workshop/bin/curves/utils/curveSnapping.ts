import type { CurveKey } from "../../values/utils/valueRows";

const TARGET_STEPS = 100;
const MIN_DECIMALS = 3;
const MAX_DECIMALS = 6;

/** The increments and display precision for one curve channel. */
export interface CurveStep {
  readonly step: number;
  readonly smallStep: number;
  readonly largeStep: number;
  readonly decimals: number;
}

/** Normalized lifetime keys, kept legible without preventing precise nudges. */
export const CURVE_TIME_STEP: CurveStep = {
  step: 0.01,
  smallStep: 0.001,
  largeStep: 0.1,
  decimals: 3,
};

/** A channel step derived from its authored range on a 1, 2, 5 scale. */
export function curveValueStep(
  keys: readonly CurveKey[],
  channel: number,
  normalized: boolean,
): CurveStep {
  if (normalized) return CURVE_TIME_STEP;

  const values = keys
    .map((key) => key.values[channel])
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const low = values.length === 0 ? 0 : Math.min(...values);
  const high = values.length === 0 ? 0 : Math.max(...values);
  const span = high - low;
  const scale = span > 0 ? span : Math.max(Math.abs(low), Math.abs(high), 1);
  const step = niceStep(scale / TARGET_STEPS);
  const decimals = Math.min(MAX_DECIMALS, Math.max(MIN_DECIMALS, decimalPlaces(step)));

  return {
    step,
    smallStep: step / 10,
    largeStep: step * 10,
    decimals,
  };
}

/** A finite authored number rounded onto a channel's clean increment. */
export function snapCurveValue(value: number, guide: CurveStep): number {
  if (!Number.isFinite(value)) return value;

  const snapped = Math.round(value / guide.step) * guide.step;
  return Number(snapped.toFixed(guide.decimals));
}

function niceStep(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0.01;

  const exponent = Math.floor(Math.log10(target));
  const power = 10 ** exponent;
  const fraction = target / power;
  let multiple: number;
  if (fraction <= 1) {
    multiple = 1;
  } else if (fraction <= 2) {
    multiple = 2;
  } else if (fraction <= 5) {
    multiple = 5;
  } else {
    multiple = 10;
  }

  return Number((multiple * power).toPrecision(12));
}

function decimalPlaces(value: number): number {
  if (value >= 1) return 0;

  return Math.max(0, -Math.floor(Math.log10(value)));
}
