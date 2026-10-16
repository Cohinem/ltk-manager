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
import { SEGMENTS, shapeInto } from "../../rendering/utils/emitterShape";
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
 * at one place. A box, a sphere or a cylinder draws itself. A legacy shape draws its offset's box
 * and the surface its emit rotations sweep.
 */
export function shapeBody(
  shape: SpawnShape,
  cloud: Pick<SpawnCloud, "localLow" | "localHigh">,
): ShapeBody | null {
  switch (shape.kind) {
    case "point":
      return null;

    case "box": {
      const [x, y, z] = shape.size.map((half) => Math.max(half * 2, FLAT));
      return boxBody(new BoxGeometry(x, y, z));
    }

    case "sphere": {
      if (shape.radius <= 0) return null;
      const faces = new SphereGeometry(shape.radius, ROUND, ROUND / 2);
      return { faces, edges: ringsOf(shape), sweep: null, turns: null };
    }

    case "cylinder": {
      if (shape.radius <= 0) return null;
      const height = Math.max(shape.height, FLAT);
      const faces = new CylinderGeometry(shape.radius, shape.radius, height, ROUND);
      faces.translate(0, height / 2, 0);
      return { faces, edges: ringsOf(shape), sweep: null, turns: null };
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
 * A legacy shape's body: the box its offset spans before the emit rotations, and the surface the
 * offset's far corner sweeps through them, with each turn's axis as a line. Null where the shape
 * spawns at one place.
 */
function legacyBody(shape: LegacyShape, low: Triple, high: Triple): ShapeBody | null {
  const size = [0, 1, 2].map((axis) => high[axis]! - low[axis]!);
  let faces: BufferGeometry | null = null;
  const lines: number[] = [];
  if (size.some((extent) => extent >= FLAT)) {
    faces = new BoxGeometry(...size.map((extent) => Math.max(extent, FLAT)));
    faces.translate((high[0] + low[0]) / 2, (high[1] + low[1]) / 2, (high[2] + low[2]) / 2);
    lines.push(...new EdgesGeometry(faces).getAttribute("position").array);
  }

  const corner = farCorner(low, high);
  const swept = sweepOf(shape, corner);
  lines.push(...swept.main);
  if (lines.length === 0) return null;

  const reach = Math.max(Math.hypot(...corner), ...size, 1) * AXIS_REACH;
  return {
    faces,
    edges: linesOf(lines),
    sweep: swept.rest.length === 0 ? null : linesOf(swept.rest),
    turns: axesOf(shape, reach),
  };
}

/** A sweep's rings: one per turn with every other turn at its least angle, and the others. */
interface Sweep {
  readonly main: number[];
  readonly rest: number[];
}

/** The corner of the box from `low` to `high` that stands farthest from the emitter. */
function farCorner(low: Triple, high: Triple): Triple {
  let far: Triple = [low[0], low[1], low[2]];
  for (const x of [low[0], high[0]]) {
    for (const y of [low[1], high[1]]) {
      for (const z of [low[2], high[2]]) {
        if (Math.hypot(x, y, z) > Math.hypot(...far)) far = [x, y, z];
      }
    }
  }
  return far;
}

/**
 * The surface `corner` sweeps through a legacy shape's emit rotations, as line segments. Each
 * turn sweeps the least to the most angle its curve draws while every other turn is held at
 * `SWEEP_RINGS` angles across its own span. Each point is placed by `sampleShape`, so the turns
 * compose in the engine's order. Both lists are empty if no turn sweeps an angle.
 */
function sweepOf(shape: LegacyShape, corner: Triple): Sweep {
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
  const posed: LegacyShape = {
    kind: "legacy",
    offset: { constant: corner, keys: [], tables: [] },
    translation: { constant: [0, 0, 0], keys: [], tables: [] },
    angles,
    axes: shape.axes.slice(0, count),
  };
  const rng = new Rng(0);
  const placed = birth();
  const at = (degrees: readonly number[]): number[] => {
    degrees.forEach((value, each) => (angles[each]!.constant[0] = value));
    sampleShape(posed, rng, 0, null, placed);
    return Array.from(placed.offset);
  };

  const swept: Sweep = { main: [], rest: [] };
  for (let each = 0; each < count; each += 1) {
    if (!sweeps[each]) continue;

    const [least, most] = spans[each]!;
    const others = held.map((values, other) => (other === each ? [least] : values));
    product(others).forEach((pose, ring) => {
      const points = ring === 0 ? swept.main : swept.rest;
      for (let step = 0; step < ROUND; step += 1) {
        for (const end of [step, step + 1]) {
          pose[each] = least + ((most - least) * end) / ROUND;
          points.push(...at(pose));
        }
      }
    });
  }
  return swept;
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
  return points.length === 0 ? null : linesOf(points);
}

function linesOf(points: readonly number[]): BufferGeometry {
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

/** A round shape's rings, as the viewport's gizmo draws them. */
function ringsOf(shape: SpawnShape): BufferGeometry {
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
