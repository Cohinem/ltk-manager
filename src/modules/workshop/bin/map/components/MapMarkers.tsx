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

import { useDisposable } from "@/hooks";
import type { MapItemKind } from "@/lib/tauri";
import { AXIS_SIGN, type SceneColors } from "@/modules/viewport";

import type { PlacedItem } from "../utils/mapOutline";
import { isHidden } from "../utils/mapOutline";
import type { ScreenPoint } from "../utils/mapSelection";
import { iconTexture, KIND_ICON } from "../utils/markerIcons";

/** Every marked placeable's place on the screen, in client pixels, in the order it was marked. */
export type MarkerProjector = () => ScreenPoint[];

/** A marker across, and the disc behind a selected one, in screen pixels at every distance. */
const MARKER_SIZE = 18;
const SELECTED_SIZE = 24;

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
 * An icon of its kind where each placeable that the outliner lists stands, in its kind's color,
 * dimmed where the reader hid it and backed by a disc where it is selected.
 *
 * The icons keep one size on the screen and draw through the map, so a placeable under a
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

  const kinds = useMemo(() => {
    const out = new Map<MapItemKind, number[]>();
    items.forEach(({ item }, at) => {
      const held = out.get(item.kind);
      if (held === undefined) out.set(item.kind, [at]);
      else held.push(at);
    });
    return [...out];
  }, [items]);

  const picked = useDisposable(() => {
    const made = new BufferGeometry();
    const chosen = items.flatMap(({ id }, at) => (selected.has(id) ? [at] : []));
    const out = new Float32Array(chosen.length * 3);
    chosen.forEach((at, index) => out.set(places.subarray(at * 3, at * 3 + 3), index * 3));
    made.setAttribute("position", new BufferAttribute(out, 3));
    return made;
  }, [items, selected, places]);

  const dot = useDisposable(() => roundDot(), []);
  const ring = useDisposable(
    () => markerMaterial(dot, SELECTED_SIZE, colors.gizmo),
    [dot, colors.gizmo],
  );

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
      {kinds.map(([kind, indices]) => (
        <KindMarkers
          key={kind}
          kind={kind}
          indices={indices}
          items={items}
          places={places}
          hidden={hidden}
          colors={colors}
        />
      ))}
      <points
        geometry={picked}
        material={ring}
        renderOrder={OVER_THE_SCENE - 1}
        frustumCulled={false}
      />
    </>
  );
}

interface KindMarkersProps extends Pick<MapMarkersProps, "items" | "hidden" | "colors"> {
  readonly kind: MapItemKind;
  /** The places in `items` of the placeables of `kind`. */
  readonly indices: readonly number[];
  readonly places: Float32Array;
}

/** The icons of the placeables of one kind, tinted by kind and dimmed where hidden. */
function KindMarkers({ kind, indices, items, places, hidden, colors }: KindMarkersProps) {
  const invalidate = useThree((state) => state.invalidate);

  const geometry = useDisposable(() => {
    const made = new BufferGeometry();
    const at = new Float32Array(indices.length * 3);
    const tints = new Float32Array(indices.length * 3);
    indices.forEach((index, out) => {
      const placed = items[index];
      if (placed === undefined) return;

      at.set(places.subarray(index * 3, index * 3 + 3), out * 3);
      const tint = isHidden(hidden, placed.chunk.entry, placed.item.key)
        ? colors.markerHidden
        : kindColor(kind, colors);
      tint.toArray(tints, out * 3);
    });
    made.setAttribute("position", new BufferAttribute(at, 3));
    made.setAttribute("color", new BufferAttribute(tints, 3));
    return made;
  }, [indices, items, places, hidden, colors, kind]);

  const icon = useDisposable(() => iconTexture(KIND_ICON[kind], invalidate), [kind, invalidate]);
  const material = useDisposable(() => markerMaterial(icon, MARKER_SIZE, null), [icon]);

  return (
    <points
      geometry={geometry}
      material={material}
      renderOrder={OVER_THE_SCENE}
      frustumCulled={false}
    />
  );
}

function kindColor(kind: MapItemKind, colors: SceneColors): Color {
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
    alphaTest: 0.1,
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
