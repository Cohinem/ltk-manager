import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ReactNode, use, useMemo, useRef, useState } from "react";
import { type Group, Sphere, Vector3 } from "three";

import { m } from "@/i18n";
import { usePreviewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { CHECKERBOARD } from "../../../../preview/components/ImagePreview";
import { useImageSlot } from "../../../../preview/hooks/useImageSlot";
import { assetArchive } from "../../../../preview/utils/assetRef";
import { type HeldClass, heldPrimitive } from "../../inspector/components/PrimitivePicker";
import { PrimitivePreview } from "../../inspector/components/PrimitivePreview";
import { VfxRunContext } from "../../playback/state/run";
import { useMeshGeometry } from "../../rendering/hooks/useMeshGeometry";
import { useBackdropColor } from "../state/previewBackdrop";
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
export const NODE_BOX =
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
    <div className={twMerge(NODE_BOX, "flex items-center justify-center p-4")} style={BOX_STYLE}>
      <span className="text-center text-meta text-surface-400">{text}</span>
    </div>
  );
}

/** A texture fitted into the square over the checkerboard, so an alpha reads as one. */
function TexturePicture({ asset }: { asset: AssetRef }) {
  const url = usePreviewUrl(asset, PICTURE_WIDTH);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const slot = useImageSlot(url, {
    lane: "tile",
    archive: assetArchive(asset),
  });
  if (failedUrl === url) return <Note text={m.workshop_bin_graph_file_unpreviewed_label()} />;

  return (
    <div
      className={twMerge(NODE_BOX, CHECKERBOARD, "[background-size:16px_16px]")}
      style={BOX_STYLE}
    >
      {slot.src !== undefined && (
        <img
          src={slot.src}
          alt=""
          draggable={false}
          className="h-full w-full object-contain"
          onLoad={slot.onSettled}
          onError={() => {
            slot.onSettled();
            setFailedUrl(url);
          }}
        />
      )}
    </div>
  );
}

/** A mesh file at rest, turning, drawn by the emitter previews' canvas. */
function MeshPreview({ asset, path }: { asset: AssetRef; path: string }) {
  return (
    <PreviewView className={NODE_BOX} style={BOX_STYLE}>
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

/** A camera framing `sphere` from above and in front, and its contents turning under it. */
export function Turntable({ sphere, children }: { sphere: Sphere | null; children: ReactNode }) {
  const backdrop = useBackdropColor();
  const turned = useRef<Group>(null);
  useFrame((_, delta) => {
    if (turned.current !== null) turned.current.rotation.y += delta * SPIN;
  });

  const radius = Math.max(sphere?.radius ?? 1, 1e-3);
  const distance = radius / Math.sin((FOV * Math.PI) / 360);
  const eye = LOOK.clone().multiplyScalar(distance);

  return (
    <>
      <color attach="background" args={[backdrop]} />
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
