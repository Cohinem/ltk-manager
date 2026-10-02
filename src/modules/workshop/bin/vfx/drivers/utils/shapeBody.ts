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
import { drawCurve } from "../../engine/utils/sampleCurve";
import { SEGMENTS, shapeInto } from "../../rendering/utils/emitterShape";
import type { SpawnCloud } from "./spawnCloud";

/** A spawn shape drawn as a body in its own space: faint faces, and the edges over them. */
export interface ShapeBody {
  readonly faces: BufferGeometry;
  readonly edges: BufferGeometry;
  /** A legacy shape's emit rotations: each axis as a line, and the arc its angle sweeps. */
  readonly turns: BufferGeometry | null;
}

/** The thickness a flat side is given, so a face of no depth still draws. */
const FLAT = 1e-3;

/** How many sides a round body is cut into. */
const ROUND = 40;

/**
 * The body a shape spawns on or in, in the shape's own space, and null for a shape that spawns
 * at one place. A box, a sphere or a cylinder draws itself, and a legacy shape, which has no
 * body, the box its births span.
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
      return { faces, edges: ringsOf(shape), turns: null };
    }

    case "cylinder": {
      if (shape.radius <= 0) return null;
      const height = Math.max(shape.height, FLAT);
      const faces = new CylinderGeometry(shape.radius, shape.radius, height, ROUND);
      faces.translate(0, height / 2, 0);
      return { faces, edges: ringsOf(shape), turns: null };
    }

    case "legacy": {
      const { localLow: low, localHigh: high } = cloud;
      const [x, y, z] = [0, 1, 2].map((axis) => high[axis]! - low[axis]!);
      if (x < FLAT && y < FLAT && z < FLAT) return null;

      const faces = new BoxGeometry(Math.max(x, FLAT), Math.max(y, FLAT), Math.max(z, FLAT));
      faces.translate((high[0] + low[0]) / 2, (high[1] + low[1]) / 2, (high[2] + low[2]) / 2);
      return { ...boxBody(faces), turns: turnsOf(shape, Math.max(x, y, z)) };
    }
  }
}

function boxBody(faces: BoxGeometry): ShapeBody {
  return { faces, edges: new EdgesGeometry(faces), turns: null };
}

/** How many steps an angle's arc is drawn in. */
const ARC_STEPS = 32;

/** An axis line's half length and a degenerate arc's radius, as shares of the shape's span. */
const AXIS_REACH = 0.7;
const ARC_FALLBACK = 0.35;

/**
 * A legacy shape's emit rotations: each axis as a line through the emitter, and the arc its
 * offset's middle sweeps about it over the least to the most angle the curve draws, across the
 * life and the chance. Each turn is drawn on its own from the middle offset, not composed with
 * the turns before it. Null where no turn has an axis.
 */
function turnsOf(
  shape: Extract<SpawnShape, { kind: "legacy" }>,
  span: number,
): BufferGeometry | null {
  const points: number[] = [];
  const middle = new Vector3(...drawCurve(shape.offset, 0.5, 0.5).slice(0, 3)).add(
    new Vector3(...drawCurve(shape.translation, 0.5, 0.5).slice(0, 3)),
  );
  const count = Math.min(shape.angles.length, shape.axes.length);
  for (let each = 0; each < count; each += 1) {
    const axis = new Vector3(...shape.axes[each]!);
    if (axis.lengthSq() === 0) continue;
    axis.normalize();

    const reach = Math.max(span, 1) * AXIS_REACH;
    points.push(
      ...axis.clone().multiplyScalar(-reach).toArray(),
      ...axis.clone().multiplyScalar(reach).toArray(),
    );

    const [least, most] = angleSpan(shape.angles[each]!);
    const pivot = axis.clone().multiplyScalar(middle.dot(axis));
    let start = middle.clone().sub(pivot);
    if (start.lengthSq() < 1e-6) {
      start = perpendicular(axis).multiplyScalar(Math.max(span, 1) * ARC_FALLBACK);
    }
    for (let step = 0; step < ARC_STEPS; step += 1) {
      for (const at of [step, step + 1]) {
        const degrees = least + ((most - least) * at) / ARC_STEPS;
        points.push(
          ...start
            .clone()
            .applyAxisAngle(axis, degrees * DEGREE)
            .add(pivot)
            .toArray(),
        );
      }
    }
  }
  if (points.length === 0) return null;

  const turns = new BufferGeometry();
  turns.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return turns;
}

const DEGREE = Math.PI / 180;

/** The least and the most degrees `curve` draws across the life and the chance. */
function angleSpan(curve: ValueCurve): [number, number] {
  const drawn = [0, 0.25, 0.5, 0.75, 1].flatMap((t01) =>
    [0, 1].map((chance) => drawCurve(curve, t01, chance)[0] ?? 0),
  );
  return [Math.min(...drawn), Math.max(...drawn)];
}

/** A unit vector at right angles to `axis`. */
function perpendicular(axis: Vector3): Vector3 {
  const other = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  return other.cross(axis).normalize();
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
