import { useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BufferGeometry,
  DoubleSide,
  type Group,
  MathUtils,
  type Mesh,
  MeshBasicMaterial,
  type RawShaderMaterial,
  type Texture,
} from "three";

import { useDisposable } from "@/hooks";
import { useAssetVersion, versionedUrl } from "@/lib/assetVersions";
import { previewUrl } from "@/lib/previewUrl";
import type { BinDocumentId } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

import {
  type ShimmerParticle,
  shimmerCapacity,
  shimmerParticles,
} from "../../engine/shimmer/shimmerRun";
import { vfxQueries } from "../../hooks/useVfxSystem";
import { useVfxRun } from "../../playback/state/run";
import { useMeshGeometry } from "../hooks/useMeshGeometry";
import { type PassMaterials, useShimmerPasses } from "../hooks/useShimmerPasses";
import { GLOW_LAYER, PARTICLE_LAYER, useGlowing } from "../utils/frame";
import { type ShimmerMesh, shimmerMeshesOf } from "../utils/shimmerMeshes";
import { acquireTexture } from "../utils/textureCache";

/** Seconds into the system's run, which the particles and the shaders are drawn at. */
export type ShimmerClock = () => number;

/** The seed a caller outside a run evaluates with, so every placement of a system agrees. */
const PLACED_SEED = 1;

/** The emitters are evaluated before any draw of the frame reads them. */
const BEFORE_THE_DRAWS = -1;

/**
 * Every shimmer emitter of the run's system, its particles evaluated at the run's clock.
 *
 * Each draws the `.gmesh`, `.tmesh` or `.scb` its geometry component names, once per live
 * particle, as `shimmerParticles` spawns, moves, scales and tints it. A mesh whose render
 * component embeds a material draws each translated pass of it while the game's shaders are
 * on, and flat until they are ready. A pass writing the engine's bloom target draws it again
 * on the glow layer. Section 4.6 of docs/plans/shimmer-driver-graph.md.
 */
export function ShimmerMeshes({ document, entry }: { document: BinDocumentId; entry: string }) {
  const { driver, seed } = useVfxRun();
  const clock = useCallback(() => driver.elapsed, [driver]);
  return (
    <ShimmerMeshDraws
      document={document}
      meshes={useShimmerMeshes(document, entry)}
      clock={clock}
      seed={seed}
    />
  );
}

/** The shimmer meshes of the system `entry` of `document`, as `shimmerMeshesOf` reads them. */
export function useShimmerMeshes(document: BinDocumentId, entry: string): readonly ShimmerMesh[] {
  const query = useQuery({ ...vfxQueries.system(document, entry), enabled: entry !== "" });
  return useMemo(
    () =>
      query.data === undefined ? NO_MESHES : shimmerMeshesOf(query.data.root, query.data.materials),
    [query.data],
  );
}

const NO_MESHES: readonly ShimmerMesh[] = [];

/**
 * `meshes` drawn in the system's own space, which the caller places, at `clock`, or at the
 * frame's time for a caller without a run.
 */
export function ShimmerMeshDraws({
  document,
  meshes,
  clock,
  seed = PLACED_SEED,
}: {
  document: BinDocumentId;
  meshes: readonly ShimmerMesh[];
  clock?: ShimmerClock;
  seed?: number;
}) {
  return meshes.map((mesh) => (
    <ShimmerMeshDraw
      key={`${mesh.list}:${mesh.index}:${mesh.mesh.path}`}
      document={document}
      mesh={mesh}
      clock={clock}
      seed={seed}
    />
  ));
}

/** The live particles of one emitter, and the time they were evaluated at. */
interface Evaluated {
  particles: readonly ShimmerParticle[];
  time: number;
}

function ShimmerMeshDraw({
  document,
  mesh,
  clock,
  seed,
}: {
  document: BinDocumentId;
  mesh: ShimmerMesh;
  clock: ShimmerClock | undefined;
  seed: number;
}) {
  const geometry = useMeshGeometry(mesh.mesh.asset, mesh.mesh.path);
  const slots = useMemo(() => shimmerCapacity(mesh.components), [mesh.components]);
  const frameClock = useThree((state) => state.clock);
  const evaluated = useRef<Evaluated>({ particles: [], time: 0 });

  useFrame(() => {
    const time = clock?.() ?? frameClock.elapsedTime;
    evaluated.current = {
      particles: shimmerParticles(mesh.components, time, seed + mesh.index),
      time,
    };
  }, BEFORE_THE_DRAWS);

  if (geometry === null) return null;

  return Array.from({ length: slots }, (_, slot) => (
    <ParticleDraw
      key={slot}
      slot={slot}
      document={document}
      mesh={mesh}
      geometry={geometry}
      evaluated={evaluated}
    />
  ));
}

/**
 * The `slot`th live particle of an emitter, hidden while fewer are alive.
 *
 * Each slot keeps its own engine environment, since the environment writes one object's
 * transform per frame.
 */
function ParticleDraw({
  slot,
  document,
  mesh,
  geometry,
  evaluated,
}: {
  slot: number;
  document: BinDocumentId;
  mesh: ShimmerMesh;
  geometry: BufferGeometry;
  evaluated: RefObject<Evaluated>;
}) {
  const placed = useRef<Group>(null);
  const passes = useShimmerPasses(document, mesh, geometry);
  const flat = useFlatMaterial(mesh);

  useFrame(() => {
    const group = placed.current;
    if (group === null) return;

    const particle = evaluated.current.particles[slot];
    group.visible = particle !== undefined;
    passes.time.current = evaluated.current.time;
    if (particle === undefined) return;

    place(group, particle);
    const [r, g, b, a] = particle.color;
    passes.color[0] = r;
    passes.color[1] = g;
    passes.color[2] = b;
    passes.color[3] = a;
    flat.color.setRGB(r, g, b);
    flat.opacity = a;
  });

  return (
    <group ref={placed} visible={false}>
      {passes.materials.length === 0 && (
        <mesh geometry={geometry} material={flat} layers={PARTICLE_LAYER} />
      )}
      {passes.materials.map((pass, order) => (
        <PassMesh
          key={pass.uuid}
          geometry={geometry}
          material={pass}
          glow={passes.glows[order] ?? null}
          order={order}
          passes={passes}
        />
      ))}
    </group>
  );
}

/** `group` stood where `particle` is, its engine-space place and turn mirrored into the scene. */
function place(group: Group, particle: ShimmerParticle): void {
  const [x, y, z] = particle.position;
  const [rx, ry, rz] = particle.rotation;
  group.position.set(x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]);
  /* A turn about the mirrored axis keeps its sign, and a turn about either other flips. */
  group.rotation.set(MathUtils.degToRad(rx), -MathUtils.degToRad(ry), -MathUtils.degToRad(rz));
  group.scale.set(...particle.scale);
}

/**
 * One pass drawn on the mesh, and its glow copy on the glow layer, with the engine buffers
 * written for this object before either draws.
 */
function PassMesh({
  geometry,
  material,
  glow,
  order,
  passes,
}: {
  geometry: BufferGeometry;
  material: RawShaderMaterial;
  glow: RawShaderMaterial | null;
  order: number;
  passes: PassMaterials;
}) {
  const drawn = useRef<Mesh>(null);
  useGlowing(glow !== null);

  const beforeRender: Mesh["onBeforeRender"] = (renderer, _scene, camera, _geometry, pass) => {
    if (drawn.current === null) return;
    passes.environment.write(renderer, camera, drawn.current, passes.time.current);
    passes.environment.draw(pass);
  };

  return (
    <>
      <mesh
        ref={drawn}
        geometry={geometry}
        material={material}
        renderOrder={order}
        layers={PARTICLE_LAYER}
        onBeforeRender={beforeRender}
      />
      {glow !== null && (
        <mesh
          geometry={geometry}
          material={glow}
          renderOrder={order}
          layers={GLOW_LAYER}
          onBeforeRender={beforeRender}
        />
      )}
    </>
  );
}

/** The flat material a mesh draws with until its passes are ready, tinted per frame. */
function useFlatMaterial(mesh: ShimmerMesh): MeshBasicMaterial {
  const texture = useFlatTexture(mesh);
  const material = useDisposable(
    () =>
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
      }),
    [texture],
  );
  return material;
}

function useFlatTexture(mesh: ShimmerMesh): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  const version = useAssetVersion(mesh.texture);
  const url = mesh.texture === null ? null : versionedUrl(previewUrl(mesh.texture), version);

  useEffect(() => {
    if (url === null) return;

    const held = acquireTexture(url, "flat");
    let live = true;
    void held.load().then((loaded) => {
      if (live) setTexture(loaded);
    });
    return () => {
      live = false;
      held.release();
      setTexture(null);
    };
  }, [url]);

  return texture;
}
