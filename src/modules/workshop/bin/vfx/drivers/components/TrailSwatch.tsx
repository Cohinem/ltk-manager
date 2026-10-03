import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { PerspectiveCamera as Camera } from "three";

import { whiteTexel } from "@/modules/viewport";

import { QUAD_TYPE } from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import { constant } from "../../engine/parsing/readValue";
import type { Source } from "../../engine/simulation/particleRead";
import { createPool } from "../../engine/simulation/pool";
import { useVfxRun } from "../../playback/state/run";
import { Trails } from "../../rendering/components/Trails";
import {
  type EmitterSamplers,
  samplersOf,
  useVfxTextures,
} from "../../rendering/hooks/useVfxTextures";
import { drawnFor } from "../../rendering/utils/definitions";
import { PARTICLE_LAYER } from "../../rendering/utils/frame";
import { useBackdropColor } from "../state/previewBackdrop";
import { SWATCH_POINTS, swatchInto, swatchMeasure, swatchWarmth } from "../utils/trailSwatch";
import { PREVIEW_MIP_WIDTH, ViewGuard } from "./EmitterPreview";
import type { Shown } from "./SurfacePreview";

/** A narrow lens, so the camera stands far back and the flat ribbon reads as a drawing. */
export const SWATCH_FOV = 20;

/** The camera's distance as a factor of the one that holds the swatch's frame whole. */
const MARGIN = 1.1;

const ORIGIN: Point = [0, 0, 0];
const UPRIGHT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const STILL = constant([0, 0, 0]);

/* Before the trail's own frame callback strings the pool, at the default of 0. */
const BEFORE_THE_TRAIL = -1;

/**
 * A trail emitter's ribbon laid flat on a figure eight, seen head on, for a node's preview.
 *
 * The points come from `swatchInto` rather than the run, and the ribbon draws through the
 * viewport's own `Trails`, so its texture, width, colour, erosion and blend are the
 * viewport's. The ribbon faces the camera whatever its quad type, and neither the world
 * acceleration nor the cutoff reaches it, since both are lengths of a path the swatch
 * does not keep. The clock runs while the run plays, at its speed.
 */
export function TrailSwatch({ emitter, shown }: { emitter: EmitterModel; shown: Shown }) {
  const run = useVfxRun();
  const backdrop = useBackdropColor();
  const drawn = useMemo(
    () => (run.system === null ? [] : drawnFor(run.system, emitter)),
    [run.system, emitter],
  );
  const textures = useVfxTextures(drawn, undefined, PREVIEW_MIP_WIDTH);
  const flat = useMemo(() => flatTrail(emitter), [emitter]);
  const measure = useMemo(() => swatchMeasure(emitter), [emitter]);
  const source = useMemo<Mutable<Source>>(
    () => ({
      pool: createPool(SWATCH_POINTS),
      time: 0,
      elapsed: 0,
      origin: ORIGIN,
      target: ORIGIN,
      orientation: UPRIGHT,
    }),
    [],
  );
  const sources = useMemo(() => [source], [source]);
  const clock = useRef(swatchWarmth(measure));

  useFrame((state, delta) => {
    if (run.playing) clock.current += delta * run.speed;

    source.time = clock.current;
    source.elapsed = run.driver.elapsed;
    swatchInto(source.pool, flat, measure, source.time, run.pinned);
    stand(state.camera as Camera, measure.halfWidth, measure.halfHeight);
  }, BEFORE_THE_TRAIL);

  const entry = drawn[0];
  return (
    <>
      <color attach="background" args={[backdrop]} />
      <ViewGuard />
      <PerspectiveCamera
        makeDefault
        fov={SWATCH_FOV}
        onUpdate={(camera) => camera.layers.enable(PARTICLE_LAYER)}
      />
      {entry !== undefined && (
        <Trails
          emitter={flat}
          sources={sources}
          samplers={layersShown(samplersOf(textures, entry), shown)}
          rank={entry.rank}
          hidden={false}
          document={run.document}
        />
      )}
    </>
  );
}

export type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

/** `samplers` with the layer `shown` leaves out as white, the neutral factor. */
function layersShown(samplers: EmitterSamplers, shown: Shown): EmitterSamplers {
  if (shown === "base") return { ...samplers, mult: samplers.mult && whiteTexel() };
  if (shown === "mult") return { ...samplers, base: whiteTexel() };
  return samplers;
}

/** `emitter` as its swatch draws it: facing the camera, with no acceleration and no cutoff. */
function flatTrail(emitter: EmitterModel): EmitterModel {
  return {
    ...emitter,
    quadType: QUAD_TYPE.cameraTrail,
    worldAcceleration: STILL,
    trail: emitter.trail === null ? null : { ...emitter.trail, cutoff: 0 },
  };
}

/** The camera straight in front of the swatch, far enough to hold its frame whole. */
export function stand(camera: Camera, halfWidth: number, halfHeight: number): void {
  const half = Math.max(halfHeight, halfWidth / (camera.aspect || 1));
  const distance = (half / Math.tan((camera.fov * Math.PI) / 360)) * MARGIN;
  if (camera.position.z === distance) return;

  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
}
