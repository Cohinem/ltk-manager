import { type Color, MeshBasicMaterial } from "three";

/** How a viewport draws its meshes: lit, unlit, as triangle edges, or edges over lit. */
export type ViewMode = "lit" | "unshaded" | "wireframe" | "overlay";

/** The modes in the order a menu lists them. */
export const VIEW_MODES: readonly ViewMode[] = ["lit", "unshaded", "wireframe", "overlay"];

/** How much of the shading an edge drawn over it covers, which leaves the surface readable. */
export const EDGE_OVERLAY_OPACITY = 0.35;

/** Whether `mode` draws the solid surfaces at all. */
export function drawsSolids(mode: ViewMode): boolean {
  return mode !== "wireframe";
}

/** Whether `mode` draws triangle edges. */
export function drawsEdges(mode: ViewMode): boolean {
  return mode === "wireframe" || mode === "overlay";
}

/** Whether `mode` draws a surface without light, its base texture alone. */
export function drawsUnlit(mode: ViewMode): boolean {
  return mode === "unshaded";
}

/**
 * The flat material a mesh's edges draw in under `mode`.
 *
 * Part transparent over the shading, and without depth writes there so the surface under
 * an edge keeps its own depth.
 */
export function createEdgeMaterial(colour: Color, mode: ViewMode): MeshBasicMaterial {
  const overlay = mode === "overlay";
  return new MeshBasicMaterial({
    color: colour,
    wireframe: true,
    transparent: overlay,
    opacity: overlay ? EDGE_OVERLAY_OPACITY : 1,
    depthWrite: !overlay,
  });
}
