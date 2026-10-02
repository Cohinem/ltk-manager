import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";

import type { Pose, SceneClock } from "@/modules/viewport";

import type { SystemModel } from "../../vfx/engine/model/model";
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
}

/**
 * One particle event of the playing clip, spawned on its joint when its frame comes.
 *
 * The driver follows the scene's clock past the cue, so a seek across the cue replays it
 * and the pass starting over stands the system down until it fires again. Before it
 * fires the group is hidden rather than unmounted, so the textures and the pool are
 * built once.
 */
export function ClipEffect({ cue, system, pose, clock, scale, duration }: ClipEffectProps) {
  const drawn = useMemo(() => drawnEmitters(system, true), [system]);
  const rig = useMemo(() => cueRig(pose, cue, scale), [pose, cue, scale]);
  const { textures, meshes, driver } = useParticleSystem(system, drawn, CUE_SEED, rig);
  const followed = useMemo(following, []);
  const group = useRef<Group>(null);

  /* The frame callback runs before the draw, so the group is hidden before it is first drawn. */
  useFrame(() => {
    const fired = followCue(driver, clock, followed, cue.at, duration);
    if (group.current !== null) group.current.visible = fired;
  });

  return (
    <group ref={group}>
      <VfxSystem drawn={drawn} driver={driver} textures={textures} meshes={meshes} />
    </group>
  );
}
