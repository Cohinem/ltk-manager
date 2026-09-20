import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Frustum, Matrix4, Sphere, Vector3 } from "three";

import type { MapParticle } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

import type { SystemModel } from "../../vfx/engine/model/model";
import { capacityOf } from "../../vfx/engine/simulation/childPool";
import { createDriver } from "../../vfx/engine/simulation/driver";
import { VfxSystem } from "../../vfx/rendering/components/VfxSystem";
import { type EmitterMeshes, useVfxMeshes } from "../../vfx/rendering/hooks/useVfxMeshes";
import { useVfxTextures, type VfxTextures } from "../../vfx/rendering/hooks/useVfxTextures";
import { type DrawnEmitter, drawnEmitters } from "../../vfx/rendering/utils/definitions";
import type { MapParticleGroup } from "../hooks/useMapParticles";
import { particleOrigin, particleRig, particleSeed } from "../utils/mapParticles";

/**
 * The longest one frame advances a map's particles by, in seconds.
 *
 * A tab left and come back to hands the frame loop minutes at once, which a system steps
 * through in full.
 */
const LONGEST_STEP = 0.1;

/**
 * How far around where it stands a system is taken to draw, in engine units.
 *
 * A system states no bounds, so this is a waterfall's height with room over it. One the
 * camera holds none of neither steps nor draws.
 */
const SYSTEM_REACH = 1500;

/** `useFrame` runs the lowest priority first, so the frustum is this frame's before a system asks it. */
const BEFORE_THE_SYSTEMS = -1;

/** What the camera sees this frame, which every placed system asks rather than builds. */
const SEEN = new Frustum();
const PROJECTION = new Matrix4();

const NONE_DRAWN = () => true;

export interface MapParticlesProps {
  readonly groups: readonly MapParticleGroup[];
}

/**
 * The particle systems a backdrop's map stands in its scene.
 *
 * Mounted beside the subject rather than under its placement, because a pool holds the
 * map's own space and the draws mirror it as the backdrop's group does. The systems run
 * on the frame's time rather than the scene's clock, since a map's fires burn on through
 * a clip that restarts.
 *
 * Summoner's Rift stands 453 on its default layer, so only what the camera holds steps
 * and draws.
 */
export function MapParticles({ groups }: MapParticlesProps) {
  useFrame(({ camera }) => {
    PROJECTION.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    SEEN.setFromProjectionMatrix(PROJECTION);
  }, BEFORE_THE_SYSTEMS);

  return groups.map((group) => <SystemPlacements key={group.entry} group={group} />);
}

/** One system's textures and meshes, loaded once for every place the map stands it. */
function SystemPlacements({ group }: { readonly group: MapParticleGroup }) {
  const drawn = useMemo(() => drawnEmitters(group.system), [group.system]);
  const textures = useVfxTextures(drawn);
  const meshes = useVfxMeshes(drawn);
  /* A system of sounds alone draws nothing, and Summoner's Rift stands 131 of them. */
  if (drawn.length === 0) return null;
  return group.particles.map((particle) => (
    <PlacedSystem
      key={particle.name}
      particle={particle}
      system={group.system}
      drawn={drawn}
      textures={textures}
      meshes={meshes}
    />
  ));
}

interface PlacedSystemProps {
  readonly particle: MapParticle;
  readonly system: SystemModel;
  readonly drawn: readonly DrawnEmitter[];
  readonly textures: VfxTextures;
  readonly meshes: EmitterMeshes;
}

function PlacedSystem({ particle, system, drawn, textures, meshes }: PlacedSystemProps) {
  /* Room for what the system's own rates ask rather than the shell's pool, which is
     eight megabytes a driver, and no checkpoints, since nothing seeks a map's fire. */
  const room = useMemo(() => capacityOf(system), [system]);
  const driver = useMemo(
    () => createDriver(particleSeed(particle.name), { capacity: room, seekable: false }),
    [particle.name, room],
  );
  const rig = useMemo(() => particleRig(particle), [particle]);
  const reach = useMemo(() => {
    const [x, y, z] = particleOrigin(particle);
    return new Sphere(
      new Vector3(x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]),
      SYSTEM_REACH,
    );
  }, [particle]);
  /* State rather than a ref, because what is hidden is a prop of the draws, and it moves
     as the camera turns rather than every frame. */
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    driver.swap(system);
  }, [driver, system]);

  useEffect(() => {
    driver.steer(rig);
  }, [driver, rig]);

  useFrame((_, delta) => {
    const held = SEEN.intersectsSphere(reach);
    if (held !== seen) setSeen(held);
    if (held) driver.advance(Math.min(delta, LONGEST_STEP));
  });

  return (
    <VfxSystem
      drawn={drawn}
      driver={driver}
      textures={textures}
      meshes={meshes}
      room={room}
      hiddenOf={seen ? undefined : NONE_DRAWN}
    />
  );
}
