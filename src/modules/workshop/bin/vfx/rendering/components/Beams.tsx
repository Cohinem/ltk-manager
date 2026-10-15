import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { LineSegments, Mesh } from "three";

import type { BinDocumentId } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

import { BEAM_MODE, QUAD_TYPE, TRAIL_MODE } from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";
import {
  age01,
  appearance,
  type DrawFrame,
  drawnPlace,
  drawnPlaceInto,
  erosionDrive,
  frameOf,
  particleBasisInto,
  type Source,
} from "../../engine/simulation/particleRead";
import { useParticlePrograms } from "../hooks/useParticlePrograms";
import type { EmitterSamplers } from "../hooks/useVfxTextures";
import { useDrawStencil } from "../state/stencil";
import { fragmentTests, premultiplyInto } from "../utils/blend";
import { colorLookupInto } from "../utils/colorLookup";
import { castsShadow } from "../utils/drawKind";
import { bucketRange, bucketsOf, renderStamp } from "../utils/emitterBuckets";
import { drawLayersOf } from "../utils/frame";
import { ribbonMaterial } from "../utils/materials";
import { sourcesScrollInto } from "../utils/palette";
import { RIBBON_DRAW } from "../utils/particleDraws";
import { writePaletteScroll } from "../utils/particleProgram";
import {
  anchorDistance,
  type BeamEnds,
  beamEndsInto,
  type BeamParticle,
  beamTint,
  commitRibbon,
  type Cursor,
  packUv,
  ribbonBuffers,
  strand,
  UV_STRIDE,
  writeBeam,
  writeSegmentBeam,
} from "../utils/ribbon";
import { type LayerDraws, layersOf } from "../utils/uniforms";
import { uvDraw, uvTransformInto } from "../utils/uvTransform";
import { DrawPair, showPair, useDrawPair, useProgramDraw } from "./drawPair";

/** How many beams one emitter draws across every source, which caps its share of the pools. */
const BEAMS_PER_EMITTER = 256;

/** Maximum ribs in one source's segment beam, two vertices each, which fills the same buffers. */
const RIBS_PER_SOURCE = BEAMS_PER_EMITTER * 2;

/** Scratch the frame reuses, so a draw allocates nothing per particle. */
const DRAWN = { scale: new Float32Array(3), color: new Float32Array(4) };
const UV_DRAWN = uvDraw();
const CURSOR: Cursor = { vertex: 0, index: 0 };
const EYE: [number, number, number] = [0, 0, 0];
const SOURCE: [number, number, number] = [0, 0, 0];
const TARGET: [number, number, number] = [0, 0, 0];
const LOCAL: [number, number, number] = [0, 0, 0];

/** Scratch for one source's segment beam: the ribs, newest first, and their pool indices. */
const STRAND = strand(RIBS_PER_SOURCE);
const ORDINAL = new Uint32Array(RIBS_PER_SOURCE);
const ORDER = new Uint32Array(RIBS_PER_SOURCE);
const PARTICLE: BeamParticle = {
  scale: DRAWN.scale,
  color: DRAWN.color,
  tiling: new Float32Array(2),
  tilingAt: 0,
  turn: new Float32Array(9),
  local: LOCAL,
  uv: new Float32Array(UV_STRIDE),
  uvAt: 0,
  multUv: new Float32Array(UV_STRIDE),
  lookup: new Float32Array(2),
  erode: 1,
};

/** Where one particle draws, in the engine's space, off which its local place is taken. */
const PLACED = drawnPlace();

/** The ramp and the soft fade a ribbon's shader compiles, and neither the rim nor the reflection. */
const DRAWS: LayerDraws = { ramp: true, sheen: false, fade: true };

export interface BeamsProps {
  emitter: EmitterModel;
  /** Every system whose pool holds this emitter's particles, each reaching from its own ends. */
  sources: readonly Source[];
  samplers: EmitterSamplers;
  /** Where the emitter falls in the system's draw order, from `drawRanks`. */
  rank: number;
  hidden: boolean;
  /** The document the system was read from, whose project the game's shaders resolve through. */
  document?: BinDocumentId | null;
}

/**
 * One emitter's beam particles, drawn as ribbon geometry between the system and its target.
 *
 * A `VfxPrimitiveBeam` particle draws one quad between the beam's ends, so every particle
 * draws the same segment with its own colour, `scale0` and UV. A `VfxPrimitiveCameraSegmentBeam`
 * particle draws one rib of a strip, at the share of the beam that its spawn ordinal gives
 * (see `writeSegmentBeam`). `mIsColorBindedWithDistance` multiplies `mAnimatedColorWithDistance`
 * into both kinds.
 *
 * With the game's shaders on, the beams draw through the translated `quad` or `distortion`
 * pair once it is ready, and through the hand-written material until then.
 */
export function Beams({ emitter, sources, samplers, rank, hidden, document = null }: BeamsProps) {
  const beam = emitter.beam;
  const buffers = useMemo(() => ribbonBuffers(BEAMS_PER_EMITTER * 4), []);
  const material = useMemo(
    () =>
      ribbonMaterial(
        emitter.blendMode,
        samplers.base,
        emitter.depthBias,
        layersOf(emitter, samplers, DRAWS),
        fragmentTests(emitter),
      ),
    [emitter, samplers],
  );

  useEffect(
    () => () => {
      buffers.geometry.dispose();
      buffers.edgeGeometry.dispose();
    },
    [buffers],
  );

  const pair = useDrawPair<Mesh | LineSegments>(
    material,
    drawLayersOf(emitter),
    castsShadow(emitter),
  );
  const programs = useParticlePrograms(emitter, samplers, RIBBON_DRAW, buffers.geometry, document);
  useProgramDraw(pair.solid, programs, rank);

  const drawn = !hidden && !emitter.disabled && beam !== null && emitter.mesh === null;
  useDrawStencil(emitter, drawn, material, programs);

  useFrame((state) => {
    if (!drawn || beam === null) {
      buffers.geometry.setDrawRange(0, 0);
      buffers.edgeGeometry.setDrawRange(0, 0);
      showPair(pair, false);
      return;
    }

    const scroll = material.uniforms.paletteScroll.value as number[];
    sourcesScrollInto(emitter, sources, scroll);
    for (const each of programs) writePaletteScroll(each.material, scroll);
    const eye = state.camera.position;
    EYE[0] = eye.x * AXIS_SIGN[0];
    EYE[1] = eye.y * AXIS_SIGN[1];
    EYE[2] = eye.z * AXIS_SIGN[2];

    CURSOR.vertex = 0;
    CURSOR.index = 0;
    const stamp = renderStamp(state.gl);
    const layers = { base: emitter.uv, mult: emitter.multUv };
    const segmented = emitter.quadType === QUAD_TYPE.cameraSegmentBeam;
    let held = 0;
    for (const source of sources) {
      const pool = source.pool;
      const origin = source.origin;
      const frame = frameOf(source, emitter);
      beamEndsInto(source, beam, SOURCE, TARGET);
      const bound = beamTint(source, beam);

      if (segmented) {
        ribsInto(source, emitter, frame, bound, stamp);
        writeSegmentBeam(
          STRAND,
          {
            source: SOURCE,
            target: TARGET,
            eye: EYE,
            reach: beam.trailMode === TRAIL_MODE.default ? 0 : anchorDistance(source),
            segments: Math.trunc(beam.segments),
            ordinal: ORDINAL,
            layers,
          },
          buffers.arrays,
          CURSOR,
        );
        continue;
      }

      const ends: BeamEnds = {
        source: SOURCE,
        target: TARGET,
        eye: beam.mode === BEAM_MODE.arbitrary ? null : EYE,
      };

      const buckets = bucketsOf(pool, stamp);
      const [first, last] = bucketRange(buckets, emitter.index);
      for (let listed = first; listed < last && held < BEAMS_PER_EMITTER; listed += 1) {
        const at = buckets.order[listed];
        held += 1;

        const time = frame.now;
        appearance(pool, at, emitter, time, DRAWN);
        for (let channel = 0; channel < 4; channel += 1)
          DRAWN.color[channel] *= bound[channel] ?? 1;
        premultiplyInto(emitter, DRAWN.color);

        particleBasisInto(pool, at, emitter, frame, PARTICLE.turn);
        drawnPlaceInto(pool, at, frame, PLACED);
        for (let axis = 0; axis < 3; axis += 1) {
          LOCAL[axis] = PLACED.place[axis] - origin[axis];
        }
        PARTICLE.tiling.set(pool.tiling.subarray(at * 2, at * 2 + 2));

        const age = time - pool.birthTime[at];
        const through = age01(pool, at, time);
        uvTransformInto(pool, at, emitter.uv, 0, age, through, time, UV_DRAWN);
        packUv(UV_DRAWN, PARTICLE.uv, 0);
        if (emitter.multUv !== null) {
          uvTransformInto(pool, at, emitter.multUv, 1, age, through, time, UV_DRAWN);
          packUv(UV_DRAWN, PARTICLE.multUv, 0);
        }
        colorLookupInto(emitter, pool, at, through, PARTICLE.lookup, 0);
        PARTICLE.erode = erosionDrive(pool, at, emitter, time);

        writeBeam(ends, PARTICLE, layers, buffers.arrays, CURSOR);
      }
    }
    commitRibbon(buffers, CURSOR);
    showPair(pair, CURSOR.index > 0);
  });

  return (
    <DrawPair
      pair={pair}
      geometry={buffers.geometry}
      material={programs[0]?.material ?? material}
      rank={rank}
      edges={buffers.edgeGeometry}
    />
  );
}

/**
 * Writes the ribs of `emitter` for `source` into `STRAND` and `ORDINAL`, newest first.
 *
 * Each rib holds the particle's position relative to the system, its `scale0.x`, its colour
 * multiplied by `bound`, its tiling, its base UV transform and its colour lookup.
 */
function ribsInto(
  source: Source,
  emitter: EmitterModel,
  frame: DrawFrame,
  bound: readonly number[],
  stamp: number,
): void {
  const pool = source.pool;
  const time = frame.now;

  let held = 0;
  const buckets = bucketsOf(pool, stamp);
  const [first, last] = bucketRange(buckets, emitter.index);
  for (let listed = first; listed < last && held < RIBS_PER_SOURCE; listed += 1) {
    ORDER[held] = buckets.order[listed];
    held += 1;
  }
  ORDER.subarray(0, held).sort((left, right) => pool.serial[right] - pool.serial[left]);

  STRAND.count = held;
  for (let slot = 0; slot < held; slot += 1) {
    const at = ORDER[slot];
    ORDINAL[slot] = pool.ordinal[at];

    appearance(pool, at, emitter, time, DRAWN);
    for (let channel = 0; channel < 4; channel += 1) DRAWN.color[channel] *= bound[channel] ?? 1;
    premultiplyInto(emitter, DRAWN.color);
    STRAND.color.set(DRAWN.color, slot * 4);
    STRAND.width[slot] = DRAWN.scale[0];
    STRAND.tiling.set(pool.tiling.subarray(at * 2, at * 2 + 2), slot * 2);

    drawnPlaceInto(pool, at, frame, PLACED);
    for (let axis = 0; axis < 3; axis += 1) {
      STRAND.position[slot * 3 + axis] = PLACED.place[axis] - source.origin[axis];
    }

    const age = time - pool.birthTime[at];
    const through = age01(pool, at, time);
    uvTransformInto(pool, at, emitter.uv, 0, age, through, time, UV_DRAWN);
    packUv(UV_DRAWN, STRAND.uv, slot * UV_STRIDE);
    colorLookupInto(emitter, pool, at, through, STRAND.lookup, slot * 2);
  }
}
