/**
 * A ribbon: the trail strung through an emitter's particles, and the one quad a beam is.
 *
 * Both are the engine's own builders. A strand or a beam is filled in the engine's space
 * and each vertex is mirrored into the viewport's on the way out, so a cross product lands
 * the way the engine's does and the uv sits on the engine's own vertex.
 */

import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import { TRAIL_SMOOTHING } from "../../engine/model/enums";
import type { BeamModel, UvLayer } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import type { Source } from "../../engine/simulation/particleRead";
import { turnInto } from "../../engine/utils/basis";
import { sampleCurve } from "../../engine/utils/sampleCurve";
import { written } from "./buffers";
import type { UvDraw } from "./uvTransform";

/** The points one trail runs through, oldest first, and what each carries. */
export interface Strand {
  count: number;
  /** Three per point, in the engine's space. */
  readonly position: Float32Array;
  /** The half-width at each point, which is `scale0.x`. */
  readonly width: Float32Array;
  /** Four per point. */
  readonly color: Float32Array;
  /** Three per point: the particle's local `+X`, which an arbitrary trail expands along. */
  readonly side: Float32Array;
  /** Two per point: `mBirthTilingSize`, as drawn at the particle's birth. */
  readonly tiling: Float32Array;
  /** How far the emitter had travelled at the particle's birth, which `WAKE` runs `u` on. */
  readonly odometer: Float32Array;
  /** [`UV_STRIDE`] per point: the layer's transform for the particle, as [`packUv`] lays it. */
  readonly uv: Float32Array;
  /** The same for `textureMult`'s layer, read only where the emitter carries one. */
  readonly multUv: Float32Array;
  /** Two per point: where the particle reads the colour ramp, from `colorLookupInto`. */
  readonly lookup: Float32Array;
  /** The erosion drive at each point, the map value its alpha is cut below. */
  readonly erode: Float32Array;
}

/** How many numbers one point's UV transform takes in a strand. */
export const UV_STRIDE = 7;

/** A strand with room for `capacity` points and none in it. */
export function strand(capacity: number): Strand {
  return {
    count: 0,
    position: new Float32Array(capacity * 3),
    width: new Float32Array(capacity),
    color: new Float32Array(capacity * 4),
    side: new Float32Array(capacity * 3),
    tiling: new Float32Array(capacity * 2),
    odometer: new Float32Array(capacity),
    uv: new Float32Array(capacity * UV_STRIDE),
    multUv: new Float32Array(capacity * UV_STRIDE),
    lookup: new Float32Array(capacity * 2),
    erode: new Float32Array(capacity).fill(1),
  };
}

/** One particle's UV transform written to `out` from `at`, as a ribbon's writers read it. */
export function packUv(draw: UvDraw, out: Float32Array, at: number): void {
  out[at] = draw.turn;
  out[at + 1] = draw.scaleU;
  out[at + 2] = draw.scaleV;
  out[at + 3] = draw.offsetU;
  out[at + 4] = draw.offsetV;
  out[at + 5] = draw.cellU;
  out[at + 6] = draw.cellV;
}

/** How one emitter's trail is built, off its `VfxTrailDefinitionData` and the frame. */
export interface TrailBuild {
  /**
   * The view direction, which a camera trail expands across together with its tangent,
   * and null for an arbitrary trail, which expands along each point's own side.
   */
  readonly view: Point | null;
  /** `mMode` is `WAKE`: `u` is the odometer at birth rather than the length walked. */
  readonly wake: boolean;
  /** `mSmoothingMode`, which picks the traversal's direction and turns the filter and the miter on. */
  readonly smoothing: number;
  /** How many particles either side of a point the box filter averages, from `smoothingReachAt`. */
  readonly reach: number;
  /** `mCutoff`, the walked length past which no point is emitted, and zero for none. */
  readonly cutoff: number;
  readonly layers: RibbonLayers;
}

/** The centre a layer's transform acts about, and the axes it mirrors after it. */
export type RibbonLayer = Pick<UvLayer, "center" | "flipU" | "flipV">;

/** What of each layer the uv writer reads, `textureMult`'s null for an emitter carrying none. */
export interface RibbonLayers {
  readonly base: RibbonLayer;
  readonly mult: RibbonLayer | null;
}

/** The arrays a ribbon is written into. */
export interface RibbonArrays {
  readonly position: Float32Array;
  readonly uv: Float32Array;
  /** Two per vertex: where `LOCK_ALPHA` samples the alpha, the uv turned and scaled but not scrolled. */
  readonly alphaUv: Float32Array;
  /** Two per vertex: where the particle's cell starts, in texture space. */
  readonly cell: Float32Array;
  readonly tint: Float32Array;
  /** Two per vertex: where the colour ramp is read, the particle's own. */
  readonly lookup: Float32Array;
  /** One per vertex: the erosion drive. */
  readonly erode: Float32Array;
  /** Two per vertex each: `textureMult`'s uv and where its cell starts, as `uv` and `cell` are the base's. */
  readonly multUv: Float32Array;
  readonly multCell: Float32Array;
  readonly index: Uint32Array;
  /** Each triangle's three edges of `index`, `a b, b c, c a`, `index.length * 2` long. */
  readonly edges: Uint32Array;
}

/** How far into the arrays the next ribbon is written, which a write advances. */
export interface Cursor {
  vertex: number;
  index: number;
}

/** What a wake's `u` is brought back by, which keeps mirrored-repeat parity. */
const WAKE_MODULUS = 2;

/** Scratch the trail walk reuses, so a frame allocates nothing per point. */
const POINT = new Float32Array(3);
const NEXT = new Float32Array(3);
const TANGENT = new Float32Array(3);
const ACROSS = new Float32Array(3);
const RAW_ACROSS = new Float32Array(3);
const LAST = new Float32Array(3);
const LAST_ACROSS = new Float32Array(3);
const AXIS = new Float32Array(3);

/**
 * One strand written as the engine's trail from `cursor` on, and the cursor moved past it.
 *
 * The walk runs newest to oldest, and oldest to newest under `BackToFront`, so `u` opens
 * at zero on whichever end that is. Smoothing box-filters every interior point and miters
 * each joint to the bisector of its two sides. `mCutoff` truncates the walk at that length.
 * Under `WAKE` the whole ribbon's `u` is brought back by the first point's even part, which
 * the engine does to keep a half-float representable. A strand of fewer than two points, or
 * one the arrays have no room for, writes nothing.
 */
export function writeTrail(
  held: Strand,
  build: TrailBuild,
  out: RibbonArrays,
  cursor: Cursor,
): void {
  const points = held.count;
  if (points < 2) return;
  if ((cursor.vertex + points * 2) * 3 > out.position.length) return;
  if (cursor.index + (points - 1) * 6 > out.index.length) return;

  const backToFront = build.smoothing === TRAIL_SMOOTHING.backToFront;
  const smoothed = build.smoothing !== TRAIL_SMOOTHING.off;
  const start = backToFront ? 0 : points - 1;
  const step = backToFront ? 1 : -1;

  let emitted = 0;
  let walked = 0;
  let base = 0;

  for (let seen = 0; seen < points; seen += 1) {
    const at = start + seen * step;
    const first = seen === 0;
    /* The oldest particle is never filtered, and neither is the first of the walk. */
    placed(held, at, smoothed && !first && at !== 0 ? build.reach : 0, POINT);

    if (!first) {
      walked += Math.hypot(POINT[0] - LAST[0], POINT[1] - LAST[1], POINT[2] - LAST[2]);
      if (build.cutoff > 0 && build.cutoff <= walked) break;
    }

    if (first) {
      placed(held, at + step, 0, NEXT);
      for (let axis = 0; axis < 3; axis += 1) TANGENT[axis] = NEXT[axis] - POINT[axis];
    } else {
      for (let axis = 0; axis < 3; axis += 1) TANGENT[axis] = POINT[axis] - LAST[axis];
    }
    unit(TANGENT);

    if (build.view === null) {
      ACROSS[0] = held.side[at * 3];
      ACROSS[1] = held.side[at * 3 + 1];
      ACROSS[2] = held.side[at * 3 + 2];
    } else {
      cross(build.view, TANGENT, ACROSS);
      /* A point on top of the last, or a strand seen along its own length, crosses to
         nothing, and a pair built on it lands twice on the point. */
      if (!unit(ACROSS)) {
        if (first) sideOf(build.view, ACROSS);
        else ACROSS.set(LAST_ACROSS);
      }
    }

    /* The joint's own two sides, kept unmitered, because the bisector below is between a
       segment and a segment rather than between a segment and the last bisector. */
    RAW_ACROSS.set(ACROSS);

    /* The miter: this side turned halfway toward the last, which is their bisector, and
       the side itself where the two are opposite and have none. */
    if (smoothed && !first) {
      for (let axis = 0; axis < 3; axis += 1) ACROSS[axis] += LAST_ACROSS[axis];
      if (!unit(ACROSS)) ACROSS.set(RAW_ACROSS);
    }

    const half = held.width[at];
    const tilingU = held.tiling[at * 2];
    const tilingV = held.tiling[at * 2 + 1];
    let u = tilingU > 0 ? (build.wake ? held.odometer[at] : walked) / tilingU : 0;
    if (first) base = u - (u % WAKE_MODULUS);
    u -= base;
    const span = tilingV > 0 ? half / tilingV : tilingV === 0 ? 1 : -tilingV;

    const vertex = cursor.vertex + emitted * 2;
    vertexInto(out, vertex, POINT, ACROSS, half, u, 0.5 - span / 2, held, at, build.layers);
    vertexInto(out, vertex + 1, POINT, ACROSS, -half, u, 0.5 + span / 2, held, at, build.layers);

    if (emitted > 0) {
      out.index[cursor.index] = vertex;
      out.index[cursor.index + 1] = vertex - 2;
      out.index[cursor.index + 2] = vertex - 1;
      out.index[cursor.index + 3] = vertex;
      out.index[cursor.index + 4] = vertex - 1;
      out.index[cursor.index + 5] = vertex + 1;
      cursor.index += 6;
    }

    emitted += 1;
    LAST.set(POINT);
    LAST_ACROSS.set(RAW_ACROSS);
  }

  cursor.vertex += emitted * 2;
}

/**
 * The point at `at`, box-filtered over `reach` particles either side of it.
 *
 * The mean is over the particles either side in birth order, clipped to the strand, and the
 * divisor counts only what is in range. A `reach` of zero is the point itself.
 */
function placed(held: Strand, at: number, reach: number, out: Float32Array): void {
  if (reach === 0) {
    out[0] = held.position[at * 3];
    out[1] = held.position[at * 3 + 1];
    out[2] = held.position[at * 3 + 2];
    return;
  }

  const from = Math.max(at - reach, 0);
  const to = Math.min(at + reach, held.count - 1);
  out.fill(0);
  for (let each = from; each <= to; each += 1) {
    out[0] += held.position[each * 3];
    out[1] += held.position[each * 3 + 1];
    out[2] += held.position[each * 3 + 2];
  }
  const samples = to - from + 1;
  out[0] /= samples;
  out[1] /= samples;
  out[2] /= samples;
}

/**
 * One vertex of a trail: the point moved `along` its side, each layer's uv through its
 * transform.
 *
 * The mult layer runs the same `(u, v)` the base does through its own transform. Where the
 * engine hands `uvMatrix1` the per-particle mult stream, and what the matrix is applied to
 * there, is decision 2.45 of docs/plans/vfx-particle-renderer.md.
 */
function vertexInto(
  out: RibbonArrays,
  vertex: number,
  point: Float32Array,
  across: Float32Array,
  along: number,
  u: number,
  v: number,
  held: Strand,
  at: number,
  layers: RibbonLayers,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    out.position[vertex * 3 + axis] = (point[axis] + across[axis] * along) * AXIS_SIGN[axis];
  }
  uvInto(out, vertex, u, v, held.uv, at * UV_STRIDE, layers.base);
  if (layers.mult !== null) {
    placedInto(out.multUv, out.multCell, vertex, u, v, held.multUv, at * UV_STRIDE, layers.mult);
  }
  for (let channel = 0; channel < 4; channel += 1) {
    out.tint[vertex * 4 + channel] = held.color[at * 4 + channel];
  }
  out.lookup[vertex * 2] = held.lookup[at * 2];
  out.lookup[vertex * 2 + 1] = held.lookup[at * 2 + 1];
  out.erode[vertex] = held.erode[at];
}

/**
 * The base layer's uv, its locked alpha uv and its cell at one vertex.
 *
 * The alpha's uv is the matrix with its translation column dropped.
 */
function uvInto(
  out: RibbonArrays,
  vertex: number,
  u: number,
  v: number,
  transform: Float32Array,
  at: number,
  layer: RibbonLayer,
): void {
  placedInto(out.uv, out.cell, vertex, u, v, transform, at, layer);

  const scaleU = transform[at + 1];
  const scaleV = transform[at + 2];
  const c = Math.cos(transform[at]);
  const s = Math.sin(transform[at]);
  const lockedU = u * scaleU * c - v * scaleV * s;
  const lockedV = u * scaleU * s + v * scaleV * c;
  out.alphaUv[vertex * 2] = layer.flipU ? 1 - lockedU : lockedU;
  out.alphaUv[vertex * 2 + 1] = layer.flipV ? 1 - lockedV : lockedV;
}

/**
 * A raw uv through the particle's 2x3 transform, which is `layerUv` of the quad shader,
 * into `uv`, and where its cell starts into `cell`.
 *
 * The scale and the rotation act about the centre, the scroll translates after them and
 * a flip mirrors the result within the cell, whose start is carried beside it for the
 * sampler to land the wrap in.
 */
function placedInto(
  uv: Float32Array,
  cell: Float32Array,
  vertex: number,
  u: number,
  v: number,
  transform: Float32Array,
  at: number,
  layer: RibbonLayer,
): void {
  const { center } = layer;
  const c = Math.cos(transform[at]);
  const s = Math.sin(transform[at]);
  const placedU = (u - center[0]) * transform[at + 1];
  const placedV = (v - center[1]) * transform[at + 2];
  const turnedU = placedU * c - placedV * s + center[0] + transform[at + 3];
  const turnedV = placedU * s + placedV * c + center[1] + transform[at + 4];
  uv[vertex * 2] = layer.flipU ? 1 - turnedU : turnedU;
  uv[vertex * 2 + 1] = layer.flipV ? 1 - turnedV : turnedV;
  cell[vertex * 2] = transform[at + 5];
  cell[vertex * 2 + 1] = transform[at + 6];
}

/** Where a beam's two ends stand this frame, in the engine's space. */
export interface BeamEnds {
  /** The system's position plus `mLocalSpaceSourceOffset`. */
  readonly source: Point;
  /** The system's target plus `mLocalSpaceTargetOffset`. */
  readonly target: Point;
  /** Where the eye stands, and null for `ARBITRARY`, which lies across the world's up. */
  readonly eye: Point | null;
}

/** Scratch vector for a rotated beam offset. */
const OFFSET = new Float32Array(3);

/**
 * Writes the two ends of `beam` for `source` into `from` and `to`, in engine space.
 *
 * `from` is the system position plus `mLocalSpaceSourceOffset`, and `to` is the system
 * target plus `mLocalSpaceTargetOffset`. Both offsets are rotated by the system orientation
 * first (`VfxRibbon_ShapesAndPrimitives.md` section 3.2).
 */
export function beamEndsInto(
  source: Source,
  beam: BeamModel,
  from: [number, number, number],
  to: [number, number, number],
): void {
  OFFSET.set(beam.sourceOffset);
  turnInto(source.orientation, OFFSET, 0);
  for (let axis = 0; axis < 3; axis += 1) from[axis] = source.origin[axis] + OFFSET[axis];

  OFFSET.set(beam.targetOffset);
  turnInto(source.orientation, OFFSET, 0);
  for (let axis = 0; axis < 3; axis += 1) to[axis] = source.target[axis] + OFFSET[axis];
}

/**
 * Returns the RGBA factor that `beam` multiplies into the colour of each particle of `source`.
 *
 * If `mIsColorBindedWithDistance` is set, samples `mAnimatedColorWithDistance` at the distance
 * between the system position and its target, without the offsets. Otherwise returns white.
 */
export function beamTint(source: Source, beam: BeamModel): readonly number[] {
  if (!beam.colorBoundToDistance) return UNBOUND;

  return sampleCurve(beam.colorByDistance, anchorDistance(source));
}

const UNBOUND: readonly number[] = [1, 1, 1, 1];

/** Returns the distance between the system position of `source` and its target. */
export function anchorDistance(source: Source): number {
  const { origin, target } = source;
  return Math.hypot(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]);
}

/** What one particle brings to the beam it draws. */
export interface BeamParticle {
  /** `scale0`: the width across, the share trimmed from the source, and the share from the target. */
  readonly scale: Float32Array;
  readonly color: Float32Array;
  /** `mBirthTilingSize`, as drawn at birth, two channels from `tilingAt`. */
  readonly tiling: Float32Array;
  readonly tilingAt: number;
  /** The particle's own basis and its position off the system, which `ARBITRARY` runs the width through. */
  readonly turn: Float32Array;
  readonly local: Point;
  /** The layer's transform for the particle, [`UV_STRIDE`] numbers from `uvAt`. */
  readonly uv: Float32Array;
  readonly uvAt: number;
  /** `textureMult`'s transform for the particle, [`UV_STRIDE`] numbers, read only where the emitter carries one. */
  readonly multUv: Float32Array;
  /** Two: where the particle reads the colour ramp. */
  readonly lookup: Float32Array;
  /** The erosion drive, the map value the particle's alpha is cut below. */
  erode: number;
}

/** Scratch the beam write reuses. */
const DELTA = new Float32Array(3);
const TO_EYE = new Float32Array(3);
const WIDE = new Float32Array(3);
const CORNER = new Float32Array(3);

/**
 * One particle's beam written as the engine's quad from `cursor` on, and the cursor moved.
 *
 * The quad runs from the target pulled back by `scale0.z` of the beam to the source pushed
 * on by `scale0.y`, `scale0.x` wide. A default beam's width lies across the view and the
 * beam, and an arbitrary one's is the beam crossed with the world's up, run through the
 * particle's own matrix as a point and left unnormalised, so a beam tilted toward vertical
 * narrows and the particle's position leaks into the width. The texture's `u` spans the
 * width over `mBirthTilingSize.x` and its `v` the whole length over `.y`, a component at
 * or below zero spanning one, and the particle's transform scrolls its `u` along the
 * length, decision 2.34 of docs/plans/vfx-particle-renderer.md.
 */
export function writeBeam(
  ends: BeamEnds,
  particle: BeamParticle,
  layers: RibbonLayers,
  out: RibbonArrays,
  cursor: Cursor,
): void {
  if ((cursor.vertex + 4) * 3 > out.position.length) return;
  if (cursor.index + 6 > out.index.length) return;

  for (let axis = 0; axis < 3; axis += 1) DELTA[axis] = ends.target[axis] - ends.source[axis];
  const length = Math.hypot(DELTA[0], DELTA[1], DELTA[2]);

  if (ends.eye === null) {
    const scale = length > 0 ? 1 / length : 0;
    WIDE[0] = -DELTA[2] * scale;
    WIDE[1] = 0;
    WIDE[2] = DELTA[0] * scale;
    turnInto(particle.turn, WIDE, 0);
    for (let axis = 0; axis < 3; axis += 1) WIDE[axis] += particle.local[axis];
  } else {
    for (let axis = 0; axis < 3; axis += 1) TO_EYE[axis] = ends.eye[axis] - ends.source[axis];
    cross(TO_EYE, DELTA, WIDE);
    /* An eye on the line through both ends crosses to nothing, and the four corners land
       on the beam's own axis. */
    if (!unit(WIDE)) sideOf(TO_EYE, WIDE);
  }

  const width = particle.scale[0];
  const fromSource = particle.scale[1];
  const fromTarget = particle.scale[2];
  const tilingU = particle.tiling[particle.tilingAt];
  const tilingV = particle.tiling[particle.tilingAt + 1];
  const across = tilingU > 0 ? width / tilingU : 1;
  const along = tilingV > 0 ? length / tilingV : 1;

  const vertex = cursor.vertex;
  cornerInto(
    out,
    vertex,
    ends.target,
    DELTA,
    -fromTarget,
    WIDE,
    -width / 2,
    0,
    0,
    particle,
    layers,
  );
  cornerInto(
    out,
    vertex + 1,
    ends.target,
    DELTA,
    -fromTarget,
    WIDE,
    width / 2,
    across,
    0,
    particle,
    layers,
  );
  cornerInto(
    out,
    vertex + 2,
    ends.source,
    DELTA,
    fromSource,
    WIDE,
    width / 2,
    across,
    along,
    particle,
    layers,
  );
  cornerInto(
    out,
    vertex + 3,
    ends.source,
    DELTA,
    fromSource,
    WIDE,
    -width / 2,
    0,
    along,
    particle,
    layers,
  );

  out.index[cursor.index] = vertex;
  out.index[cursor.index + 1] = vertex + 1;
  out.index[cursor.index + 2] = vertex + 2;
  out.index[cursor.index + 3] = vertex;
  out.index[cursor.index + 4] = vertex + 2;
  out.index[cursor.index + 5] = vertex + 3;

  cursor.vertex += 4;
  cursor.index += 6;
}

/**
 * One corner of a beam: `end + delta * share + wide * half`, mirrored, with its uvs and tint.
 *
 * Each layer's transform runs on the corner's place along the beam and then across it, and
 * the result lands transposed, so the texture's `v` runs along the beam as `u` scrolls it.
 */
function cornerInto(
  out: RibbonArrays,
  vertex: number,
  end: Point,
  delta: Float32Array,
  share: number,
  wide: Float32Array,
  half: number,
  across: number,
  along: number,
  particle: BeamParticle,
  layers: RibbonLayers,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    CORNER[axis] = end[axis] + delta[axis] * share + wide[axis] * half;
    out.position[vertex * 3 + axis] = CORNER[axis] * AXIS_SIGN[axis];
  }
  uvInto(out, vertex, along, across, particle.uv, particle.uvAt, layers.base);
  transposeInto(out.uv, vertex);
  transposeInto(out.alphaUv, vertex);
  if (layers.mult !== null) {
    placedInto(out.multUv, out.multCell, vertex, along, across, particle.multUv, 0, layers.mult);
    transposeInto(out.multUv, vertex);
  }
  for (let channel = 0; channel < 4; channel += 1) {
    out.tint[vertex * 4 + channel] = particle.color[channel];
  }
  out.lookup[vertex * 2] = particle.lookup[0];
  out.lookup[vertex * 2 + 1] = particle.lookup[1];
  out.erode[vertex] = particle.erode;
}

/** Inputs for one source's `VfxPrimitiveCameraSegmentBeam` strip. */
export interface SegmentBuild {
  /** System position plus `mLocalSpaceSourceOffset`, in engine space. */
  readonly source: Point;
  /** System target plus `mLocalSpaceTargetOffset`, in engine space. */
  readonly target: Point;
  /** Camera position, in engine space. */
  readonly eye: Point;
  /**
   * Distance from the system position to its target without the offsets, which scales `v`.
   * Zero if `mTrailMode` is `DEFAULT`.
   */
  readonly reach: number;
  /** `mSegments`: the number of ribs in the beam. */
  readonly segments: number;
  /** Spawn ordinal of each rib's particle within its emitter, one per rib. */
  readonly ordinal: Uint32Array;
  readonly layers: RibbonLayers;
}

/** Scratch UV transform for one rib: no rotation or scale, the particle's offset and cell. */
const RIB_UV = new Float32Array(UV_STRIDE);

/**
 * Writes one source's segment beam from `cursor` and advances the cursor.
 *
 * `held` holds one rib per particle, newest first, and each `position` is the particle's
 * position relative to the system. A rib's centre is `lerp(source, target, ordinal /
 * (segments - 1))` plus that position, so the beam bends when its particles move. A rib is
 * `scale0.x` wide, perpendicular to the beam and to the view direction. Skips a rib whose
 * ordinal is at least `segments`. Joins a rib to the previous rib if its ordinal is lower.
 * Writes nothing if the arrays have no room for every rib.
 *
 * `u` spans the width divided by `mBirthTilingSize.y`, and `v` is the rib's distance along
 * `reach` divided by `mBirthTilingSize.x`. Both add the particle's UV offset and ignore its
 * rotation and scale. Writes an erosion drive of zero, and writes the colour lookup pair to
 * the mult layer's UV (`VfxForceFields_AndRibbonColour.md` section 5.3).
 */
export function writeSegmentBeam(
  held: Strand,
  build: SegmentBuild,
  out: RibbonArrays,
  cursor: Cursor,
): void {
  const ribs = held.count;
  if ((cursor.vertex + ribs * 2) * 3 > out.position.length) return;
  if (cursor.index + Math.max(ribs - 1, 0) * 6 > out.index.length) return;

  for (let axis = 0; axis < 3; axis += 1) {
    DELTA[axis] = build.target[axis] - build.source[axis];
    TO_EYE[axis] = build.eye[axis] - build.source[axis];
  }
  cross(DELTA, TO_EYE, WIDE);
  if (!unit(WIDE)) sideOf(TO_EYE, WIDE);

  const last = build.segments - 1;
  let emitted = 0;
  let previous = 0;
  for (let at = 0; at < ribs; at += 1) {
    const ordinal = build.ordinal[at];
    if (ordinal >= build.segments) continue;

    const share = last > 0 ? ordinal / last : 0;
    for (let axis = 0; axis < 3; axis += 1) {
      CORNER[axis] = build.source[axis] + DELTA[axis] * share + held.position[at * 3 + axis];
    }

    const width = held.width[at];
    const tilingAlong = held.tiling[at * 2];
    const tilingAcross = held.tiling[at * 2 + 1];
    const v = tilingAlong > 0 ? (build.reach * share) / tilingAlong : 0;
    const span = tilingAcross > 0 ? width / tilingAcross : tilingAcross === 0 ? 1 : -tilingAcross;

    const vertex = cursor.vertex + emitted * 2;
    ribInto(out, vertex, -width / 2, 0.5 - span / 2, v, held, at, build.layers);
    ribInto(out, vertex + 1, width / 2, 0.5 + span / 2, v, held, at, build.layers);

    if (emitted > 0 && ordinal < previous) {
      out.index[cursor.index] = vertex;
      out.index[cursor.index + 1] = vertex - 2;
      out.index[cursor.index + 2] = vertex - 1;
      out.index[cursor.index + 3] = vertex;
      out.index[cursor.index + 4] = vertex - 1;
      out.index[cursor.index + 5] = vertex + 1;
      cursor.index += 6;
    }

    emitted += 1;
    previous = ordinal;
  }

  cursor.vertex += emitted * 2;
}

/** Writes one rib vertex at `CORNER + WIDE * along`, mirrored into viewport space, with its UVs and tint. */
function ribInto(
  out: RibbonArrays,
  vertex: number,
  along: number,
  u: number,
  v: number,
  held: Strand,
  at: number,
  layers: RibbonLayers,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    out.position[vertex * 3 + axis] = (CORNER[axis] + WIDE[axis] * along) * AXIS_SIGN[axis];
  }

  const from = at * UV_STRIDE;
  RIB_UV.set([0, 1, 1], 0);
  RIB_UV.set(held.uv.subarray(from + 3, from + UV_STRIDE), 3);
  uvInto(out, vertex, u, v, RIB_UV, 0, layers.base);
  if (layers.mult !== null) {
    out.multUv[vertex * 2] = held.lookup[at * 2];
    out.multUv[vertex * 2 + 1] = held.lookup[at * 2 + 1];
    out.multCell[vertex * 2] = 0;
    out.multCell[vertex * 2 + 1] = 0;
  }

  for (let channel = 0; channel < 4; channel += 1) {
    out.tint[vertex * 4 + channel] = held.color[at * 4 + channel];
  }
  out.lookup[vertex * 2] = held.lookup[at * 2];
  out.lookup[vertex * 2 + 1] = held.lookup[at * 2 + 1];
  out.erode[vertex] = 0;
}

/** The two components of one vertex's pair swapped in place. */
function transposeInto(pairs: Float32Array, vertex: number): void {
  const first = pairs[vertex * 2];
  pairs[vertex * 2] = pairs[vertex * 2 + 1];
  pairs[vertex * 2 + 1] = first;
}

/** `a x b` into `out`. */
function cross(a: ArrayLike<number>, b: ArrayLike<number>, out: Float32Array): void {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

/**
 * Any unit direction across `view`, for a strand that gives none of its own.
 *
 * Built on whichever world axis `view` leans on least, so the cross has length to
 * normalise. A quad on it is edge-on to the eye, which is what the case looks like.
 */
function sideOf(view: ArrayLike<number>, out: Float32Array): void {
  const x = Math.abs(view[0]);
  const y = Math.abs(view[1]);
  const z = Math.abs(view[2]);

  AXIS.fill(0);
  AXIS[x <= y && x <= z ? 0 : y <= z ? 1 : 2] = 1;
  cross(view, AXIS, out);
  if (!unit(out)) out.set(AXIS);
}

/** `vector` brought to unit length in place, and false for one with no length to bring. */
function unit(vector: Float32Array): boolean {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) return false;
  vector[0] /= length;
  vector[1] /= length;
  vector[2] /= length;
  return true;
}

/** The geometry ribbons are drawn from, and the arrays a frame writes into it. */
export interface RibbonBuffers {
  readonly geometry: BufferGeometry;
  /** The triangle geometry's own edges, as line segments sharing every vertex attribute object. */
  readonly edgeGeometry: BufferGeometry;
  readonly arrays: RibbonArrays;
  readonly position: BufferAttribute;
  readonly uv: BufferAttribute;
  readonly alphaUv: BufferAttribute;
  readonly cell: BufferAttribute;
  readonly tint: BufferAttribute;
  readonly lookup: BufferAttribute;
  readonly erode: BufferAttribute;
  readonly multUv: BufferAttribute;
  readonly multCell: BufferAttribute;
  readonly index: BufferAttribute;
  readonly edges: BufferAttribute;
  /** The index as the GPU last took it, which the next commit compares the write against. */
  readonly shadow: Uint32Array;
  /** How much of the index the GPU last took, and -1 before it took any. */
  readonly taken: { index: number };
}

/** Buffers holding room for `vertices` vertices of ribbon and the triangles joining them. */
export function ribbonBuffers(vertices: number): RibbonBuffers {
  const triangles = Math.max(vertices - 2, 0);
  const arrays: RibbonArrays = {
    position: new Float32Array(vertices * 3),
    uv: new Float32Array(vertices * 2),
    alphaUv: new Float32Array(vertices * 2),
    cell: new Float32Array(vertices * 2),
    tint: new Float32Array(vertices * 4),
    lookup: new Float32Array(vertices * 2),
    erode: new Float32Array(vertices),
    multUv: new Float32Array(vertices * 2),
    multCell: new Float32Array(vertices * 2),
    index: new Uint32Array(triangles * 3),
    edges: new Uint32Array(triangles * 3 * 2),
  };
  const position = new BufferAttribute(arrays.position, 3);
  const uv = new BufferAttribute(arrays.uv, 2);
  const alphaUv = new BufferAttribute(arrays.alphaUv, 2);
  const cell = new BufferAttribute(arrays.cell, 2);
  const tint = new BufferAttribute(arrays.tint, 4);
  const lookup = new BufferAttribute(arrays.lookup, 2);
  const erode = new BufferAttribute(arrays.erode, 1);
  const multUv = new BufferAttribute(arrays.multUv, 2);
  const multCell = new BufferAttribute(arrays.multCell, 2);
  const index = new BufferAttribute(arrays.index, 1);
  const edges = new BufferAttribute(arrays.edges, 1);
  const written = { position, uv, alphaUv, cell, tint, lookup, erode, multUv, multCell };

  const geometry = new BufferGeometry();
  const edgeGeometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(written)) {
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
    edgeGeometry.setAttribute(name, attribute);
  }
  index.setUsage(DynamicDrawUsage);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);

  edges.setUsage(DynamicDrawUsage);
  edgeGeometry.setIndex(edges);
  edgeGeometry.setDrawRange(0, 0);

  return {
    geometry,
    edgeGeometry,
    arrays,
    ...written,
    index,
    edges,
    shadow: new Uint32Array(arrays.index.length),
    taken: { index: -1 },
  };
}

/**
 * What a frame wrote up to `cursor`, handed to the GPU as this frame's draw.
 *
 * Only the written range of each attribute is uploaded. The index is uploaded only where
 * it differs from the one the GPU holds, because three rebuilds its wireframe index from
 * scratch on every version of it, and the edge twin's own index is rebuilt and uploaded
 * beside it for the same reason. A shared edge is written from each of its two triangles
 * and so drawn twice, the trade accepted for a twin that costs nothing where the index
 * does not change.
 */
export function commitRibbon(buffers: RibbonBuffers, cursor: Cursor): void {
  const vertices = cursor.vertex;
  if (vertices > 0) {
    written(buffers.position, vertices);
    written(buffers.uv, vertices);
    written(buffers.alphaUv, vertices);
    written(buffers.cell, vertices);
    written(buffers.tint, vertices);
    written(buffers.lookup, vertices);
    written(buffers.erode, vertices);
    written(buffers.multUv, vertices);
    written(buffers.multCell, vertices);
  }

  const { index, edges, shadow, taken } = buffers;
  const count = cursor.index;
  if (taken.index !== count || !sameIndex(buffers.arrays.index, shadow, count)) {
    shadow.set(buffers.arrays.index.subarray(0, count));
    taken.index = count;
    if (count > 0) {
      written(index, count);
      writeEdges(buffers.arrays.index, buffers.arrays.edges, count);
      written(edges, count * 2);
    }
  }
  buffers.geometry.setDrawRange(0, count);
  buffers.edgeGeometry.setDrawRange(0, count * 2);
}

/** Each triangle's three edges of `index`, `a b, b c, c a`, written into `edges`. */
function writeEdges(index: Uint32Array, edges: Uint32Array, count: number): void {
  for (let at = 0; at < count; at += 3) {
    const a = index[at];
    const b = index[at + 1];
    const c = index[at + 2];
    const out = at * 2;
    edges[out] = a;
    edges[out + 1] = b;
    edges[out + 2] = b;
    edges[out + 3] = c;
    edges[out + 4] = c;
    edges[out + 5] = a;
  }
}

/** The first `count` entries of `index` are the ones `shadow` holds. */
function sameIndex(index: Uint32Array, shadow: Uint32Array, count: number): boolean {
  for (let at = 0; at < count; at += 1) {
    if (index[at] !== shadow[at]) return false;
  }
  return true;
}
