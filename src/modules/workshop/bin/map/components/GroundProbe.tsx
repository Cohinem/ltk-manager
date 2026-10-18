import { useThree } from "@react-three/fiber";
import { type RefObject, useEffect } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";

import { AXIS_SIGN, type MapGeometry } from "@/modules/viewport";

import { pickMesh } from "../utils/meshSelection";

const MIRROR = new Vector3(...AXIS_SIGN);

/** The plane at height 0, which a ray that meets no mesh lands on. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Returns the point in the engine's space under `client`, a position in client pixels, or under
 * the canvas center for null. Returns null if the ray meets neither a shown mesh nor the ground.
 */
export type GroundProbeFn = (
  client: readonly [number, number] | null,
) => [number, number, number] | null;

export interface GroundProbeProps {
  readonly probe: RefObject<GroundProbeFn | null>;
  readonly drawn: MapGeometry | undefined;
  readonly shown: (mesh: number) => boolean;
}

/** Fills `probe` with a ground lookup through the canvas camera, for code outside the canvas. */
export function GroundProbe({ probe, drawn, shown }: GroundProbeProps) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    const raycaster = new Raycaster();
    probe.current = (client) => {
      const rect = canvas.getBoundingClientRect();
      const [x, y] = client ?? [rect.left + rect.width / 2, rect.top + rect.height / 2];
      raycaster.setFromCamera(
        new Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          -((y - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      /* The scene mirrors the engine by `AXIS_SIGN`, which is its own inverse. */
      const ray = raycaster.ray.clone();
      ray.origin.multiply(MIRROR);
      ray.direction.multiply(MIRROR);

      const hit = drawn === undefined ? null : pickMesh(drawn, ray, shown);
      if (hit !== null) return [...hit.point];
      const point = ray.intersectPlane(GROUND, new Vector3());
      return point === null ? null : [point.x, point.y, point.z];
    };
    return () => {
      probe.current = null;
    };
  }, [probe, camera, canvas, drawn, shown]);

  return null;
}
