/** An easing: a time from 0 to 1 mapped to a share of the way from start to end. */
type Ease = (t: number) => number;

const power = (exponent: number): [Ease, Ease, Ease] => [
  (t) => t ** exponent,
  (t) => 1 - (1 - t) ** exponent,
  (t) => (t < 0.5 ? 2 ** (exponent - 1) * t ** exponent : 1 - (2 - 2 * t) ** exponent / 2),
];

const BACK = 1.70158;
const BACK_IN_OUT = BACK * 1.525;
const ELASTIC = (2 * Math.PI) / 3;
const ELASTIC_IN_OUT = (2 * Math.PI) / 4.5;

function bounceOut(t: number): number {
  const scale = 7.5625;
  const span = 2.75;
  if (t < 1 / span) return scale * t * t;
  if (t < 2 / span) return scale * (t - 1.5 / span) ** 2 + 0.75;
  if (t < 2.5 / span) return scale * (t - 2.25 / span) ** 2 + 0.9375;
  return scale * (t - 2.625 / span) ** 2 + 0.984375;
}

const [quadIn, quadOut, quadInOut] = power(2);
const [cubicIn, cubicOut, cubicInOut] = power(3);
const [quartIn, quartOut, quartInOut] = power(4);
const [quintIn, quintOut, quintInOut] = power(5);

/**
 * The easings of the engine's `EasingType` enum, indexed by its value.
 *
 * The member names come from the league_structs enum dump, and the curves are the standard
 * Penner forms from easings.net. `kSnap` is read as a jump to the end at `t = 1`. Neither
 * the link from `EasingFunction` to `EasingType` nor any curve is confirmed from the binary.
 */
const EASINGS: readonly (readonly [string, Ease])[] = [
  ["Linear", (t) => t],
  ["Snap", (t) => (t < 1 ? 0 : 1)],
  ["SmoothStep", (t) => t * t * (3 - 2 * t)],
  ["SmootherStep", (t) => t * t * t * (t * (6 * t - 15) + 10)],
  ["QuadraticEaseIn", quadIn],
  ["QuadraticEaseOut", quadOut],
  ["QuadraticEaseInOut", quadInOut],
  ["CubicEaseIn", cubicIn],
  ["CubicEaseOut", cubicOut],
  ["CubicEaseInOut", cubicInOut],
  ["QuarticEaseIn", quartIn],
  ["QuarticEaseOut", quartOut],
  ["QuarticEaseInOut", quartInOut],
  ["QuinticEaseIn", quintIn],
  ["QuinticEaseOut", quintOut],
  ["QuinticEaseInOut", quintInOut],
  ["SineEaseIn", (t) => 1 - Math.cos((t * Math.PI) / 2)],
  ["SineEaseOut", (t) => Math.sin((t * Math.PI) / 2)],
  ["SineEaseInOut", (t) => -(Math.cos(Math.PI * t) - 1) / 2],
  ["CircularEaseIn", (t) => 1 - Math.sqrt(1 - t * t)],
  ["CircularEaseOut", (t) => Math.sqrt(1 - (t - 1) ** 2)],
  [
    "CircularEaseInOut",
    (t) =>
      t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (2 - 2 * t) ** 2) + 1) / 2,
  ],
  ["ExponentialEaseIn", (t) => (t === 0 ? 0 : 2 ** (10 * t - 10))],
  ["ExponentialEaseOut", (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t))],
  [
    "ExponentialEaseInOut",
    (t) => {
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (10 - 20 * t)) / 2;
    },
  ],
  [
    "ElasticEaseIn",
    (t) => {
      if (t === 0 || t === 1) return t;
      return -(2 ** (10 * t - 10)) * Math.sin((10 * t - 10.75) * ELASTIC);
    },
  ],
  [
    "ElasticEaseOut",
    (t) => {
      if (t === 0 || t === 1) return t;
      return 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * ELASTIC) + 1;
    },
  ],
  [
    "ElasticEaseInOut",
    (t) => {
      if (t === 0 || t === 1) return t;
      const wave = Math.sin((20 * t - 11.125) * ELASTIC_IN_OUT);
      return t < 0.5 ? -(2 ** (20 * t - 10) * wave) / 2 : (2 ** (10 - 20 * t) * wave) / 2 + 1;
    },
  ],
  ["BackEaseIn", (t) => (BACK + 1) * t ** 3 - BACK * t * t],
  ["BackEaseOut", (t) => 1 + (BACK + 1) * (t - 1) ** 3 + BACK * (t - 1) ** 2],
  [
    "BackEaseInOut",
    (t) =>
      t < 0.5
        ? ((2 * t) ** 2 * ((BACK_IN_OUT + 1) * 2 * t - BACK_IN_OUT)) / 2
        : ((2 * t - 2) ** 2 * ((BACK_IN_OUT + 1) * (2 * t - 2) + BACK_IN_OUT) + 2) / 2,
  ],
  ["BounceEaseIn", (t) => 1 - bounceOut(1 - t)],
  ["BounceEaseOut", bounceOut],
  [
    "BounceEaseInOut",
    (t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
  ],
];

/** The `EasingType` member at `value`, without its `k`, and null past the last member. */
export function easingName(value: number): string | null {
  return EASINGS[value]?.[0] ?? null;
}

/** The easing at `value`, and linear past the last member. */
export function easing(value: number): Ease {
  return EASINGS[value]?.[1] ?? EASINGS[0][1];
}
