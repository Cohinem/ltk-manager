import { Matrix4, Vector3 } from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import { nameHash } from "../../shared/utils/binHash";
import type { EmitterModel } from "../engine/model/model";
import { curve, field } from "../engine/parsing/readValue";
import type { DrawFrame } from "../engine/simulation/particleRead";
import { sampleCurve } from "../engine/utils/sampleCurve";
import { basisMatrix } from "../preview/utils/transformEdit";
import { spawnFrameInto, spawnOriginInto } from "../rendering/utils/emitterShape";
import { type AuthoredForce, type ForceProperty, forceValue } from "./forceModel";

const MIRROR = new Vector3(...AXIS_SIGN);
/** The display length of a unit orbit axis, not an authored orbit radius. */
export const ORBIT_GUIDE_RADIUS = 30;

/**
 * Where the origin of the emitter's own frame stands in the viewport, which every field's
 * `Position` is placed from and an orbital field turns about.
 */
export function forceOrigin(emitter: EmitterModel, frame: DrawFrame): Vector3 {
  const origin = new Float32Array(3);
  spawnOriginInto(emitter, frame.world, frame.orientation, frame.origin, origin);

  return new Vector3(origin[0], origin[1], origin[2]).multiply(MIRROR);
}

/** The emitter's own frame as the viewport sees it, which a field's `Position` is turned by. */
export function forceFrame(emitter: EmitterModel, frame: DrawFrame): Matrix4 {
  const basis = new Float32Array(9);
  spawnFrameInto(emitter, frame.world.basis, frame.orientation, basis);

  return new Matrix4().makeScale(...AXIS_SIGN).multiply(basisMatrix(basis));
}

/** A force property sampled at emitter time, independent of preview mute/solo. */
export function forceSample(force: AuthoredForce, name: string, phase: number): readonly number[] {
  const property = force.definition.properties.find((property) => property.name === name);
  if (property === undefined || typeof property.fallback === "boolean") {
    return [0, 0, 0];
  }

  const held = forceValue(force, property);
  if (!held.valid || typeof held.value === "boolean") {
    return property.fallback;
  }

  if (!property.animated) {
    return held.value;
  }

  return sampleCurve(
    curve(field(force.node, nameHash(name)), { constant: held.value, keys: [], tables: [] }),
    phase,
  );
}

/**
 * The frame a field's direction is drawn in: the emitter's own, `place`, with the system's
 * orientation inside it only when both local-space flags are on.
 */
export function forceDirectionFrame(
  force: AuthoredForce,
  emitter: EmitterModel,
  frame: DrawFrame,
  place: Matrix4,
): Matrix4 {
  const local = force.definition.properties.find((property) => property.name === "isLocalSpace");
  const basis = place.clone();
  if (local !== undefined && forceValue(force, local).value === true && emitter.localOrientation) {
    basis.multiply(basisMatrix(frame.orientation));
  }

  if (force.definition.kind === "orbital") {
    basis.scale(new Vector3().setScalar(ORBIT_GUIDE_RADIUS));
  }

  return basis;
}

/** Constant handles never overwrite the animation that currently drives a property. */
export function forceHandle(force: AuthoredForce, name: string | null): ForceProperty | null {
  const property = force.definition.properties.find((property) => property.name === name);
  if (!force.supported || property === undefined || !forceValue(force, property).valid) {
    return null;
  }

  if (
    property.name !== "Position" &&
    property.name !== "radius" &&
    property.name !== "direction" &&
    !(property.name === "acceleration" && property.shape === "vector")
  ) {
    return null;
  }

  const animated = curve(field(force.node, nameHash(property.name)), {
    constant: [],
    keys: [],
    tables: [],
  });
  return animated.keys.length === 0 ? property : null;
}

/** A translated viewport endpoint expressed as a field constant. */
export function forceHandleValue(
  name: string,
  point: Vector3,
  origin: Vector3,
  center: Vector3,
  direction: Matrix4,
  place: Matrix4,
): number[] {
  if (name === "radius") {
    return [Math.max(0, point.x - center.x)];
  }

  const value = point.clone().sub(origin);
  if (name === "Position") {
    value.applyMatrix4(place.clone().invert());
  } else {
    value.applyMatrix4(direction.clone().invert());
  }

  return value.toArray();
}
