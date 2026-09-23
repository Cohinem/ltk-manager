import {
  Bone,
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IntType,
  PlaneGeometry,
  Skeleton,
  SphereGeometry,
  Uint16BufferAttribute,
} from "three";

import type { Bounds } from "../camera/utils/framing";

/** A shape a material is previewed on. */
export type PreviewShape = "sphere" | "cube" | "plane" | "cylinder";

export const PREVIEW_SHAPES: readonly PreviewShape[] = ["sphere", "cube", "plane", "cylinder"];

/** The radius a preview shape is built to, in engine units, about a champion's torso. */
export const PREVIEW_RADIUS = 60;

/** The box every preview shape fits, standing on the ground at the origin. */
export const PREVIEW_BOUNDS: Bounds = {
  min: [-PREVIEW_RADIUS, 0, -PREVIEW_RADIUS],
  max: [PREVIEW_RADIUS, PREVIEW_RADIUS * 2, PREVIEW_RADIUS],
};

const SPHERE_SEGMENTS = [64, 32] as const;
const CYLINDER_SEGMENTS = 48;
const CUBE_SIDE = PREVIEW_RADIUS * 1.5;

/**
 * `shape` as the engine stores a mesh, carrying the vertex streams a translated program reads.
 *
 * A `.skn` winds its faces as three's primitives do and draws under the mirrored object
 * transform of `AXIS_SIGN`, so the positions stay as built and only the texture turns:
 * the columns run backwards against that mirror and the rows run top down. Every vertex is
 * white under `a_COLOR`, and a skinned shape binds wholly to joint 0 under
 * `a_BLENDWEIGHT` and `a_BLENDINDICES`, which a skinned program reads its world transform
 * through.
 */
export function previewGeometry(shape: PreviewShape, skinned: boolean): BufferGeometry {
  const geometry = shapeGeometry(shape);
  geometry.translate(0, PREVIEW_RADIUS, 0);

  const uv = geometry.getAttribute("uv");
  for (let at = 0; at < uv.count; at += 1) {
    uv.setXY(at, 1 - uv.getX(at), 1 - uv.getY(at));
  }

  const vertices = geometry.getAttribute("position").count;
  const color = new Float32BufferAttribute(new Float32Array(vertices * 4).fill(1), 4);
  geometry.setAttribute("color", color);
  geometry.setAttribute("a_POSITION", geometry.getAttribute("position"));
  geometry.setAttribute("a_NORMAL", geometry.getAttribute("normal"));
  geometry.setAttribute("a_TEXCOORD", uv);
  geometry.setAttribute("a_COLOR", color);

  if (skinned) {
    const weights = new Float32Array(vertices * 4);
    for (let vertex = 0; vertex < vertices; vertex += 1) {
      weights[vertex * 4] = 1;
    }

    const weight = new Float32BufferAttribute(weights, 4);
    const joints = new Uint16BufferAttribute(new Uint16Array(vertices * 4), 4);
    const shaderJoints = new Uint16BufferAttribute(new Uint16Array(vertices * 4), 4);
    shaderJoints.gpuType = IntType;
    geometry.setAttribute("skinWeight", weight);
    geometry.setAttribute("skinIndex", joints);
    geometry.setAttribute("a_BLENDWEIGHT", weight);
    geometry.setAttribute("a_BLENDINDICES", shaderJoints);
  }

  return geometry;
}

/** One bone at the origin, which a skinned preview shape binds to and turns by. */
export function previewSkeleton(): Skeleton {
  return new Skeleton([new Bone()]);
}

function shapeGeometry(shape: PreviewShape): BufferGeometry {
  switch (shape) {
    case "cube":
      return new BoxGeometry(CUBE_SIDE, CUBE_SIDE, CUBE_SIDE);
    case "plane":
      return new PlaneGeometry(PREVIEW_RADIUS * 2, PREVIEW_RADIUS * 2);
    case "cylinder":
      return new CylinderGeometry(
        PREVIEW_RADIUS,
        PREVIEW_RADIUS,
        PREVIEW_RADIUS * 2,
        CYLINDER_SEGMENTS,
      );
    default:
      return new SphereGeometry(PREVIEW_RADIUS, ...SPHERE_SEGMENTS);
  }
}
