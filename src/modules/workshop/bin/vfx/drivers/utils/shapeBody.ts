import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Matrix4,
  SphereGeometry,
  Vector3,
} from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import type { SpawnShape, ValueCurve } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import { birth, sampleShape } from "../../engine/simulation/spawnShape";
import { Rng } from "../../engine/utils/Rng";
import { drawCurve } from "../../engine/utils/sampleCurve";
import { SEGMENTS, shapeInto, surfaceBoxFaces } from "../../rendering/utils/emitterShape";
import type { SpawnCloud } from "./spawnCloud";

/** A spawn shape drawn as a body in its own space: faint faces, and the edges over them. */
export interface ShapeBody {
  /** Null for a legacy shape whose offset spans no box before its emit rotations. */
  readonly faces: BufferGeometry | null;
  readonly edges: BufferGeometry;
  /** A legacy shape's secondary sweep rings, drawn fainter than `edges`. */
  readonly sweep: BufferGeometry | null;
  /** A legacy shape's emit rotation axes, each as a line through the emitter. */
  readonly turns: BufferGeometry | null;
}

type Triple = readonly [number, number, number];

/** The thickness a flat side is given, so a face of no depth still draws. */
const FLAT = 1e-3;

/** How many sides a round body is cut into. */
const ROUND = 40;

/**
 * The body a shape spawns on or in, in the shape's own space, and null for a shape that spawns
 * at one place. A box, a sphere or a cylinder draws the volume it fills or the surface it spawns
 * on. A legacy shape draws the volume its offset's box sweeps through its emit rotations.
 */
export function shapeBody(
  shape: SpawnShape,
  cloud: Pick<SpawnCloud, "localLow" | "localHigh">,
): ShapeBody | null {
  switch (shape.kind) {
    case "point":
      return null;

    case "box": {
      if (!shape.volume) {
        const faces: number[] = [];
        for (const [a, b, c, d] of surfaceBoxFaces(shape.size)) quadInto(faces, a!, b!, c!, d!);
        return { faces: positionsOf(faces), edges: outlineOf(shape), sweep: null, turns: null };
      }

      const [x, y, z] = shape.size.map((half) => Math.max(half * 2, FLAT));
      return boxBody(new BoxGeometry(x, y, z));
    }

    case "sphere": {
      if (shape.radius <= 0) return null;
      const faces = new SphereGeometry(shape.radius, ROUND, ROUND / 2);
      return { faces, edges: outlineOf(shape), sweep: null, turns: null };
    }

    case "cylinder": {
      if (shape.radius <= 0) return null;
      const height = Math.max(shape.height, FLAT);
      const open = !shape.volume;
      const faces = new CylinderGeometry(shape.radius, shape.radius, height, ROUND, 1, open);
      faces.translate(0, height / 2, 0);
      return { faces, edges: outlineOf(shape), sweep: null, turns: null };
    }

    case "legacy":
      return legacyBody(shape, cloud.localLow, cloud.localHigh);
  }
}

function boxBody(faces: BoxGeometry): ShapeBody {
  return { faces, edges: new EdgesGeometry(faces), sweep: null, turns: null };
}

type LegacyShape = Extract<SpawnShape, { kind: "legacy" }>;

/** How many fixed angles each other turn is held at while one turn sweeps. */
const SWEEP_RINGS = 6;

/** An axis line's half length, as a share of the sweep's radius. */
const AXIS_REACH = 1.25;

/**
 * A legacy shape's body: the box its offset spans, placed at each emit rotation's least angle,
 * and the volume the box sweeps through the rotations, with each turn's axis as a line. Null
 * where the shape spawns at one place.
 */
function legacyBody(shape: LegacyShape, low: Triple, high: Triple): ShapeBody | null {
  const size = [0, 1, 2].map((axis) => high[axis]! - low[axis]!);
  const boxed = size.some((extent) => extent >= FLAT);
  const corners = cornersOf(low, high);
  const swept = sweepOf(shape, corners);
  if (!boxed && !swept.sweeps) return null;

  const reach =
    Math.max(...corners.map((corner) => Math.hypot(...corner)), ...size, 1) * AXIS_REACH;
  return {
    faces: boxed ? positionsOf(swept.faces) : null,
    edges: positionsOf(swept.main),
    sweep: swept.rest.length === 0 ? null : positionsOf(swept.rest),
    turns: axesOf(shape, reach),
  };
}

/** A swept box: its triangles, its main lines, the fainter rings and whether any turn sweeps. */
interface Sweep {
  readonly faces: number[];
  readonly main: number[];
  readonly rest: number[];
  sweeps: boolean;
}

/** The eight corners of the box from `low` to `high`, bit 0 picking `x`, bit 1 `y`, bit 2 `z`. */
function cornersOf(low: Triple, high: Triple): Triple[] {
  return Array.from({ length: 8 }, (_, at) => [
    at & 1 ? high[0] : low[0],
    at & 2 ? high[1] : low[1],
    at & 4 ? high[2] : low[2],
  ]);
}

/** The twelve edges of a box, as pairs of `cornersOf` indices. */
const BOX_EDGES = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((at) =>
  [1, 2, 4].filter((bit) => (at & bit) === 0).map((bit) => [at, at | bit] as const),
);

/** The six faces of a box, each as four `cornersOf` indices around it. */
const BOX_FACES = [1, 2, 4].flatMap((bit) => {
  const [u, v] = [1, 2, 4].filter((other) => other !== bit);
  return [0, bit].map((side) => [side, side | u!, side | u! | v!, side | v!] as const);
});

/**
 * The volume `corners` sweep through a legacy shape's emit rotations. The box is drawn at every
 * turn's least angle. Each turn sweeps the least to the most angle its curve draws while every
 * other turn is held at `SWEEP_RINGS` angles across its own span. Each corner traces a ring, and
 * with the other turns at their least angle each box edge sweeps a surface and the box is drawn
 * again at the most angle. Each point is placed by `sampleShape`, so the turns compose in the
 * engine's order.
 */
function sweepOf(shape: LegacyShape, corners: readonly Triple[]): Sweep {
  const count = Math.min(shape.angles.length, shape.axes.length);
  const spans = shape.angles.slice(0, count).map(angleSpan);
  const sweeps = spans.map(
    ([least, most], each) => most - least > 1e-3 && shape.axes[each]!.some((v) => v !== 0),
  );
  /* shortcut: 3+ sweeping turns hold fewer rings each, upgrade to a hull if one ever needs it. */
  const rings = sweeps.filter(Boolean).length > 2 ? 3 : SWEEP_RINGS;
  const held = spans.map(([least, most], each) =>
    sweeps[each] ? ringAngles(least, most, rings) : [least],
  );

  const angles = spans.map(([least]) => ({ constant: [least], keys: [], tables: [] }));
  const offset = { constant: [0, 0, 0], keys: [], tables: [] };
  const posed: LegacyShape = {
    kind: "legacy",
    offset,
    translation: { constant: [0, 0, 0], keys: [], tables: [] },
    angles,
    axes: shape.axes.slice(0, count),
  };
  const rng = new Rng(0);
  const placed = birth();
  const at = (degrees: readonly number[]): number[][] => {
    degrees.forEach((value, each) => (angles[each]!.constant[0] = value));
    return corners.map((corner) => {
      offset.constant = [...corner];
      sampleShape(posed, rng, 0, null, placed);
      return Array.from(placed.offset);
    });
  };

  const swept: Sweep = { faces: [], main: [], rest: [], sweeps: sweeps.some(Boolean) };
  boxInto(at(spans.map(([least]) => least)), swept);
  for (let each = 0; each < count; each += 1) {
    if (!sweeps[each]) continue;

    const [least, most] = spans[each]!;
    const others = held.map((values, other) => (other === each ? [least] : values));
    product(others).forEach((pose, ring) => {
      const steps = Array.from({ length: ROUND + 1 }, (_, step) => {
        pose[each] = least + ((most - least) * step) / ROUND;
        return at(pose);
      });
      const lines = ring === 0 ? swept.main : swept.rest;
      for (let step = 0; step < ROUND; step += 1) {
        for (let corner = 0; corner < 8; corner += 1) {
          lines.push(...steps[step]![corner]!, ...steps[step + 1]![corner]!);
        }
      }
      if (ring !== 0) return;

      for (let step = 0; step < ROUND; step += 1) {
        for (const [a, b] of BOX_EDGES) {
          const [now, next] = [steps[step]!, steps[step + 1]!];
          quadInto(swept.faces, now[a]!, now[b]!, next[b]!, next[a]!);
        }
      }
      if (most - least < 360 - 1e-3) boxInto(steps[ROUND]!, swept);
    });
  }
  return swept;
}

/** The box on `corners` as twelve edges into `swept.main` and six faces into `swept.faces`. */
function boxInto(corners: readonly number[][], swept: Sweep): void {
  for (const [a, b] of BOX_EDGES) swept.main.push(...corners[a]!, ...corners[b]!);
  for (const [a, b, c, d] of BOX_FACES) {
    quadInto(swept.faces, corners[a]!, corners[b]!, corners[c]!, corners[d]!);
  }
}

/** The quad `a`, `b`, `c`, `d` as two triangles into `out`. */
function quadInto(
  out: number[],
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
): void {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

/** `rings` angles across the least to the most, the most left out of a full turn. */
function ringAngles(least: number, most: number, rings: number): number[] {
  const closed = most - least >= 360 - 1e-3;
  const steps = closed ? rings : rings - 1;
  return Array.from({ length: rings }, (_, at) => least + ((most - least) * at) / steps);
}

/** Every pick of one value from each of `lists`. */
function product(lists: readonly number[][]): number[][] {
  return lists.reduce<number[][]>(
    (picks, list) => picks.flatMap((pick) => list.map((value) => [...pick, value])),
    [[]],
  );
}

/** Each emit rotation's axis as a line through the emitter, `reach` either way. Null for none. */
function axesOf(shape: LegacyShape, reach: number): BufferGeometry | null {
  const points: number[] = [];
  const count = Math.min(shape.angles.length, shape.axes.length);
  for (let each = 0; each < count; each += 1) {
    const axis = new Vector3(...shape.axes[each]!);
    if (axis.lengthSq() === 0) continue;

    axis.normalize().multiplyScalar(reach);
    points.push(...axis.clone().negate().toArray(), ...axis.toArray());
  }
  return points.length === 0 ? null : positionsOf(points);
}

function positionsOf(points: readonly number[]): BufferGeometry {
  const lines = new BufferGeometry();
  lines.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return lines;
}

/** The least and the most degrees `curve` draws across the life and the chance. */
function angleSpan(curve: ValueCurve): [number, number] {
  const drawn = [0, 0.25, 0.5, 0.75, 1].flatMap((t01) =>
    [0, 1].map((chance) => drawCurve(curve, t01, chance)[0] ?? 0),
  );
  return [Math.min(...drawn), Math.max(...drawn)];
}

/** A shape's outline, as the viewport's gizmo draws it. */
function outlineOf(shape: SpawnShape): BufferGeometry {
  const positions = new Float32Array(SEGMENTS * 6);
  const vertices = shapeInto(positions, 0, shape, [0, 0, 0], 0);
  const edges = new BufferGeometry();
  edges.setAttribute("position", new BufferAttribute(positions.slice(0, vertices * 3), 3));
  return edges;
}

/**
 * The matrix placing a body where a birth lands: moved by `offset`, turned by the spawn
 * `frame`, stood off `origin` and mirrored into the viewport, in `placeInto`'s order.
 */
export function bodyMatrixInto(
  frame: Float32Array,
  origin: Point,
  offset: Point,
  out: Matrix4,
): Matrix4 {
  TURN.set(
    frame[0],
    frame[1],
    frame[2],
    0,
    frame[3],
    frame[4],
    frame[5],
    0,
    frame[6],
    frame[7],
    frame[8],
    0,
    0,
    0,
    0,
    1,
  );
  MIRROR.makeScale(AXIS_SIGN[0], AXIS_SIGN[1], AXIS_SIGN[2]);
  return out
    .copy(MIRROR)
    .multiply(STEP.makeTranslation(origin[0], origin[1], origin[2]))
    .multiply(TURN)
    .multiply(STEP.makeTranslation(offset[0], offset[1], offset[2]));
}

const TURN = new Matrix4();
const MIRROR = new Matrix4();
const STEP = new Matrix4();
