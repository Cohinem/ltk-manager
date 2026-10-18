import { useFrame } from "@react-three/fiber";
import { Fragment, memo, startTransition, useEffect, useMemo, useState } from "react";
import { Frustum, Matrix4, Sphere, Vector3 } from "three";

import type { BinDocumentId, MapParticle } from "@/lib/tauri";
import { AXIS_SIGN, KeepFrames, ShownGroup } from "@/modules/viewport";

import type { SystemModel } from "../../vfx/engine/model/model";
import type { Joints } from "../../vfx/engine/model/rig";
import { capacityOf } from "../../vfx/engine/simulation/childPool";
import { createDriver, type Driver } from "../../vfx/engine/simulation/driver";
import type { Source } from "../../vfx/engine/simulation/particleRead";
import { ShimmerMeshDraws, useShimmerMeshes } from "../../vfx/rendering/components/ShimmerMeshes";
import { useMeshJoints, VfxSystem } from "../../vfx/rendering/components/VfxSystem";
import { useEmissionSurfaces } from "../../vfx/rendering/hooks/useEmissionSurfaces";
import { type EmitterMeshes, useVfxMeshes } from "../../vfx/rendering/hooks/useVfxMeshes";
import { useVfxTextures, type VfxTextures } from "../../vfx/rendering/hooks/useVfxTextures";
import { QUADS_PER_EMITTER } from "../../vfx/rendering/utils/buffers";
import { type DrawnEmitter, drawnEmitters } from "../../vfx/rendering/utils/definitions";
import type { ShimmerMesh } from "../../vfx/rendering/utils/shimmerMeshes";
import type { MapParticleGroup } from "../hooks/useMapParticles";
import { particleOrigin, particleRig, particleSeed, stepEnd } from "../utils/mapParticles";
import { placeableKey } from "../utils/placeables";

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

/* `useFrame` runs the lowest priority first: the frustum, then each placement's run, then the
   sources a system's draw reads, then the draws at the default priority. */
const SEE_FIRST = -3;
const RUN_PLACEMENTS = -2;
const GATHER_SOURCES = -1;

/** What the camera sees this frame, which every placed system asks rather than builds. */
const SEEN = new Frustum();
const PROJECTION = new Matrix4();

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
  }, SEE_FIRST);
  const mounted = useStaggeredGroups(groups);

  return mounted.map((group) => <SystemPlacements key={group.entry} group={group} />);
}

/**
 * Returns the first of `groups` that have joined the scene, which grow by about
 * `PLACEMENTS_PER_FRAME` placements a frame until every group is in.
 *
 * Summoner's Rift places 453 systems, and mounting them in one commit blocks the frame for
 * seconds, so the map and its textures wait behind them. A step is a transition, so a frame
 * that the map needs comes first.
 */
function useStaggeredGroups(groups: readonly MapParticleGroup[]): readonly MapParticleGroup[] {
  const [count, setCount] = useState(() => stepEnd(groups, 0));

  useEffect(() => {
    if (count >= groups.length) return;

    const frame = requestAnimationFrame(() =>
      startTransition(() => setCount((held) => stepEnd(groups, held))),
    );
    return () => cancelAnimationFrame(frame);
  }, [count, groups]);

  return count >= groups.length ? groups : groups.slice(0, count);
}

/**
 * One system's textures and meshes, loaded once for all of its placements on the map, with the
 * particles of each placement at the frame's time.
 *
 * Every placement runs its own simulation, and one draw per emitter reads the pools of every
 * placement in view, so a system placed sixty times costs one draw rather than sixty.
 */
const SystemPlacements = memo(function SystemPlacements({
  group,
}: {
  readonly group: MapParticleGroup;
}) {
  const drawn = useMemo(() => drawnEmitters(group.system), [group.system]);
  const textures = useVfxTextures(drawn);
  const meshes = useVfxMeshes(drawn);
  const joints = useMeshJoints(meshes);
  const shimmer = useShimmerMeshes(group.document, group.entry);
  const runs = useMemo(() => placementRuns(), []);
  /* The particle capacity of one placement, and of all placements together for the shared draw. */
  const room = useMemo(() => capacityOf(group.system), [group.system]);
  const sharedRoom = Math.min(QUADS_PER_EMITTER, room * group.particles.length);

  /* A system of sounds alone draws nothing, and Summoner's Rift stands 131 of them. */
  if (drawn.length === 0 && shimmer.length === 0) return null;

  return (
    <>
      {drawn.length > 0 && (
        <SharedDraw
          drawn={drawn}
          textures={textures}
          meshes={meshes}
          runs={runs}
          room={sharedRoom}
        />
      )}
      {group.particles.map((particle) => (
        <Fragment key={placeableKey(particle)}>
          {drawn.length > 0 && (
            <PlacedRun
              particle={particle}
              system={group.system}
              drawn={drawn}
              joints={joints}
              room={room}
              runs={runs}
            />
          )}
          {shimmer.length > 0 && (
            <PlacedMeshes particle={particle} document={group.document} meshes={shimmer} />
          )}
          {/* A shimmer mesh moves with the frame's time and is not culled. */}
          {shimmer.length > 0 && <KeepFrames />}
        </Fragment>
      ))}
    </>
  );
});

/** The runs of one system's placements, and the sources its shared draw reads from them. */
interface PlacementRuns {
  /** Each placement's driver, and whether the camera saw it this frame. */
  readonly seen: Map<Driver, boolean>;
  /** The sources of each emitter path, refilled every frame from the drivers in view. */
  readonly sources: Map<string, Source[]>;
  /** Hidden while no placement is in view, so the draws skip the matrix update. */
  readonly shown: ShownGroup;
  readonly sourcesOf: (path: string) => readonly Source[];
}

function placementRuns(): PlacementRuns {
  const sources = new Map<string, Source[]>();
  return {
    seen: new Map(),
    sources,
    shown: new ShownGroup(),
    sourcesOf: (path) => {
      let list = sources.get(path);
      if (list === undefined) {
        list = [];
        sources.set(path, list);
      }
      return list;
    },
  };
}

/** Refills the sources of every emitter path from the drivers the camera saw this frame. */
function gatherSources(runs: PlacementRuns): void {
  let anySeen = false;
  for (const [path, list] of runs.sources) {
    list.length = 0;
    for (const [driver, seen] of runs.seen) {
      if (!seen) continue;

      anySeen = true;
      if (path === "") {
        list.push(driver);
      } else {
        list.push(...driver.sources(path));
      }
    }
  }
  runs.shown.visible = anySeen;
}

interface SharedDrawProps {
  readonly drawn: readonly DrawnEmitter[];
  readonly textures: VfxTextures;
  readonly meshes: EmitterMeshes;
  readonly runs: PlacementRuns;
  readonly room: number;
}

/** The emitters of one system drawn once from the pools of every placement in view. */
function SharedDraw({ drawn, textures, meshes, runs, room }: SharedDrawProps) {
  useFrame(() => gatherSources(runs), GATHER_SOURCES);

  return (
    <primitive object={runs.shown}>
      <VfxSystem
        drawn={drawn}
        sourcesOf={runs.sourcesOf}
        textures={textures}
        meshes={meshes}
        room={room}
        drawOnly
      />
    </primitive>
  );
}

/** The engine's mirror, which a placement's transform is conjugated by to stand in the scene. */
const MIRROR = new Matrix4().makeScale(...AXIS_SIGN);

/** Shimmer meshes under the placement `particle`, its transform carried into the scene's space. */
function PlacedMeshes({
  particle,
  document,
  meshes,
}: {
  particle: MapParticle;
  document: BinDocumentId;
  meshes: readonly ShimmerMesh[];
}) {
  const matrix = useMemo(() => {
    const placed = new Matrix4().fromArray(particle.transform.map((each) => each ?? 0));
    return MIRROR.clone().multiply(placed).multiply(MIRROR);
  }, [particle.transform]);

  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <ShimmerMeshDraws document={document} meshes={meshes} />
    </group>
  );
}

interface PlacedRunProps {
  readonly particle: MapParticle;
  readonly system: SystemModel;
  readonly drawn: readonly DrawnEmitter[];
  readonly joints: ReadonlyMap<string, Joints>;
  /** How many particles the placement's pool holds. */
  readonly room: number;
  readonly runs: PlacementRuns;
}

/** One placement's simulation, which steps only while the camera sees it. */
function PlacedRun({ particle, system, drawn, joints, room, runs }: PlacedRunProps) {
  /* Room for what the system's own rates ask rather than the shell's pool, which is
     eight megabytes a driver, and no checkpoints, since nothing seeks a map's fire. */
  const driver = useMemo(
    () =>
      createDriver(particleSeed(particle.name), {
        capacity: room,
        seekable: false,
      }),
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
  useEmissionSurfaces(drawn, driver);

  useEffect(() => {
    driver.swap(system);
  }, [driver, system]);

  useEffect(() => {
    driver.steer(rig);
  }, [driver, rig]);

  useEffect(() => {
    driver.setMeshJoints(joints);
  }, [driver, joints]);

  useEffect(() => {
    runs.seen.set(driver, false);
    return () => {
      runs.seen.delete(driver);
    };
  }, [runs, driver]);

  useFrame(({ invalidate }, delta) => {
    const inView = SEEN.intersectsSphere(reach);
    runs.seen.set(driver, inView);
    if (!inView) return;

    driver.advance(Math.min(delta, LONGEST_STEP));
    /* A system in view moves every frame, so it keeps an on-demand viewport drawing. */
    invalidate();
  }, RUN_PLACEMENTS);

  return null;
}
