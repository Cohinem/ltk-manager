import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { type Ray, Raycaster, Vector2, Vector3 } from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import { takeGizmoGrab } from "./PlaceableGizmo";

/** A press that travels further than this is a camera drag, in pixels. */
const CLICK_DISTANCE = 4;

const MIRROR = new Vector3(...AXIS_SIGN);

/** What a click on the canvas points at. */
export interface CanvasHit {
  /** The ray under the pointer, in the engine's space. */
  readonly ray: Ray;
  /** Where the pointer stood, in client pixels. */
  readonly at: readonly [number, number];
  readonly event: PointerEvent;
}

export interface CanvasClickProps {
  readonly onClick: (hit: CanvasHit) => void;
}

/**
 * Reports each left click on the canvas with the ray under it. A press that drags the camera,
 * and any press on a gizmo handle, is no click.
 */
export function CanvasClick({ onClick }: CanvasClickProps) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const handler = useRef(onClick);
  handler.current = onClick;

  useEffect(() => {
    let pressed: { x: number; y: number } | null = null;
    const raycaster = new Raycaster();

    const down = (event: PointerEvent) => {
      if (event.button === 0) pressed = { x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent) => {
      const start = pressed;
      pressed = null;
      if (takeGizmoGrab()) return;
      if (start === null || event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_DISTANCE) return;

      const rect = canvas.getBoundingClientRect();
      const pointer = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      /* The scene mirrors the engine by `AXIS_SIGN`, which is its own inverse. */
      const ray = raycaster.ray.clone();
      ray.origin.multiply(MIRROR);
      ray.direction.multiply(MIRROR);

      handler.current({ ray, at: [event.clientX, event.clientY], event });
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
    };
  }, [camera, canvas]);

  return null;
}
