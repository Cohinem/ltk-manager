import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { Mesh } from "three";

import type { EmitterModel } from "../../engine/model/model";
import {
  age01,
  appearance,
  type DrawFrame,
  drawnPlace,
  drawnPlaceInto,
  frameOf,
  particleBasisInto,
  type Source,
} from "../../engine/simulation/particleRead";
import { FRAME_SLOTS } from "../../engine/simulation/pool";
import { multiplyInto } from "../../engine/utils/basis";
import type { EmitterSamplers } from "../hooks/useVfxTextures";
import { fragmentTests } from "../utils/blend";
import { projectionBuffers, QUADS_PER_EMITTER, written } from "../utils/buffers";
import { colorLookupInto } from "../utils/colorLookup";
import { drawsAsProjection } from "../utils/drawKind";
import { bucketRange, bucketsOf, renderStamp } from "../utils/emitterBuckets";
import { projectionMaterial } from "../utils/materials";
import { type Footprint, footprintInto, modulateInto } from "../utils/projection";
import { DrawPair, showPair, useDrawPair } from "./drawPair";

/** Scratch the appearance pass writes into, reused across every particle of a frame. */
const DRAWN = { scale: new Float32Array(3), color: new Float32Array(4) };
const MODULATE = new Float32Array(4);
const LOOKUP = new Float32Array(2);
const BASIS = new Float32Array(FRAME_SLOTS);
const PLACED = drawnPlace();
const FOOTPRINT: Footprint = { halfWidth: 0, halfHeight: 0, turn: 0 };

export interface ProjectionsProps {
  emitter: EmitterModel;
  /** Every system whose pool holds this emitter's particles, as `Quads` reads them. */
  sources: readonly Source[];
  samplers: EmitterSamplers;
  /** Where the emitter falls in the system's draw order, from `drawRanks`. */
  rank: number;
  hidden: boolean;
  /** How many particles the buffers hold. */
  room?: number;
}

/**
 * One emitter's particles as planar projections: a decal per particle, laid on the ground
 * under it.
 *
 * The engine redraws the map's triangles under the footprint through `UNLIT_DECAL`. The
 * preview's ground is flat, so each decal is the footprint itself, one quad at the ground's
 * height. The decal shader has no game-shader route, so the hand-written material always
 * draws. "Planar projection" in docs/plans/vfx-particle-renderer.md.
 */
export function Projections({
  emitter,
  sources,
  samplers,
  rank,
  hidden,
  room = QUADS_PER_EMITTER,
}: ProjectionsProps) {
  const buffers = useMemo(() => projectionBuffers(room), [room]);
  const material = useMemo(
    () => projectionMaterial(emitter, samplers.base, samplers.color, fragmentTests(emitter)),
    [emitter, samplers],
  );

  useEffect(() => () => buffers.geometry.dispose(), [buffers]);

  const pair = useDrawPair<Mesh>(material, false);
  const drawn = !hidden && !emitter.disabled && drawsAsProjection(emitter);

  useFrame((state) => {
    if (!drawn) {
      buffers.geometry.instanceCount = 0;
      showPair(pair, false);
      return;
    }

    const stamp = renderStamp(state.gl);
    let held = 0;
    for (const source of sources) {
      const frame = frameOf(source, emitter);
      const buckets = bucketsOf(source.pool, stamp);
      const [first, last] = bucketRange(buckets, emitter.index);
      for (let listed = first; listed < last && held < room; listed += 1) {
        write(source, frame, emitter, buckets.order[listed], held, buffers);
        held += 1;
      }
    }

    if (held > 0) {
      for (const attribute of [buffers.center, buffers.footprint, buffers.color, buffers.lookup]) {
        written(attribute, held);
      }
    }
    buffers.geometry.instanceCount = held;
    showPair(pair, held > 0);
  });

  return <DrawPair pair={pair} geometry={buffers.geometry} material={material} rank={rank} />;
}

/** The decal of the particle at `at` into slot `instance`. */
function write(
  source: Source,
  frame: DrawFrame,
  emitter: EmitterModel,
  at: number,
  instance: number,
  buffers: ReturnType<typeof projectionBuffers>,
): void {
  const pool = source.pool;
  const time = frame.now;
  appearance(pool, at, emitter, time, DRAWN);

  drawnPlaceInto(pool, at, frame, PLACED);
  particleBasisInto(pool, at, emitter, frame, BASIS);
  if (PLACED.orbited) multiplyInto(PLACED.turn, BASIS, BASIS);
  footprintInto(emitter, pool, at, time, DRAWN.scale, BASIS, FOOTPRINT);
  modulateInto(emitter, DRAWN.color, MODULATE);
  colorLookupInto(emitter, pool, at, age01(pool, at, time), LOOKUP, 0);

  (buffers.center.array as Float32Array).set(PLACED.place, instance * 3);
  const footprints = buffers.footprint.array as Float32Array;
  footprints[instance * 3] = FOOTPRINT.halfWidth;
  footprints[instance * 3 + 1] = FOOTPRINT.halfHeight;
  footprints[instance * 3 + 2] = FOOTPRINT.turn;
  (buffers.color.array as Float32Array).set(MODULATE, instance * 4);
  (buffers.lookup.array as Float32Array).set(LOOKUP, instance * 2);
}
