import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ReactNode, use, useEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, type Group, Sphere, Vector3 } from "three";

import { m } from "@/i18n";
import { previewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";
import { useSceneColors } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { CHECKERBOARD } from "../../../../preview/components/ImagePreview";
import { useImageSlot } from "../../../../preview/hooks/useImageSlot";
import { assetArchive } from "../../../../preview/utils/assetRef";
import type { EmitterModel, SpawnShape } from "../../engine/model/model";
import { type HeldClass, heldPrimitive } from "../../inspector/components/PrimitivePicker";
import { PrimitivePreview } from "../../inspector/components/PrimitivePreview";
import { VfxRunContext } from "../../playback/state/run";
import { useMeshGeometry } from "../../rendering/hooks/useMeshGeometry";
import { SEGMENTS, wireframeInto } from "../../rendering/utils/emitterShape";
import { NODE_PREVIEW_SIZE, PRIMITIVE_PREVIEW } from "../utils/driverLayout";
import { emitterOf } from "../utils/graphEmitter";
import type { FileItem } from "../utils/graphItems";
import { PreviewView } from "./PreviewView";

/** The texture width a node's picture asks for, twice its square for a sharp high-DPI draw. */
const PICTURE_WIDTH = NODE_PREVIEW_SIZE * 2;

const FOV = 35;

/** How fast a 3D preview turns, in radians a second. */
const SPIN = 0.4;

/* DS-GROUND, DS-RADIUS */
const BOX =
  "my-1 shrink-0 self-center overflow-hidden rounded-md border border-surface-veil bg-surface-950";
const BOX_STYLE = { width: NODE_PREVIEW_SIZE, height: NODE_PREVIEW_SIZE } as const;

/** What a file node shows of its file: a texture's picture, a mesh turning, or a note. */
export function FilePreview({ item }: { item: FileItem }) {
  if (item.asset === null) return <Note text={m.workshop_bin_graph_file_missing_label()} />;
  if (item.kind === "texture") return <TexturePicture asset={item.asset} />;
  if (item.kind === "mesh") return <MeshPreview asset={item.asset} path={item.path} />;
  return <Note text={m.workshop_bin_graph_file_unpreviewed_label()} />;
}

function Note({ text }: { text: string }) {
  return (
    <div className={twMerge(BOX, "flex items-center justify-center p-4")} style={BOX_STYLE}>
      <span className="text-center text-meta text-surface-400">{text}</span>
    </div>
  );
}

/** A texture fitted into the square over the checkerboard, so an alpha reads as one. */
function TexturePicture({ asset }: { asset: AssetRef }) {
  const [failed, setFailed] = useState(false);
  const slot = useImageSlot(previewUrl(asset, PICTURE_WIDTH), {
    lane: "tile",
    archive: assetArchive(asset),
  });
  if (failed) return <Note text={m.workshop_bin_graph_file_unpreviewed_label()} />;

  return (
    <div className={twMerge(BOX, CHECKERBOARD, "[background-size:16px_16px]")} style={BOX_STYLE}>
      {slot.src !== undefined && (
        <img
          src={slot.src}
          alt=""
          draggable={false}
          className="h-full w-full object-contain"
          onLoad={slot.onSettled}
          onError={() => {
            slot.onSettled();
            setFailed(true);
          }}
        />
      )}
    </div>
  );
}

/** A mesh file at rest, turning, drawn by the emitter previews' canvas. */
function MeshPreview({ asset, path }: { asset: AssetRef; path: string }) {
  return (
    <PreviewView className={BOX} style={BOX_STYLE}>
      <MeshScene asset={asset} path={path} />
    </PreviewView>
  );
}

function MeshScene({ asset, path }: { asset: AssetRef; path: string }) {
  const geometry = useMeshGeometry(asset, path);
  const sphere = useMemo(() => {
    if (geometry === null) return null;
    geometry.computeBoundingSphere();
    return geometry.boundingSphere;
  }, [geometry]);

  return (
    <Turntable sphere={sphere}>
      {geometry !== null && sphere !== null && (
        <mesh geometry={geometry} position={sphere.center.clone().negate()}>
          <meshNormalMaterial />
        </mesh>
      )}
    </Turntable>
  );
}

/**
 * The spawn shape of `emitter` as the viewport's gizmo draws it, turning, in the emitter's
 * own space at the start of its life.
 *
 * A shape of no size spawns every particle at one point, which draws as nothing, so it
 * draws as a faint outline of its kind with a caption saying so.
 */
export function ShapePreview({ emitter }: { emitter: EmitterModel | undefined }) {
  const zero = emitter !== undefined && zeroSized(emitter.shape);

  return (
    <div className="relative my-1 shrink-0 self-center" style={BOX_STYLE}>
      <PreviewView className={twMerge(BOX, "my-0 h-full w-full")}>
        {emitter !== undefined && <ShapeScene emitter={emitter} zero={zero} />}
      </PreviewView>
      {zero && (
        <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-fine text-surface-400">
          {m.workshop_bin_graph_shape_zero_label()}
        </span>
      )}
    </div>
  );
}

function ShapeScene({ emitter, zero }: { emitter: EmitterModel; zero: boolean }) {
  const colors = useSceneColors();
  const geometry = useMemo(() => {
    const drawn = zero
      ? { ...emitter, shape: UNIT_SHAPE[emitter.shape.kind] ?? emitter.shape }
      : emitter;
    const positions = new Float32Array(SEGMENTS * 6);
    const vertices = wireframeInto(drawn, new Float32Array(3), 0, positions);
    const shape = new BufferGeometry();
    shape.setAttribute("position", new BufferAttribute(positions.slice(0, vertices * 3), 3));
    shape.computeBoundingSphere();
    return shape;
  }, [emitter, zero]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const sphere = geometry.boundingSphere;

  return (
    <Turntable sphere={sphere}>
      {sphere !== null && (
        <lineSegments geometry={geometry} position={sphere.center.clone().negate()}>
          <lineBasicMaterial color={colors.gizmo} transparent opacity={zero ? 0.3 : 1} />
        </lineSegments>
      )}
    </Turntable>
  );
}

/** The inspector's sketch of a node's primitive, with the emitter's own mesh for a mesh. */
export function PrimitiveSketch({ id, held }: { id: string; held: HeldClass | null }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, id), [system, id]);
  const { known, text } = heldPrimitive(held);

  return (
    <div className="nodrag my-1 flex shrink-0 self-center">
      <PrimitivePreview
        kind={known?.sketch ?? "none"}
        name={text}
        mesh={emitter?.mesh ?? null}
        size={PRIMITIVE_PREVIEW}
      />
    </div>
  );
}

/** A shape whose volume or surface has no extent, which spawns at its centre. */
function zeroSized(shape: SpawnShape): boolean {
  switch (shape.kind) {
    case "box":
      return shape.size.every((extent) => extent === 0);
    case "sphere":
    case "cylinder":
      return shape.radius === 0;
    case "point":
    case "legacy":
      return false;
  }
}

/** The outline a shape of no size stands in with: its kind at a size of one. */
const UNIT_SHAPE: Partial<Record<SpawnShape["kind"], SpawnShape>> = {
  box: { kind: "box", size: [1, 1, 1], volume: false },
  sphere: { kind: "sphere", radius: 1, volume: false },
  cylinder: { kind: "cylinder", radius: 1, height: 1, volume: false },
};

/** A camera framing `sphere` from above and in front, and its contents turning under it. */
function Turntable({ sphere, children }: { sphere: Sphere | null; children: ReactNode }) {
  const colors = useSceneColors();
  const turned = useRef<Group>(null);
  useFrame((_, delta) => {
    if (turned.current !== null) turned.current.rotation.y += delta * SPIN;
  });

  const radius = Math.max(sphere?.radius ?? 1, 1e-3);
  const distance = radius / Math.sin((FOV * Math.PI) / 360);
  const eye = LOOK.clone().multiplyScalar(distance);

  return (
    <>
      <color attach="background" args={[colors.backdrop]} />
      <PerspectiveCamera
        makeDefault
        fov={FOV}
        near={distance / 100}
        far={distance * 100}
        position={[eye.x, eye.y, eye.z]}
        onUpdate={(camera) => camera.lookAt(0, 0, 0)}
      />
      <group ref={turned}>{children}</group>
    </>
  );
}

/** The direction a preview's camera looks from: above and in front. */
const LOOK = new Vector3(0, 0.45, 1).normalize();
