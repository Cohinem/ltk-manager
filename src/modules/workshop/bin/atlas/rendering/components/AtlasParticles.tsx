import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { OrthographicCamera, Scene } from "three";

import type { AssetRef, BinDocumentId, VfxSystem as VfxSystemRead } from "@/lib/tauri";

import { useSandbox } from "../../../../sandbox/state/SandboxContext";
import { useBinDocument } from "../../../documents/hooks/useBinDocument";
import { nameHash } from "../../../shared/utils/binHash";
import type { RigModel } from "../../../vfx/engine/model/rig";
import { readVfxSystem } from "../../../vfx/engine/parsing/readVfxSystem";
import { createDriver } from "../../../vfx/engine/simulation/driver";
import { vfxQueries } from "../../../vfx/hooks/useVfxSystem";
import { VfxSystem } from "../../../vfx/rendering/components/VfxSystem";
import { useVfxMeshes } from "../../../vfx/rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../../vfx/rendering/hooks/useVfxTextures";
import { drawnEmitters } from "../../../vfx/rendering/utils/definitions";
import { uiQueries } from "../../api/uiQueries";
import type { Command, ParticleCommand } from "../../engine/commands/types";
import type { Screen } from "../../engine/layout/solve";
import { hudLayerOf } from "../../engine/particles/hudLayer";
import type { ParticleDraw } from "../utils/frameRenderer";
import { hudCamera } from "../utils/hudCamera";

/** The seed every element's system runs on, so two readers of one view see the same run. */
const PARTICLE_SEED = 1337;
/** The longest step one frame advances a system by, so a stalled frame does not burst. */
const MAX_STEP = 1 / 30;
/** A UI system stands where its element is and plays over and over. */
const HUD_RIG: RigModel = { motion: { kind: "still" }, life: "loop", height: 0 };

export interface AtlasParticlesProps {
  readonly commands: readonly Command[];
  readonly screen: Screen;
  readonly playing: boolean;
  /** Where each element's scene and camera are kept for the frame to draw. */
  readonly draws: Map<string, ParticleDraw>;
}

/**
 * Every element's particle system, each run in a scene of its own under the HUD camera, per
 * section 2.6 of docs/plans/atlas-renderer.md. The frame draws each scene at its element's place
 * in the command list, so this renders nothing itself.
 *
 * A system is found by the object index in whichever file declares it, and draws once that file
 * and the system have been read.
 */
export function AtlasParticles({ commands, screen, playing, draws }: AtlasParticlesProps) {
  const particles = commands.filter(
    (command): command is ParticleCommand => command.kind === "particles",
  );

  return particles.map((command) => (
    <ElementParticles
      key={`${command.element}:${command.system}`}
      command={command}
      screen={screen}
      playing={playing}
      draws={draws}
    />
  ));
}

interface ElementParticlesProps {
  readonly command: ParticleCommand;
  readonly screen: Screen;
  readonly playing: boolean;
  readonly draws: Map<string, ParticleDraw>;
}

function ElementParticles(props: ElementParticlesProps) {
  const sandbox = useSandbox();
  const hash = hashOf(props.command.system);
  const declared = useQuery(uiQueries.declared(sandbox, hash)).data;
  const asset = declared?.objects[hash]?.declarations[0]?.asset ?? null;
  if (asset === null) return null;

  return <DeclaredParticles {...props} asset={asset} hash={hash} />;
}

function DeclaredParticles({
  asset,
  hash,
  ...props
}: ElementParticlesProps & { asset: AssetRef; hash: string }) {
  const { state } = useBinDocument(asset, hash, "lingering");
  const document = state.status === "open" ? state.handle.document : null;
  const read = useQuery({
    ...vfxQueries.system(document ?? (0 as BinDocumentId), hash),
    enabled: document !== null,
  }).data;
  if (document === null || read === undefined) return null;

  return <SystemScene {...props} document={document} read={read} />;
}

function SystemScene({
  command,
  screen,
  playing,
  draws,
  document,
  read,
}: ElementParticlesProps & { document: BinDocumentId; read: VfxSystemRead }) {
  const invalidate = useThree((state) => state.invalidate);
  const [scene] = useState(() => new Scene());
  const [camera] = useState(() => new OrthographicCamera());
  const layer = useMemo(() => hudLayerOf(read.root, command.source), [read, command.source]);

  useLayoutEffect(() => {
    hudCamera(layer, screen, command.origin, command.scale, camera);
  }, [layer, screen, command.origin, command.scale, camera]);

  useEffect(() => {
    draws.set(command.element, { scene, camera });
    invalidate();
    return () => {
      draws.delete(command.element);
    };
  }, [draws, command.element, scene, camera, invalidate]);

  return createPortal(<SystemRun read={read} document={document} playing={playing} />, scene, {
    camera,
  });
}

function SystemRun({
  read,
  document,
  playing,
}: {
  read: VfxSystemRead;
  document: BinDocumentId;
  playing: boolean;
}) {
  const system = useMemo(() => readVfxSystem(read), [read]);
  const drawn = useMemo(() => drawnEmitters(system), [system]);
  const textures = useVfxTextures(drawn);
  const meshes = useVfxMeshes(drawn);
  const driver = useMemo(() => createDriver(PARTICLE_SEED), []);

  useEffect(() => {
    driver.swap(system);
    driver.steer(HUD_RIG);
  }, [driver, system]);

  useFrame((_, delta) => {
    if (playing) driver.advance(Math.min(delta, MAX_STEP));
  });

  return (
    <VfxSystem
      drawn={drawn}
      driver={driver}
      textures={textures}
      meshes={meshes}
      document={document}
    />
  );
}

/** The object hash a link names: a path hashed, or a hash as it stands. */
function hashOf(system: string): string {
  return system.startsWith("0x") ? system : nameHash(system);
}
