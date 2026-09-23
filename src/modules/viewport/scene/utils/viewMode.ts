import { type Color, MeshBasicMaterial } from "three";

/** How a viewport draws its meshes: lit, unlit, lit without textures, or as edges alone. */
export type ViewMode = "lit" | "unshaded" | "untextured" | "wireframe";

/** The modes in the order a menu lists them. */
export const VIEW_MODES: readonly ViewMode[] = ["lit", "unshaded", "untextured", "wireframe"];

/** Which triangle edges a viewport draws: none, alone in place of the surfaces, or over them. */
export type Edges = "none" | "alone" | "over";

/**
 * What a mesh's surfaces draw with: its own materials, its textures without light, or a
 * flat neutral under light.
 */
export type Surface = "material" | "unlit" | "untextured";

/** How much of the shading an edge drawn over it covers, which leaves the surface readable. */
export const EDGE_OVERLAY_OPACITY = 0.35;

/** Whether `mode` draws the solid surfaces at all. */
export function drawsSolids(mode: ViewMode): boolean {
  return mode !== "wireframe";
}

/** Whether the wireframe overlay draws over `mode`. */
export function takesWireOverlay(mode: ViewMode): boolean {
  return mode === "lit" || mode === "untextured";
}

/** The edges `mode` draws, with the wireframe overlay on or off. */
export function edgesOf(mode: ViewMode, overlay: boolean): Edges {
  if (mode === "wireframe") return "alone";
  return overlay && takesWireOverlay(mode) ? "over" : "none";
}

/** What `mode` draws a surface with. Every surface but `material` bypasses the game's shaders. */
export function surfaceOf(mode: ViewMode): Surface {
  if (mode === "unshaded") return "unlit";
  if (mode === "untextured") return "untextured";
  return "material";
}

/**
 * The flat material a mesh's `edges` draw in.
 *
 * Part transparent over the shading, and without depth writes there so the surface under
 * an edge keeps its own depth.
 */
export function createEdgeMaterial(
  colour: Color,
  edges: Exclude<Edges, "none">,
): MeshBasicMaterial {
  const overlay = edges === "over";
  return new MeshBasicMaterial({
    color: colour,
    wireframe: true,
    transparent: overlay,
    opacity: overlay ? EDGE_OVERLAY_OPACITY : 1,
    depthWrite: !overlay,
  });
}
