import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { PerspectiveCamera as Camera, Group } from "three";

import { BEAM_MODE } from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import { NO_TRANSFORM } from "../../engine/simulation/integrate";
import type { Source } from "../../engine/simulation/particleRead";
import { createPool } from "../../engine/simulation/pool";
import { useVfxRun } from "../../playback/state/run";
import { Beams } from "../../rendering/components/Beams";
import { samplersOf, useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { drawnFor } from "../../rendering/utils/definitions";
import { seeParticles } from "../../rendering/utils/frame";
import { useBackdropColor } from "../state/previewBackdrop";
import { beamFrame, emittingSource, reachOf } from "../utils/beamSwatch";
import { widestScale } from "../utils/trailSwatch";
import { PREVIEW_MIP_WIDTH, ViewGuard } from "./EmitterPreview";
import { type Mutable, stand, SWATCH_FOV } from "./TrailSwatch";

const UPRIGHT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const NO_OFFSET: Point = [0, 0, 0];

/** The swatch's pool while no system has a particle of the emitter. */
const EMPTY = createPool(0);

/* Before the beams' own frame callback reads the source, at the default of 0. */
const BEFORE_THE_BEAMS = -1;

type Triple = [number, number, number];

/**
 * A beam emitter's beams laid flat across the box, the source on the left and the target on
 * the right, seen head on, for a node's preview.
 *
 * The particles are the run's own at the transport's cursor, from the first system with one,
 * and the beams draw through the viewport's own `Beams`, so their texture, width, colour, uv
 * scroll, erosion and blend are the viewport's. The beam is as long as that
 * system's reach from its origin to its target, so the colour bound to its length and the
 * texture's repeats along it are the ones the viewport draws. A beam longer than `LONGEST`
 * widths is stood up taller rather than drawn shorter, so it reads as more than a line.
 *
 * The width faces the camera whatever the beam's mode, the ends' offsets are left out,
 * since both place the beam in a world the swatch does not keep, and so is the ground
 * layer, which would lay it flat out of sight.
 */
export function BeamSwatch({ emitter }: { emitter: EmitterModel }) {
  const run = useVfxRun();
  const backdrop = useBackdropColor();
  const drawn = useMemo(
    () => (run.system === null ? [] : drawnFor(run.system, emitter)),
    [run.system, emitter],
  );
  const textures = useVfxTextures(drawn, undefined, PREVIEW_MIP_WIDTH);
  const flat = useMemo(() => flatBeam(emitter), [emitter]);
  const width = useMemo(() => widestScale(emitter), [emitter]);
  const ends = useMemo(() => ({ source: [0, 0, 0] as Triple, target: [0, 0, 0] as Triple }), []);
  const source = useMemo<Mutable<Source>>(
    () => ({
      pool: EMPTY,
      time: 0,
      elapsed: 0,
      origin: ends.source,
      target: ends.target,
      orientation: UPRIGHT,
      world: NO_TRANSFORM,
    }),
    [ends],
  );
  const sources = useMemo(() => [source], [source]);
  const stretched = useRef<Group>(null);

  const entry = drawn[0];
  const path = entry?.path ?? "";

  useFrame((state) => {
    const { driver } = run;
    const emitting = emittingSource(path === "" ? [driver] : driver.sources(path), emitter.index);
    const frame = beamFrame(width, emitting === null ? 0 : reachOf(emitting));

    source.pool = emitting?.pool ?? EMPTY;
    source.time = emitting?.time ?? driver.time;
    source.elapsed = emitting?.elapsed ?? driver.elapsed;
    /* The engine's `x` runs right to left on screen, so the source stands at its plus end. */
    ends.source[0] = frame.length / 2;
    ends.target[0] = -frame.length / 2;
    stretched.current?.scale.set(1, frame.stretch, 1);
    stand(state.camera as Camera, frame.halfWidth, frame.halfHeight);
  }, BEFORE_THE_BEAMS);

  return (
    <>
      <color attach="background" args={[backdrop]} />
      <ViewGuard />
      <PerspectiveCamera makeDefault fov={SWATCH_FOV} onUpdate={(camera) => seeParticles(camera)} />
      {entry !== undefined && (
        <group ref={stretched}>
          <Beams
            emitter={flat}
            sources={sources}
            samplers={samplersOf(textures, entry)}
            rank={entry.rank}
            hidden={false}
            document={run.document}
          />
        </group>
      )}
    </>
  );
}

/** `emitter` as its swatch draws it: facing the camera, off the ground layer, with no offsets. */
function flatBeam(emitter: EmitterModel): EmitterModel {
  return {
    ...emitter,
    groundLayer: false,
    beam:
      emitter.beam === null
        ? null
        : {
            ...emitter.beam,
            mode: BEAM_MODE.default,
            sourceOffset: NO_OFFSET,
            targetOffset: NO_OFFSET,
          },
  };
}
