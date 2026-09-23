import { useFrame } from "@react-three/fiber";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NoColorSpace } from "three";

import type { BinDocumentId, MaterialProgram, SkinModel } from "@/lib/tauri";
import {
  Character,
  createPose,
  createSceneClock,
  FitCamera,
  MaterialSubject,
  meshBounds,
  PREVIEW_BOUNDS,
  programTextureAssets,
  programWith,
  useAssetTextures,
  useSceneColors,
  viewportQueries,
} from "@/modules/viewport";

import { useBinDocument } from "../../bin/documents/hooks/useBinDocument";
import { materialQueries } from "../../bin/material/api/materialQueries";
import { skinQueries } from "../../bin/skin/api/skinQueries";
import { bindingOf, textureAssets } from "../../bin/skin/utils/skinScene";
import type { SystemModel } from "../../bin/vfx/engine/model/model";
import { FIRST_RIG } from "../../bin/vfx/engine/model/rig";
import { systemSpan } from "../../bin/vfx/engine/model/systemModel";
import { readVfxSystem } from "../../bin/vfx/engine/parsing/readVfxSystem";
import { createDriver } from "../../bin/vfx/engine/simulation/driver";
import { vfxQueries } from "../../bin/vfx/hooks/useVfxSystem";
import { Passes } from "../../bin/vfx/rendering/components/Passes";
import { VfxSystem } from "../../bin/vfx/rendering/components/VfxSystem";
import { useVfxMeshes } from "../../bin/vfx/rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../bin/vfx/rendering/hooks/useVfxTextures";
import { type AssetLoad } from "../../bin/vfx/rendering/utils/assetLoad";
import { drawnEmitters } from "../../bin/vfx/rendering/utils/definitions";
import { distorts } from "../../bin/vfx/rendering/utils/drawKind";
import { definitionBounds } from "../../bin/vfx/rendering/utils/systemBounds";
import { objectPreviewKind } from "../utils/objectPreview";
import type { ObjectRowNode } from "../utils/objectTree";
import { createPreviewPlayback } from "../utils/previewPlayback";
import { createPreviewWarmup } from "../utils/previewWarmup";

const MIP_WIDTH = 128;
const ORIGIN = [0, 0, 0] as const;

interface SceneProps {
  node: ObjectRowNode;
  onImage: (image: string | null) => void;
}

/** One object held open for the grid's shared rendering surface. */
export default function ObjectPreviewScene({ node, onImage }: SceneProps) {
  const declaration = node.declarations[0]!;
  const { state } = useBinDocument(declaration.asset, node.objectHash);
  const kind = objectPreviewKind(node);

  if (state.status === "failed") {
    return <PreviewFailure onImage={onImage} />;
  }

  if (state.status !== "open") {
    return null;
  }

  if (kind === "vfx") {
    return (
      <ParticleRead document={state.handle.document} entry={node.objectHash} onImage={onImage} />
    );
  }

  if (kind === "material") {
    return (
      <MaterialRead document={state.handle.document} entry={node.objectHash} onImage={onImage} />
    );
  }

  return <SkinRead document={state.handle.document} entry={node.objectHash} onImage={onImage} />;
}

interface ReadProps {
  document: BinDocumentId;
  entry: string;
  onImage: (image: string | null) => void;
}

function ParticleRead({ document, entry, onImage }: ReadProps) {
  const { data, isError } = useQuery({ ...vfxQueries.system(document, entry), gcTime: 0 });
  const system = useMemo(() => (data === undefined ? null : readVfxSystem(data)), [data]);
  if (isError || system?.emitters.length === 0) {
    return <PreviewFailure onImage={onImage} />;
  }
  if (system === null) {
    return null;
  }

  return <ParticleScene system={system} onImage={onImage} />;
}

function ParticleScene({
  system,
  onImage,
}: {
  system: SystemModel;
  onImage: (image: string | null) => void;
}) {
  const drawn = useMemo(() => drawnEmitters(system), [system]);
  const [textureLoad, reportTextures] = useState<AssetLoad | null>(null);
  const [meshLoad, reportMeshes] = useState<AssetLoad | null>(null);
  const textures = useVfxTextures(drawn, reportTextures, MIP_WIDTH);
  const meshes = useVfxMeshes(drawn, reportMeshes);
  const driver = useMemo(() => {
    const next = createDriver(1337, { capacity: 4096, seekable: false });
    next.swap(system);
    next.steer({ ...FIRST_RIG.rig, life: "once" });
    return next;
  }, [system]);
  const bounds = useMemo(() => definitionBounds(system, drawn, FIRST_RIG.rig), [system, drawn]);
  const advance = useMemo(
    () =>
      createPreviewPlayback(
        driver,
        systemSpan(system),
        Math.max(
          0,
          ...system.emitters
            .filter((emitter) => !emitter.disabled)
            .map((emitter) => emitter.timeBeforeFirstEmission),
        ),
      ),
    [driver, system],
  );
  const warmup = useMemo(
    () =>
      createPreviewWarmup(
        advance,
        undefined,
        () => driver.pool.count > 0 || driver.liveChildren() > 0,
      ),
    [driver, advance],
  );
  const ready = textureLoad?.pending === 0 && meshLoad?.pending === 0;

  useFrame((_, delta) => {
    if (!warmup.ready) {
      warmup.run();
    } else if (ready) {
      advance(Math.min(delta, 1 / 30));
    }
  }, -1);

  return (
    <>
      <Passes warps={drawn.some(({ emitter }) => distorts(emitter))} softens={false} />
      <FitCamera bounds={bounds} ground={ORIGIN} token={0} animate={false} fit="box" />
      <VfxSystem drawn={drawn} driver={driver} textures={textures} meshes={meshes} room={4096} />
      <Capture
        ready={ready}
        onImage={onImage}
        hasContent={() => warmup.ready && (driver.pool.count > 0 || driver.liveChildren() > 0)}
      />
    </>
  );
}

function SkinRead({ document, entry, onImage }: ReadProps) {
  const { data, isError } = useQuery({ ...skinQueries.skin(document, entry), gcTime: 0 });
  if (isError || (data !== undefined && (!data.mesh?.asset || !data.skeleton?.asset))) {
    return <PreviewFailure onImage={onImage} />;
  }
  if (data === undefined) {
    return null;
  }

  return <SkinScene skin={data} onImage={onImage} />;
}

function SkinScene({
  skin,
  onImage,
}: {
  skin: SkinModel;
  onImage: (image: string | null) => void;
}) {
  const meshOptions = viewportQueries.mesh(skin.mesh?.asset ?? null);
  const skeletonOptions = viewportQueries.skeleton(skin.skeleton?.asset ?? null);
  const mesh = useQuery(
    queryOptions({
      ...meshOptions,
      queryKey: ["object-preview", ...meshOptions.queryKey],
      gcTime: 0,
    }),
  );
  const skeleton = useQuery(
    queryOptions({
      ...skeletonOptions,
      queryKey: ["object-preview", ...skeletonOptions.queryKey],
      gcTime: 0,
    }),
  );
  const assets = useMemo(() => textureAssets(skin), [skin]);
  const [load, report] = useState<{ pending: number; failed: number } | null>(null);
  const textures = useAssetTextures(assets, {
    fullWidth: MIP_WIDTH,
    concurrency: 2,
    report,
  });
  const colors = useSceneColors();
  const clock = useMemo(createSceneClock, []);
  const pose = useMemo(() => skeleton.data && createPose(skeleton.data, null), [skeleton.data]);
  const bindingFor = useCallback(
    (name: string) => bindingOf(skin, textures, name),
    [skin, textures],
  );
  const scale = skin.scale ?? 1;
  const bounds = useMemo(
    () => (mesh.data ? meshBounds(mesh.data, skin.hidden, scale) : null),
    [mesh.data, skin.hidden, scale],
  );

  if (mesh.isError || skeleton.isError) {
    return <PreviewFailure onImage={onImage} />;
  }

  if (!mesh.data || !pose) {
    return null;
  }

  return (
    <>
      <Passes warps={false} softens={false} />
      <FitCamera bounds={bounds} ground={ORIGIN} token={0} animate={false} fit="box" />
      <Character
        mesh={mesh.data}
        pose={pose}
        clock={clock}
        bindingOf={bindingFor}
        colors={colors}
        hidden={skin.hidden}
        scale={scale}
      />
      <Capture
        ready={load?.pending === 0 && textures.size >= assets.size - load.failed}
        onImage={onImage}
      />
    </>
  );
}

function MaterialRead({ document, entry, onImage }: ReadProps) {
  const { data, isError } = useQuery({ ...materialQueries.program(document, entry), gcTime: 0 });
  if (isError || data === null) {
    return <PreviewFailure onImage={onImage} />;
  }
  if (data === undefined) {
    return null;
  }

  return <MaterialScene program={data} onImage={onImage} />;
}

/**
 * The material on a turning sphere, its first translated pass drawn with the game's shader.
 *
 * A material with no pass that translated has nothing a thumbnail can say, so it fails.
 */
function MaterialScene({
  program,
  onImage,
}: {
  program: MaterialProgram;
  onImage: (image: string | null) => void;
}) {
  const programs = useMemo(() => [program], [program]);
  const assets = useMemo(() => programTextureAssets(programs), [programs]);
  const [load, report] = useState<{ pending: number; failed: number } | null>(null);
  const textures = useAssetTextures(assets, {
    colorSpace: NoColorSpace,
    fullWidth: MIP_WIDTH,
    concurrency: 2,
    report,
  });
  const drawn = useMemo(() => programWith(program, textures), [program, textures]);

  if (programWith(program, EMPTY_TEXTURES) === null) {
    return <PreviewFailure onImage={onImage} />;
  }

  return (
    <>
      <Passes warps={false} softens={false} />
      <FitCamera bounds={PREVIEW_BOUNDS} ground={ORIGIN} token={0} animate={false} fit="box" />
      <MaterialSubject
        program={drawn}
        skinned={program.kind === "skinnedMesh"}
        shape="sphere"
        turntable
      />
      <Capture
        ready={load?.pending === 0 && textures.size >= assets.size - load.failed}
        onImage={onImage}
      />
    </>
  );
}

const EMPTY_TEXTURES: ReadonlyMap<string, unknown> = new Map<string, unknown>();

/** A still after assets and camera have settled, copied immediately after the colour pass. */
function Capture({
  ready,
  onImage,
  hasContent,
}: {
  ready: boolean;
  onImage: (image: string | null) => void;
  hasContent?: () => boolean;
}) {
  const frames = useRef(0);
  const captured = useRef(false);

  useFrame(({ gl, controls }) => {
    if (!ready || !controls || captured.current) {
      return;
    }

    frames.current += 1;
    if (frames.current < 2 || (hasContent && !hasContent())) {
      return;
    }

    captured.current = true;
    try {
      const image = gl.domElement.toDataURL("image/webp", 0.75);
      onImage(image.startsWith("data:image/") ? image : null);
    } catch {
      onImage(null);
    }
  }, 2);

  return null;
}

/** A failed preview releases the shared worker for the next visible tile. */
export function PreviewFailure({ onImage }: { onImage: (image: string | null) => void }) {
  useEffect(() => onImage(null), [onImage]);
  return null;
}
