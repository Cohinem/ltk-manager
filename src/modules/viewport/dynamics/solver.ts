import { CAPSULE_FLOATS, type ChainRig, SPHERE_FLOATS } from "./build";
import {
  EPSILON,
  multiplyInto,
  normalizeQuat,
  relativeInto,
  rotateInto,
  unrotateInto,
} from "./math";

/**
 * The solver's part of one step: the collision pass, and the constraint passes of a chain
 * that has rods or lateral links.
 *
 * `h` is the step over the substeps and a compliance is divided by its square. The
 * positions were integrated once before this, so a substep only starts the multipliers
 * over. A substep ends early once a pass leaves no error above the threshold.
 */
export function solve(rig: ChainRig, dt: number): void {
  const { settings } = rig;
  const everyPass = settings.collisionMode === 1;
  if (!everyPass) collide(rig);

  const constrained = rig.links.length + rig.stretchShear.length + rig.bendTwist.length > 0;
  if (!constrained) {
    if (everyPass) collide(rig);
    return;
  }

  const h = dt / Math.max(settings.substeps, 1);
  const inverseSquare = h > EPSILON ? 1 / (h * h) : 0;
  for (let substep = 0; substep < settings.substeps; substep += 1) {
    for (const link of rig.links) link.lambda = 0;
    for (const rod of rig.stretchShear) rod.lambda.fill(0);
    for (const turn of rig.bendTwist) turn.lambda.fill(0);

    for (let pass = 0; pass < settings.iterations; pass += 1) {
      const error = constraintPass(rig, inverseSquare);
      if (everyPass) collide(rig);
      if (error < settings.threshold) break;
    }
  }
}

/** One pass over every constraint, answering the largest error it met. */
function constraintPass(rig: ChainRig, inverseSquare: number): number {
  let error = 0;
  for (const link of rig.links) {
    error = Math.max(error, solveLink(rig, link, link.compliance * inverseSquare));
  }
  for (const rod of rig.stretchShear) {
    error = Math.max(error, solveStretchShear(rig, rod, inverseSquare));
  }
  for (const turn of rig.bendTwist) {
    error = Math.max(error, solveBendTwist(rig, turn, inverseSquare));
  }
  return error;
}

function inverseMass(rig: ChainRig, node: number): number {
  return rig.pinned[node] === 1 || rig.simulated[node] === 0 ? 0 : 1;
}

function solveLink(rig: ChainRig, link: ChainRig["links"][number], alpha: number): number {
  const { position } = rig;
  const a = link.a * 3;
  const b = link.b * 3;
  const dx = position[b] - position[a];
  const dy = position[b + 1] - position[a + 1];
  const dz = position[b + 2] - position[a + 2];
  const span = Math.hypot(dx, dy, dz);
  const wa = inverseMass(rig, link.a);
  const wb = inverseMass(rig, link.b);
  if (span < EPSILON || wa + wb + alpha === 0) return 0;

  const stretch = span - link.rest;
  const delta = (-stretch - alpha * link.lambda) / (wa + wb + alpha);
  link.lambda += delta;

  const push = delta / span;
  position[a] -= wa * push * dx;
  position[a + 1] -= wa * push * dy;
  position[a + 2] -= wa * push * dz;
  position[b] += wb * push * dx;
  position[b + 1] += wb * push * dy;
  position[b + 2] += wb * push * dz;
  return Math.abs(stretch);
}

/**
 * One rod segment: the vector from a node to its child, read in the node's orientation,
 * held at the rest length along the rod and at nothing across it.
 *
 * The part along the rod takes the stretch compliance and the part across it the shear
 * compliance. The correction moves both particles and turns the orientation.
 */
function solveStretchShear(
  rig: ChainRig,
  rod: ChainRig["stretchShear"][number],
  inverseSquare: number,
): number {
  const { position, orientation, restDirection } = rig;
  const a = rod.node * 3;
  const b = rod.child * 3;
  const q = rod.node * 4;
  const rest = rig.restLength[rod.child];
  const wa = inverseMass(rig, rod.node);
  const wb = inverseMass(rig, rod.child);
  const wq = rig.pinned[rod.node] === 1 ? 0 : 1;

  SEGMENT[0] = position[b] - position[a];
  SEGMENT[1] = position[b + 1] - position[a + 1];
  SEGMENT[2] = position[b + 2] - position[a + 2];
  unrotateInto(LOCAL, 0, orientation, q, SEGMENT, 0);

  const ex = restDirection[a];
  const ey = restDirection[a + 1];
  const ez = restDirection[a + 2];
  LOCAL[0] -= rest * ex;
  LOCAL[1] -= rest * ey;
  LOCAL[2] -= rest * ez;
  const along = LOCAL[0] * ex + LOCAL[1] * ey + LOCAL[2] * ez;

  /* A turn of the orientation changes the part across the rod and not the part along it,
     so only the shear shares its correction with the orientation. */
  const stretchWeight = wa + wb;
  const shearWeight = wa + wb + 4 * wq * rest * rest;
  const stretchAlpha = rod.stretch * inverseSquare;
  const shearAlpha = rod.shear * inverseSquare;
  if (stretchWeight + stretchAlpha === 0 || shearWeight + shearAlpha === 0) return 0;

  const { lambda } = rod;
  const stretchDelta = (-along - stretchAlpha * lambda[0]) / (stretchWeight + stretchAlpha);
  lambda[0] += stretchDelta;

  let across = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const rodAxis = restDirection[a + axis];
    const off = LOCAL[axis] - along * rodAxis;
    across = Math.max(across, Math.abs(off));

    const delta = (-off - shearAlpha * lambda[axis + 1]) / (shearWeight + shearAlpha);
    lambda[axis + 1] += delta;
    SHEAR[axis] = -delta;
    LOCAL[axis] = -(stretchDelta * rodAxis + delta);
  }
  rotateInto(SEGMENT, 0, orientation, q, LOCAL, 0);

  for (let axis = 0; axis < 3; axis += 1) {
    position[a + axis] += wa * SEGMENT[axis];
    position[b + axis] -= wb * SEGMENT[axis];
  }

  if (wq > 0) {
    rotateInto(PURE, 0, orientation, q, SHEAR, 0);
    PURE[3] = 0;
    AXIS[0] = -ex;
    AXIS[1] = -ey;
    AXIS[2] = -ez;
    AXIS[3] = 0;
    multiplyInto(TURNED, 0, orientation, q, AXIS, 0);
    multiplyInto(PURE, 0, PURE, 0, TURNED, 0);
    for (let axis = 0; axis < 4; axis += 1) orientation[q + axis] += 2 * wq * rest * PURE[axis];
    normalizeQuat(orientation, q);
  }

  return Math.max(Math.abs(along), across);
}

/**
 * The turn between a node's orientation and its parent's, held at the animated turn.
 *
 * The part about the parent's rod takes the twist compliance and the part across it the
 * bend compliance. Both orientations turn.
 */
function solveBendTwist(
  rig: ChainRig,
  turn: ChainRig["bendTwist"][number],
  inverseSquare: number,
): number {
  const { orientation, restTurn, restDirection } = rig;
  const q0 = turn.parent * 4;
  const q1 = turn.node * 4;
  const w0 = rig.pinned[turn.parent] === 1 ? 0 : 1;
  const w1 = rig.pinned[turn.node] === 1 ? 0 : 1;
  const weight = w0 + w1;
  if (weight === 0) return 0;

  relativeInto(OMEGA, 0, orientation, q0, orientation, q1);
  let apart = 0;
  let together = 0;
  for (let axis = 0; axis < 4; axis += 1) {
    apart += (OMEGA[axis] - restTurn[q1 + axis]) ** 2;
    together += (OMEGA[axis] + restTurn[q1 + axis]) ** 2;
  }
  const sign = apart > together ? 1 : -1;
  for (let axis = 0; axis < 3; axis += 1) OMEGA[axis] += sign * restTurn[q1 + axis];

  const e = turn.parent * 3;
  const about =
    OMEGA[0] * restDirection[e] + OMEGA[1] * restDirection[e + 1] + OMEGA[2] * restDirection[e + 2];
  const bendAlpha = turn.bend * inverseSquare;
  const twistAlpha = turn.twist * inverseSquare;

  const { lambda } = turn;
  const twistDelta = (-about - twistAlpha * lambda[0]) / (weight + twistAlpha);
  lambda[0] += twistDelta;

  let across = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const off = OMEGA[axis] - about * restDirection[e + axis];
    across = Math.max(across, Math.abs(off));

    const delta = (-off - bendAlpha * lambda[axis + 1]) / (weight + bendAlpha);
    lambda[axis + 1] += delta;
    PURE[axis] = -(twistDelta * restDirection[e + axis] + delta);
  }
  PURE[3] = 0;

  multiplyInto(TURNED, 0, orientation, q1, PURE, 0);
  multiplyInto(AXIS, 0, orientation, q0, PURE, 0);
  for (let axis = 0; axis < 4; axis += 1) {
    orientation[q0 + axis] += w0 * TURNED[axis];
    orientation[q1 + axis] -= w1 * AXIS[axis];
  }
  normalizeQuat(orientation, q0);
  normalizeQuat(orientation, q1);

  return Math.max(Math.abs(about), across);
}

/** Every free particle with a radius pushed out of the spheres, the capsules and the ground. */
export function collide(rig: ChainRig): void {
  const { position, spheres, capsules, plane } = rig;
  for (let node = 0; node < rig.count; node += 1) {
    const radius = rig.radius[node];
    if (rig.simulated[node] === 0 || rig.pinned[node] === 1 || radius <= 0) continue;

    const at = node * 3;
    for (let sphere = 0; sphere < spheres.length; sphere += SPHERE_FLOATS) {
      pushOut(position, at, spheres, sphere, spheres[sphere + 3] + radius);
    }

    for (let capsule = 0; capsule < capsules.length; capsule += CAPSULE_FLOATS) {
      const dx = capsules[capsule + 4] - capsules[capsule];
      const dy = capsules[capsule + 5] - capsules[capsule + 1];
      const dz = capsules[capsule + 6] - capsules[capsule + 2];
      const span = dx * dx + dy * dy + dz * dz;
      const radiusA = capsules[capsule + 3];
      const radiusB = capsules[capsule + 7];

      /* An end standing on the other is a sphere at the larger of the two. */
      let t = radiusB > radiusA ? 1 : 0;
      if (span > EPSILON) {
        const along =
          (position[at] - capsules[capsule]) * dx +
          (position[at + 1] - capsules[capsule + 1]) * dy +
          (position[at + 2] - capsules[capsule + 2]) * dz;
        t = Math.min(Math.max(along / span, 0), 1);
      }

      NEAREST[0] = capsules[capsule] + t * dx;
      NEAREST[1] = capsules[capsule + 1] + t * dy;
      NEAREST[2] = capsules[capsule + 2] + t * dz;
      pushOut(position, at, NEAREST, 0, (1 - t) * radiusA + t * radiusB + radius);
    }

    const depth =
      radius -
      ((position[at] - plane[0]) * plane[3] +
        (position[at + 1] - plane[1]) * plane[4] +
        (position[at + 2] - plane[2]) * plane[5]);
    if (depth > 0) {
      position[at] += plane[3] * depth;
      position[at + 1] += plane[4] * depth;
      position[at + 2] += plane[5] * depth;
    }
  }
}

/** The point at `position[at]` moved `reach` away from `centre` where it stands nearer, and up where it stands on it. */
function pushOut(
  position: Float64Array,
  at: number,
  centre: ArrayLike<number>,
  ci: number,
  reach: number,
): void {
  const dx = position[at] - centre[ci];
  const dy = position[at + 1] - centre[ci + 1];
  const dz = position[at + 2] - centre[ci + 2];
  const square = dx * dx + dy * dy + dz * dz;
  if (square >= reach * reach) return;

  if (square <= EPSILON) {
    position[at] = centre[ci];
    position[at + 1] = centre[ci + 1] + reach;
    position[at + 2] = centre[ci + 2];
    return;
  }

  const push = reach / Math.sqrt(square);
  position[at] = centre[ci] + dx * push;
  position[at + 1] = centre[ci + 1] + dy * push;
  position[at + 2] = centre[ci + 2] + dz * push;
}

const SEGMENT = new Float64Array(3);
const LOCAL = new Float64Array(3);
const SHEAR = new Float64Array(3);
const NEAREST = new Float64Array(3);
const PURE = new Float64Array(4);
const AXIS = new Float64Array(4);
const TURNED = new Float64Array(4);
const OMEGA = new Float64Array(4);
