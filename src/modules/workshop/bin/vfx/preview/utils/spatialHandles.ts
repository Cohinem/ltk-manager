import type { LeafValue, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmitterModel, SpawnShape, ValueCurve } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";

/** The emitter values a viewport handle edits. `offset` and `turn` are the overrides. */
export type HandleKind = "offset" | "turn" | "position" | "emit" | "size" | "velocity";

export const HANDLE_KINDS: readonly HandleKind[] = [
  "offset",
  "turn",
  "position",
  "emit",
  "size",
  "velocity",
];

/** The handles `SpatialHandle` draws, every one but the overrides `EmitterTransform` draws. */
export type SpatialKind = Exclude<HandleKind, "offset" | "turn">;

/** Why a handle cannot edit an emitter, and null where it can. */
export type HandleBlock = "animated" | "noShape" | null;

/** Whether `kind` edits `emitter`: a constant it can move, of a shape that has it. */
export function handleBlock(kind: SpatialKind, emitter: EmitterModel): HandleBlock {
  const shape = emitter.shape;
  switch (kind) {
    case "position":
      return still(emitter.emitterPosition) ? null : "animated";
    case "velocity":
      return still(emitter.birthVelocity) ? null : "animated";
    case "emit":
      if (shape.kind === "point") return null;
      if (shape.kind === "legacy") return still(shape.offset) ? null : "animated";
      return "noShape";
    case "size":
      return shape.kind === "box" || shape.kind === "sphere" || shape.kind === "cylinder"
        ? null
        : "noShape";
  }
}

/** Whether the handle moves a point or scales a shape. */
export function handleMode(kind: SpatialKind): "translate" | "scale" {
  return kind === "size" ? "scale" : "translate";
}

/**
 * Where a translate handle stands, in the emitter's spawn space.
 *
 * `base` is where the emitter stands, its override plus `EmitterPosition` this frame. The
 * emit offset adds to it, and the velocity's tip is where the birth velocity alone carries a
 * particle in `seconds`, its life, drag and forces aside.
 */
export function handlePoint(
  kind: SpatialKind,
  emitter: EmitterModel,
  base: Point,
  seconds: number,
): Point {
  switch (kind) {
    case "emit":
      return added(base, emitOffset(emitter.shape));
    case "velocity": {
      const from = added(base, pointOffset(emitter.shape));
      return added(from, scaled(constantOf(emitter.birthVelocity), seconds));
    }
    default:
      return base;
  }
}

/** The value a translate handle standing at `point` writes, the reverse of `handlePoint`. */
export function pointValue(
  kind: SpatialKind,
  emitter: EmitterModel,
  point: Point,
  base: Point,
  seconds: number,
) {
  switch (kind) {
    case "position":
      return added(constantOf(emitter.emitterPosition), subtracted(point, base));
    case "emit":
      return subtracted(point, base);
    default: {
      const from = added(base, pointOffset(emitter.shape));
      return scaled(subtracted(point, from), 1 / seconds);
    }
  }
}

/** A shape's size as a scale handle's three axes: a half-extent, a radius, or both of a cylinder. */
export function shapeScale(shape: SpawnShape): Point {
  switch (shape.kind) {
    case "box":
      return shape.size;
    case "sphere":
      return [shape.radius, shape.radius, shape.radius];
    case "cylinder":
      return [shape.radius, shape.height, shape.radius];
    default:
      return [1, 1, 1];
  }
}

/**
 * The size a scale handle at `scale` writes, from the size it started at.
 *
 * A sphere takes the axis dragged furthest as its radius, and a cylinder its across axes as
 * the radius and its up axis as the height.
 */
export function scaleValue(shape: SpawnShape, scale: Point, start: Point): Point {
  const moved = (axis: number) => Math.abs(scale[axis] - start[axis]);
  switch (shape.kind) {
    case "sphere": {
      const axis = [0, 1, 2].reduce((best, each) => (moved(each) > moved(best) ? each : best), 0);
      return [scale[axis], scale[axis], scale[axis]];
    }
    case "cylinder": {
      const radius = moved(2) > moved(0) ? scale[2] : scale[0];
      return [radius, scale[1], radius];
    }
    default:
      return scale;
  }
}

/** `emitter` with the handle's value written, for the run to preview a drag with. */
export function withHandleValue(kind: SpatialKind, emitter: EmitterModel, value: Point) {
  const shape = emitter.shape;
  switch (kind) {
    case "position":
      return { ...emitter, emitterPosition: withConstant(emitter.emitterPosition, value) };
    case "velocity":
      return { ...emitter, birthVelocity: withConstant(emitter.birthVelocity, value) };
    case "emit":
      if (shape.kind === "point") return { ...emitter, shape: { ...shape, offset: value } };
      if (shape.kind === "legacy") {
        return { ...emitter, shape: { ...shape, offset: withConstant(shape.offset, value) } };
      }
      return emitter;
    case "size":
      return { ...emitter, shape: sized(shape, value) };
  }
}

/** The property a handle's value is written to, and the edits that write it. */
export interface HandleEdit {
  /** The emitter's property, as a `0x` hash. */
  readonly field: string;
  readonly edits: ValueEdit[];
}

/** The bin fields the handles write, as `0x` hashes. */
const FIELD = {
  position: nameHash("EmitterPosition"),
  velocity: nameHash("birthVelocity"),
  shape: nameHash("SpawnShape"),
  emitOffset: nameHash("emitOffset"),
  size: nameHash("Size"),
  radius: nameHash("radius"),
  height: nameHash("height"),
  constant: nameHash("constantValue"),
} as const;

/** The edits that write the handle's value into the emitter's own bin. */
export function handleEdit(kind: SpatialKind, emitter: EmitterModel, value: Point): HandleEdit {
  const vector: LeafValue = { type: "vector", values: [...value] };
  const shape = emitter.shape;
  switch (kind) {
    case "position":
      return { field: FIELD.position, edits: constantEdits("", vector) };
    case "velocity":
      return { field: FIELD.velocity, edits: constantEdits("", vector) };
    case "emit":
      if (shape.kind === "legacy") {
        return {
          field: FIELD.shape,
          edits: [ensure("", FIELD.emitOffset), ...constantEdits(hex(FIELD.emitOffset), vector)],
        };
      }
      return { field: FIELD.shape, edits: fieldEdits(FIELD.emitOffset, vector) };
    case "size":
      if (shape.kind === "box")
        return { field: FIELD.shape, edits: fieldEdits(FIELD.size, vector) };
      if (shape.kind === "cylinder") {
        return {
          field: FIELD.shape,
          edits: [
            ...fieldEdits(FIELD.radius, float(value[0])),
            ...fieldEdits(FIELD.height, float(value[1])),
          ],
        };
      }
      return { field: FIELD.shape, edits: fieldEdits(FIELD.radius, float(value[0])) };
  }
}

/** A `0x` hash as an edit path segment. */
function hex(field: string): string {
  return field.slice(2);
}

function ensure(path: string, field: string): ValueEdit {
  return { type: "ensureProperty", path, field };
}

/** A field of the edited struct written, made first where the file has none. */
function fieldEdits(field: string, value: LeafValue): ValueEdit[] {
  return [ensure("", field), { type: "setLeaf", path: hex(field), value }];
}

function float(value: number): LeafValue {
  return { type: "float", value };
}

/** A value family's constant written under `path`, the family itself when empty. */
function constantEdits(path: string, value: LeafValue): ValueEdit[] {
  const constant = path === "" ? hex(FIELD.constant) : `${path}.${hex(FIELD.constant)}`;
  return [ensure(path, FIELD.constant), { type: "setLeaf", path: constant, value }];
}

function still(curve: ValueCurve): boolean {
  return curve.keys.length === 0;
}

function constantOf(curve: ValueCurve): Point {
  return [curve.constant[0] ?? 0, curve.constant[1] ?? 0, curve.constant[2] ?? 0];
}

function withConstant(curve: ValueCurve, value: Point): ValueCurve {
  return { ...curve, constant: [...value] };
}

/** Where a shape moves a birth from the emitter before its own spread, for the emit handle. */
function emitOffset(shape: SpawnShape): Point {
  if (shape.kind === "point") return shape.offset;
  if (shape.kind === "legacy") return constantOf(shape.offset);
  return [0, 0, 0];
}

/** The part of `emitOffset` every birth takes, which a velocity starts its flight from. */
function pointOffset(shape: SpawnShape): Point {
  return shape.kind === "point" || shape.kind === "legacy" ? emitOffset(shape) : [0, 0, 0];
}

function sized(shape: SpawnShape, value: Point): SpawnShape {
  switch (shape.kind) {
    case "box":
      return { ...shape, size: value };
    case "sphere":
      return { ...shape, radius: value[0] };
    case "cylinder":
      return { ...shape, radius: value[0], height: value[1] };
    default:
      return shape;
  }
}

function added(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtracted(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaled(a: Point, by: number): Point {
  return [a[0] * by, a[1] * by, a[2] * by];
}
