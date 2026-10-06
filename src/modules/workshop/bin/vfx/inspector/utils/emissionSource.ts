import { m } from "@/i18n";
import type { ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";

/** The emitter field that holds the emission surface. */
export const SURFACE_FIELD = nameHash("emissionSurfaceDefinition");

/** The class `emissionSurfaceDefinition` points at. */
export const SURFACE_CLASS = "VfxEmissionSurfaceData";

/** Field hashes of `VfxEmissionSurfaceData` and of the classes its two parts point at. */
export const SURFACE = {
  surface: nameHash("EmissionSurface"),
  generator: nameHash("ParticleSpawnDataGenerator"),
  mesh: nameHash("meshName"),
  skeleton: nameHash("skeletonName"),
  submeshes: nameHash("Submeshes"),
  joints: nameHash("JointMask"),
  animation: nameHash("AnimationName"),
} as const;

/** A class that a part of the surface can point at, with its picker text. */
export interface SourceClass {
  readonly name: string;
  /** `0x` and eight hex digits. */
  readonly hash: string;
  readonly label: () => string;
  readonly description: () => string;
}

function sourceClass(name: string, label: () => string, description: () => string): SourceClass {
  return { name, hash: nameHash(name), label, description };
}

export const MESH_SURFACE = sourceClass(
  "VfxEmissionMeshData",
  m.workshop_bin_vfx_surface_mesh_label,
  m.workshop_bin_vfx_surface_mesh_description,
);

export const SKELETON_SURFACE = sourceClass(
  "VfxEmissionSkeletonData",
  m.workshop_bin_vfx_surface_skeleton_label,
  m.workshop_bin_vfx_surface_skeleton_description,
);

export const LINKED_SURFACE = sourceClass(
  "VfxEmissionLinkedMeshData",
  m.workshop_bin_vfx_surface_linked_label,
  m.workshop_bin_vfx_surface_linked_description,
);

/** The classes deriving from `IVfxEmissionSurface`, in picker order. */
export const SURFACE_CLASSES: readonly SourceClass[] = [
  MESH_SURFACE,
  SKELETON_SURFACE,
  LINKED_SURFACE,
];

/** The classes deriving from `IParticleSpawnDataGenerator`. */
export const GENERATOR_CLASSES: readonly SourceClass[] = [
  sourceClass(
    "NavigationGridParticleSpawnDataGenerator",
    m.workshop_bin_vfx_generator_nav_grid_label,
    m.workshop_bin_vfx_generator_nav_grid_description,
  ),
];

function hex(hash: string): string {
  return hash.slice(2);
}

/**
 * Edits of `emissionSurfaceDefinition` that set the class of the pointer `part`.
 *
 * A null `classHash` clears the pointer. The edits create the definition and the part's
 * property when the emitter has none.
 */
export function partEdits(part: string, classHash: string | null): ValueEdit[] {
  return [
    { type: "ensurePointer", path: "", class: SURFACE_CLASS },
    { type: "ensureProperty", path: "", field: part },
    { type: "replacePointer", path: hex(part), class: classHash },
  ];
}

/** Edits of a surface struct that write a string to each `[field, value]` pair of `names`. */
export function nameEdits(names: readonly (readonly [string, string])[]): ValueEdit[] {
  return names.flatMap(([field, value]): ValueEdit[] => [
    { type: "ensureProperty", path: "", field },
    { type: "setLeaf", path: hex(field), value: { type: "string", value } },
  ]);
}

/** Edits of a hash list with `count` items that append the hash of `name`. */
export function addNameEdits(count: number, name: string): ValueEdit[] {
  return [
    { type: "insertItem", path: "", item: { index: null, key: null, class: null } },
    { type: "setLeaf", path: `[${count}]`, value: { type: "hash", text: name } },
  ];
}

/** The edit of a hash list that removes the item at `index`. */
export function removeNameEdits(index: number): ValueEdit[] {
  return [{ type: "removeItem", path: `[${index}]` }];
}
