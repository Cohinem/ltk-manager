import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";

import type { Pose, SceneClock } from "@/modules/viewport";

import type { SoundOutput } from "../../../audio/utils/soundFollower";
import type { SystemModel } from "../../vfx/engine/model/model";
import { createRunSound } from "../../vfx/playback/utils/runSound";
import { VfxSystem } from "../../vfx/rendering/components/VfxSystem";
import { useParticleSystem } from "../../vfx/rendering/hooks/useParticleSystem";
import { drawnEmitters } from "../../vfx/rendering/utils/definitions";
import type { ParticleCue } from "../utils/clipEvents";
import { followCue, following } from "../utils/follow";
import { cueRig } from "../utils/skinScene";

/** The seed every particle event runs on, so two readers of one clip see the same run. */
const CUE_SEED = 7331;

export interface ClipEffectProps {
  readonly cue: ParticleCue;
  readonly system: SystemModel;
  readonly pose: Pose;
  readonly clock: SceneClock;
  /** `skinScale`, which carries the joint the system rides. */
  readonly scale: number;
  /** Seconds one pass of the pose lasts, which the cue fires once in. */
  readonly duration: number;
  /** Where the system's sounds play, and null while the viewport's sound is off. */
  readonly sound: SoundOutput | null;
}

/**
 * One particle event of the playing clip, spawned on its joint when its frame comes.
 *
 * The driver follows the scene's clock past the cue, so a seek across the cue replays it
 * and the pass starting over stands the system down until it fires again. Before it
 * fires the group is hidden rather than unmounted, so the textures and the pool are
 * built once.
 *
 * The system's sounds play on the driver's events, under the cue's key. A jump of the clock that
 * moves the run, and the system standing down, stop them. Per "VFX sound" in docs/ux/AUDIO.md.
 */
export function ClipEffect({ cue, system, pose, clock, scale, duration, sound }: ClipEffectProps) {
  const drawn = useMemo(() => drawnEmitters(system, true), [system]);
  const rig = useMemo(() => cueRig(pose, cue, scale), [pose, cue, scale]);
  const { textures, meshes, driver } = useParticleSystem(system, drawn, CUE_SEED, rig);
  const followed = useMemo(following, []);
  const group = useRef<Group>(null);
  const heard = useMemo(
    () => (sound === null ? null : createRunSound(sound, `${cue.key}/`)),
    [sound, cue.key],
  );
  useEffect(() => () => heard?.stop(), [heard]);

  /* The frame callback runs before the draw, so the group is hidden before it is first drawn. */
  useFrame(() => {
    const generation = followed.generation;
    const time = driver.time;
    const events = followCue(driver, clock, followed, cue.at, duration);
    if (group.current !== null) group.current.visible = events !== null;

    if (heard === null) return;
    if (events === null || (followed.generation !== generation && driver.time !== time)) {
      heard.stop();
      return;
    }
    heard.hear(system, events);
  });

  return (
    <group ref={group}>
      <VfxSystem drawn={drawn} driver={driver} textures={textures} meshes={meshes} />
    </group>
  );
}
