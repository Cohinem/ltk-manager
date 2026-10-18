import type { MapChunk, MapGeometryMesh } from "@/lib/tauri";

import { filtering, type OutlineFilter, type OutlineRow, outlineRows } from "./mapOutline";
import { meshId } from "./meshSelection";

/** The drag data type of a drag that carries the outliner's own selection. */
export const OUTLINER_DRAG_TYPE = "application/x-ltk-map-outliner";

/** The two collections of the outliner: the meshes of the `.mapgeo` and the chunks. */
export type SectionId = "section:meshes" | "section:placeables";

/** One row of the scene outliner: a collection, a controller group, a mesh, a chunk or a placeable. */
export type SceneRow =
  | OutlineRow
  | {
      readonly type: "section";
      readonly id: SectionId;
      readonly open: boolean;
      /** How many meshes or placeables it lists under the filter. */
      readonly count: number;
    }
  | {
      readonly type: "group";
      readonly id: string;
      /** The controller of its meshes, and null for meshes with none. */
      readonly controller: string | null;
      readonly meshes: readonly MapGeometryMesh[];
      readonly open: boolean;
    }
  | { readonly type: "mesh"; readonly id: string; readonly mesh: MapGeometryMesh };

/** The id of the group of meshes under `controller`, or of the meshes with none. */
export function groupId(controller: string | null): string {
  return `group:${controller ?? "none"}`;
}

/** How deep `row` sits in the tree, 1 for the top. */
export function rowLevel(row: SceneRow, sectioned: boolean): number {
  const base = sectioned ? 1 : 0;
  switch (row.type) {
    case "section":
      return 1;
    case "group":
    case "chunk":
      return base + 1;
    default:
      return base + 2;
  }
}

/** What the scene outliner lists and which parts the reader opened or shut. */
export interface SceneOutlineInput {
  readonly meshes: readonly MapGeometryMesh[];
  readonly chunks: readonly MapChunk[];
  readonly filter: OutlineFilter;
  /** The groups and chunks open in the unfiltered tree. */
  readonly opened: ReadonlySet<string>;
  /** The sections, groups and chunks the reader shut, which a filter or a section opens. */
  readonly shut: ReadonlySet<string>;
  /** The name a controller hash reads as. */
  readonly controllerName: (hash: string) => string;
}

/**
 * The scene flattened to the rows on screen.
 *
 * With meshes, two sections head the tree: Meshes, grouped by controller with the meshes of no
 * controller first, and Placeables, holding the chunks. Without meshes the chunks stand at the
 * top as they always did. A section is open unless shut, and a group opens as a chunk does.
 * The filter's kinds narrow the placeables and its `hideMeshes` leaves the meshes out, and its
 * text keeps the meshes whose material, controller or number holds it.
 */
export function sceneRows(input: SceneOutlineInput): SceneRow[] {
  const { meshes, chunks, filter, opened, shut } = input;
  const placed = outlineRows(chunks, opened, filter, shut);
  if (meshes.length === 0) return placed;

  const narrowed = filtering(filter);
  const kept = filter.hideMeshes === true ? [] : meshes.filter((mesh) => meshMatches(mesh, input));
  const rows: SceneRow[] = [];

  const meshesOpen = !shut.has("section:meshes");
  rows.push({ type: "section", id: "section:meshes", open: meshesOpen, count: kept.length });
  if (meshesOpen) {
    for (const [controller, held] of byController(kept, input.controllerName)) {
      const id = groupId(controller);
      const open = narrowed ? !shut.has(id) : opened.has(id);
      rows.push({ type: "group", id, controller, meshes: held, open });
      if (!open) continue;

      for (const mesh of held) rows.push({ type: "mesh", id: meshId(mesh.index), mesh });
    }
  }

  const placeablesOpen = !shut.has("section:placeables");
  const count = placed.reduce((total, row) => total + (row.type === "chunk" ? row.shown : 0), 0);
  rows.push({ type: "section", id: "section:placeables", open: placeablesOpen, count });
  if (placeablesOpen) rows.push(...placed);
  return rows;
}

function meshMatches(mesh: MapGeometryMesh, input: SceneOutlineInput): boolean {
  const text = input.filter.text.trim().toLowerCase();
  if (text === "") return true;

  const controller = mesh.controller === null ? "" : input.controllerName(mesh.controller);
  return (
    String(mesh.index).includes(text) ||
    controller.toLowerCase().includes(text) ||
    mesh.materials.some((material) => material.toLowerCase().includes(text))
  );
}

/** `meshes` grouped by controller: the ones with none first, then by controller name. */
function byController(
  meshes: readonly MapGeometryMesh[],
  name: (hash: string) => string,
): [string | null, MapGeometryMesh[]][] {
  const groups = new Map<string | null, MapGeometryMesh[]>();
  for (const mesh of meshes) {
    const held = groups.get(mesh.controller);
    if (held === undefined) groups.set(mesh.controller, [mesh]);
    else held.push(mesh);
  }
  return [...groups].sort(([a], [b]) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return name(a).localeCompare(name(b));
  });
}
