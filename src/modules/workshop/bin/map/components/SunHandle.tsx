import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  LineBasicMaterial,
  MeshBasicMaterial,
  Sphere,
  SphereGeometry,
  Vector3,
} from "three";

import { useDisposable } from "@/hooks";
import { AXIS_SIGN } from "@/modules/viewport";

import { grabGizmo } from "./PlaceableGizmo";

/** The arrow's length and the radius of the knob at its tip, in world units. */
const ARROW_LENGTH = 1200;
const KNOB_RADIUS = 45;

/** Drawn over the map, since the handle is chrome rather than scene. */
const OVER_THE_SCENE = 1000;

type Direction = readonly [number, number, number];

export interface SunHandleProps {
  /** Where the arrow starts, in the viewport's space. */
  readonly origin: Direction;
  /** `sunDirection`, which points at the sun in the engine's space. */
  readonly direction: Direction;
  readonly color: Color;
  /** Called on release with the dragged direction, unit length in the engine's space. */
  readonly onCommit: (direction: Direction) => void;
}

/** Returns `direction` mirrored between the engine's space and the viewport's. */
function mirrored([x, y, z]: Direction): Direction {
  return [x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]];
}

/**
 * An arrow from `origin` toward the sun with a knob at its tip. Dragging the knob turns the
 * arrow on a sphere around `origin`, and the release sends one edit.
 *
 * Per "Lighting" in docs/ux/MAP_EDITOR.md.
 */
export function SunHandle({ origin, direction, color, onCommit }: SunHandleProps) {
  const controls = useThree((state) => state.controls);
  const [dragged, setDragged] = useState<Direction | null>(null);
  const dragging = useRef(false);

  /* A read of the committed direction replaces the dragged one. */
  useEffect(() => setDragged(null), [direction]);

  const shown = mirrored(dragged ?? direction);
  const start = new Vector3(...origin);
  const tip = new Vector3(...shown).normalize().multiplyScalar(ARROW_LENGTH).add(start);

  const line = useDisposable(() => {
    const made = new BufferGeometry();
    made.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([start.x, start.y, start.z, tip.x, tip.y, tip.z]), 3),
    );
    return made;
  }, [start.x, start.y, start.z, tip.x, tip.y, tip.z]);
  const lineMaterial = useDisposable(
    () => new LineBasicMaterial({ color, depthTest: false, transparent: true }),
    [color],
  );
  const knob = useDisposable(() => new SphereGeometry(KNOB_RADIUS, 16, 12), []);
  const knobMaterial = useDisposable(
    () => new MeshBasicMaterial({ color, depthTest: false, transparent: true }),
    [color],
  );

  const setCamera = (enabled: boolean) => {
    if (controls !== null && "enabled" in controls) controls.enabled = enabled;
  };

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    grabGizmo();
    (event.target as unknown as Element).setPointerCapture(event.pointerId);
    dragging.current = true;
    setCamera(false);
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;

    const hit = event.ray.intersectSphere(new Sphere(start, ARROW_LENGTH), new Vector3());
    if (hit === null) return;

    const [x, y, z] = mirrored(hit.sub(start).normalize().toArray());
    setDragged([x, y, z]);
  };

  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;

    event.stopPropagation();
    (event.target as unknown as Element).releasePointerCapture(event.pointerId);
    dragging.current = false;
    setCamera(true);
    if (dragged !== null) onCommit(dragged);
  };

  return (
    <>
      <lineSegments
        geometry={line}
        material={lineMaterial}
        renderOrder={OVER_THE_SCENE}
        frustumCulled={false}
      />
      <mesh
        geometry={knob}
        material={knobMaterial}
        position={tip}
        renderOrder={OVER_THE_SCENE}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </>
  );
}
