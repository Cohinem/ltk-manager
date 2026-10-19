import type { CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Sphere, Vector3 } from "three";

import { useDisposable } from "@/hooks";
import type { UpAxis } from "@/lib/tauri";
import { AXIS_SIGN, type BackdropSource, useSceneColors } from "@/modules/viewport";

import { PreviewViewport } from "../../shared/preview/PreviewViewport";
import { Passes } from "../../vfx/rendering/components/Passes";
import { mapQueries } from "../api/mapQueries";
import type { ModelPreview } from "../utils/meshImport";

/** Radius and height of the champion-sized marker, in engine units. */
const MARKER_RADIUS = 65;
const MARKER_HEIGHT = 180;

/** Scale factor of the camera framing radius. */
const FRAME_MARGIN = 1.6;

type Point = readonly [number, number, number];

export interface ImportPreviewProps {
  /** The map behind the meshes. `null` if the viewport shows no map. */
  readonly backdrop: BackdropSource | null;
  readonly path: string;
  readonly meshes: readonly number[];
  readonly scale: number;
  readonly up: UpAxis;
  /** The placement position. `null` keeps the file's origin. */
  readonly at: Point | null;
}

/**
 * Preview of the checked meshes at the chosen placement in the shown map, beside a
 * champion-sized marker. Per "Adding meshes" in docs/ux/MAP_EDITOR.md.
 */
export function ImportPreview({ backdrop, path, meshes, scale, up, at }: ImportPreviewProps) {
  const preview = useQuery(mapQueries.importPreview(path, meshes, scale, up)).data;

  return (
    <div data-ui="ImportPreview" className="relative h-56 overflow-hidden rounded-md">
      <PreviewViewport
        renderer="own"
        frameloop="demand"
        gizmo={false}
        stage={backdrop === null}
        textured={false}
        backdrop={backdrop}
        backdropSky={false}
        dpr={1}
      >
        <Passes warps={false} softens={false} />
        {preview !== undefined && <ModelGhost preview={preview} at={at ?? [0, 0, 0]} />}
      </PreviewViewport>
    </div>
  );
}

/** Translucent fill and wireframe of the meshes at `at`, and the marker. Frames the camera on both. */
function ModelGhost({ preview, at }: { preview: ModelPreview; at: Point }) {
  const colors = useSceneColors();
  const controls = useThree((state) => state.controls) as CameraControlsImpl | null;
  const geometry = useDisposable(() => {
    const made = new BufferGeometry();
    made.setAttribute("position", new BufferAttribute(preview.positions, 3));
    made.setIndex(new BufferAttribute(preview.indices, 1));
    made.computeBoundingBox();
    return made;
  }, [preview]);

  const { marker, sphere } = useMemo(() => {
    const bounds = geometry.boundingBox?.clone() ?? new Box3();
    if (bounds.isEmpty()) bounds.setFromCenterAndSize(new Vector3(), new Vector3());
    bounds.translate(new Vector3(...at));

    const beside = new Vector3(
      bounds.min.x - MARKER_RADIUS * 2,
      bounds.min.y + MARKER_HEIGHT / 2,
      (bounds.min.z + bounds.max.z) / 2,
    );
    const framed = bounds.clone().expandByPoint(beside).getBoundingSphere(new Sphere());
    framed.center.multiply(new Vector3(...AXIS_SIGN));
    framed.radius = Math.max(framed.radius, MARKER_HEIGHT) * FRAME_MARGIN;
    return { marker: beside.toArray(), sphere: framed };
  }, [geometry, at]);

  useEffect(() => {
    if (controls !== null) void controls.fitToSphere(sphere, false);
  }, [controls, sphere]);

  return (
    <group scale={[AXIS_SIGN[0], AXIS_SIGN[1], AXIS_SIGN[2]]}>
      <group position={[at[0], at[1], at[2]]}>
        <mesh geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial
            color={colors.gizmo}
            transparent
            opacity={0.35}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
        <mesh geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial color={colors.gizmo} wireframe transparent opacity={0.6} />
        </mesh>
      </group>
      <mesh position={[marker[0], marker[1], marker[2]]}>
        <cylinderGeometry args={[MARKER_RADIUS, MARKER_RADIUS, MARKER_HEIGHT, 16]} />
        <meshBasicMaterial color={colors.gizmo} wireframe />
      </mesh>
    </group>
  );
}
