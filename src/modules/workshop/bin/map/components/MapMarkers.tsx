import { useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Color,
  PointsMaterial,
  Vector3,
} from "three";

import { AXIS_SIGN, type SceneColors } from "@/modules/viewport";

import type { PlacedItem } from "../utils/mapOutline";
import { isHidden } from "../utils/mapOutline";
import type { ScreenPoint } from "../utils/mapSelection";

/** Every marked placeable's place on the screen, in client pixels, in the order it was marked. */
export type MarkerProjector = () => ScreenPoint[];

/** A marker across, and a selected one, in screen pixels at every distance. */
const MARKER_SIZE = 8;
const SELECTED_SIZE = 13;

/** Drawn over the map and its particles, since a marker is chrome rather than scene. */
const OVER_THE_SCENE = 1000;

export interface MapMarkersProps {
  readonly items: readonly PlacedItem[];
  readonly hidden: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly colors: SceneColors;
  /** Where the box select reads the markers' places on the screen from. */
  readonly projector: RefObject<MarkerProjector | null>;
}

/**
 * A dot where each placeable the outliner lists stands, in its kind's colour, dimmed where
 * the reader hid it and ringed larger where they selected it.
 *
 * The dots keep one size on the screen and draw through the map, so a placeable under a
 * cliff or a roof can still be picked.
 */
export function MapMarkers({ items, hidden, selected, colors, projector }: MapMarkersProps) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);

  const places = useMemo(() => {
    const out = new Float32Array(items.length * 3);
    items.forEach(({ item }, at) => {
      for (let axis = 0; axis < 3; axis += 1) {
        out[at * 3 + axis] = (item.position[axis] ?? 0) * AXIS_SIGN[axis];
      }
    });
    return out;
  }, [items]);

  const geometry = useMemo(() => {
    const made = new BufferGeometry();
    made.setAttribute("position", new BufferAttribute(places, 3));
    const tints = new Float32Array(items.length * 3);
    items.forEach(({ chunk, item }, at) => {
      const tint = isHidden(hidden, chunk.entry, item.key)
        ? colors.markerHidden
        : kindColor(item.kind, colors);
      tint.toArray(tints, at * 3);
    });
    made.setAttribute("color", new BufferAttribute(tints, 3));
    return made;
  }, [places, items, hidden, colors]);

  const picked = useMemo(() => {
    const made = new BufferGeometry();
    const chosen = items.flatMap(({ id }, at) => (selected.has(id) ? [at] : []));
    const out = new Float32Array(chosen.length * 3);
    chosen.forEach((at, index) => out.set(places.subarray(at * 3, at * 3 + 3), index * 3));
    made.setAttribute("position", new BufferAttribute(out, 3));
    return made;
  }, [items, selected, places]);

  const dot = useMemo(() => roundDot(), []);
  const material = useMemo(() => markerMaterial(dot, MARKER_SIZE, null), [dot]);
  const ring = useMemo(() => markerMaterial(dot, SELECTED_SIZE, colors.gizmo), [dot, colors.gizmo]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => picked.dispose(), [picked]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => ring.dispose(), [ring]);
  useEffect(() => () => dot.dispose(), [dot]);

  useEffect(() => {
    const point = new Vector3();
    projector.current = () => {
      const rect = canvas.getBoundingClientRect();
      const out: ScreenPoint[] = [];
      for (let at = 0; at < places.length; at += 3) {
        point.set(places[at] ?? 0, places[at + 1] ?? 0, places[at + 2] ?? 0).project(camera);
        const behind = point.z > 1 || point.z < -1;
        out.push(
          behind
            ? null
            : [
                rect.left + ((point.x + 1) / 2) * rect.width,
                rect.top + ((1 - point.y) / 2) * rect.height,
              ],
        );
      }
      return out;
    };
    return () => {
      projector.current = null;
    };
  }, [projector, places, camera, canvas]);

  return (
    <>
      <points
        geometry={geometry}
        material={material}
        renderOrder={OVER_THE_SCENE}
        frustumCulled={false}
      />
      <points
        geometry={picked}
        material={ring}
        renderOrder={OVER_THE_SCENE - 1}
        frustumCulled={false}
      />
    </>
  );
}

function kindColor(kind: PlacedItem["item"]["kind"], colors: SceneColors): Color {
  switch (kind) {
    case "particle":
      return colors.markerParticle;
    case "character":
      return colors.markerCharacter;
    case "locator":
      return colors.markerLocator;
    default:
      return colors.markerOther;
  }
}

function markerMaterial(dot: CanvasTexture, size: number, color: Color | null): PointsMaterial {
  return new PointsMaterial({
    size,
    sizeAttenuation: false,
    map: dot,
    alphaTest: 0.5,
    vertexColors: color === null,
    ...(color === null ? {} : { color }),
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

/** A white disc on a clear square, which rounds each point sprite. */
function roundDot(): CanvasTexture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = "white";
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    context.fill();
  }
  return new CanvasTexture(canvas);
}
