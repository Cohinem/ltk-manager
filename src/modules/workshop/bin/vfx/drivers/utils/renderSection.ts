import { nameHash } from "../../../shared/utils/binHash";
import {
  type EmitterGroup,
  fieldGroup,
  TEXTURE_EFFECT_FIELDS,
} from "../../inspector/utils/emitterGroups";
import type { FileItem, InputItem, MasterItem, RenderItem } from "./graphItems";

/**
 * Which component node gathers a field of the emitter: the Texture node or the Geometry node.
 * Per "What gets a node" in docs/ux/VFX_GRAPH.md.
 */
export type ComponentRole = "texture" | "geometry";

/** The inspector groups a Texture node draws, the fields `VfxLegacyRenderComponent` gathers. */
const RENDER_GROUPS: ReadonlySet<EmitterGroup> = new Set(["texture", "render", "stencil"]);

/** The group a master node draws the Texture node's input under. */
export const RENDER_GROUP: EmitterGroup = "texture";

/** The group a master node draws the Geometry node's input under. */
export const GEOMETRY_GROUP: EmitterGroup = "primitive";

/** The master group each component node's fields gather under, by role. */
export const COMPONENT_GROUP: Readonly<Record<ComponentRole, EmitterGroup>> = {
  texture: RENDER_GROUP,
  geometry: GEOMETRY_GROUP,
};

const TEXTURE_FIELD = nameHash("texture");
const PRIMITIVE_FIELD = nameHash("primitive");
const FLEX_SHAPE_FIELD = nameHash("FlexShapeDefinition");

/**
 * The fields a spawn shape is written in: `SpawnShape`, which the engine reads, and `shape`,
 * which the inspector also names Spawn Shape.
 */
const SHAPE_FIELDS: ReadonlySet<string> = new Set([nameHash("SpawnShape"), nameHash("shape")]);

/** The structs the Geometry node draws as sections: the spawn shape, its flex overrides, the primitive. */
const GEOMETRY_SECTIONS: ReadonlySet<string> = new Set([
  ...SHAPE_FIELDS,
  FLEX_SHAPE_FIELD,
  PRIMITIVE_FIELD,
]);

/** The effects a Texture node folds in as sections of its own, as the inspector's Texture holds them. */
const TEXTURE_EFFECTS: ReadonlySet<string> = new Set(
  TEXTURE_EFFECT_FIELDS.map((name) => nameHash(name)),
);

/** The fields that change how a particle's primitive stands, which the Geometry node lists over its sections. */
const ORIENTATION_FIELDS: ReadonlySet<string> = new Set(
  [
    "isDirectionOriented",
    "directionVelocityScale",
    "directionVelocityMinScale",
    "isLocalOrientation",
    "particleIsLocalOrientation",
  ].map((name) => nameHash(name)),
);

/** The group of a master node a field of the emitter falls in, by its hash. */
export function masterGroup(hash: string): EmitterGroup {
  if (GEOMETRY_SECTIONS.has(hash) || ORIENTATION_FIELDS.has(hash)) return GEOMETRY_GROUP;

  const group = fieldGroup(hash);
  return RENDER_GROUPS.has(group) ? RENDER_GROUP : group;
}

/** The component node a master group's fields gather in, and null for a group the master keeps. */
export function componentOf(group: EmitterGroup): ComponentRole | null {
  if (group === RENDER_GROUP) return "texture";
  if (group === GEOMETRY_GROUP) return "geometry";
  return null;
}

/** The component node a master group's input connects, and null for a group the master keeps. */
export function componentInput(item: MasterItem, group: EmitterGroup): RenderItem | null {
  const role = componentOf(group);
  if (role === "texture") return item.render;
  if (role === "geometry") return item.geometry;
  return null;
}

/** The emitter field holding its forces, `VfxFieldCollectionDefinitionData`. */
export const FORCE_FIELD = nameHash("fieldCollectionDefinition");

/** The group a master node draws its forces under, which it draws even with none. */
export const FORCE_GROUP: EmitterGroup = masterGroup(FORCE_FIELD);

/**
 * The order a component node lists its fields in. A Texture node: the texture, file order, then
 * its effects. A Geometry node: the orientation rows, the spawn shape, its flex overrides, then
 * the primitive.
 */
export function renderRank(hash: string): number {
  if (hash === TEXTURE_FIELD || ORIENTATION_FIELDS.has(hash)) return 0;
  if (SHAPE_FIELDS.has(hash)) return 1;
  if (hash === FLEX_SHAPE_FIELD) return 2;
  if (hash === PRIMITIVE_FIELD) return 3;
  return TEXTURE_EFFECTS.has(hash) ? 2 : 1;
}

/**
 * Whether a field's input draws inside its component node rather than as a node of its own: the
 * texture's file on its row, and an effect's, the spawn shape's or the primitive's struct as a
 * section under the rows.
 */
export function drawnInSection(hash: string, input: InputItem | null): boolean {
  if (hash === TEXTURE_FIELD) return input?.type === "file";
  if (GEOMETRY_SECTIONS.has(hash)) return input?.type === "struct";
  return TEXTURE_EFFECTS.has(hash) && input?.type === "struct";
}

/** The texture a Texture node draws, where the emitter writes one. */
export function renderTexture(item: RenderItem): FileItem | null {
  const input = item.fields.find((each) => each.hash === TEXTURE_FIELD)?.input ?? null;
  return input?.type === "file" ? input : null;
}
