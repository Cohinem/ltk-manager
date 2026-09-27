import { nameHash } from "../../../shared/utils/binHash";
import {
  type EmitterGroup,
  fieldGroup,
  TEXTURE_EFFECT_FIELDS,
} from "../../inspector/utils/emitterGroups";
import type { FileItem, InputItem, RenderItem } from "./graphItems";

/** The inspector groups a Texture node draws, the fields `VfxLegacyRenderComponent` gathers. */
const RENDER_GROUPS: ReadonlySet<EmitterGroup> = new Set(["texture", "render"]);

/** The group a master node draws the Texture node's input under. */
export const RENDER_GROUP: EmitterGroup = "texture";

const TEXTURE_FIELD = nameHash("texture");

/** The effects a Texture node folds in as sections of its own, as the inspector's Texture holds them. */
const TEXTURE_EFFECTS: ReadonlySet<string> = new Set(
  TEXTURE_EFFECT_FIELDS.map((name) => nameHash(name)),
);

/** The group of a master node a field of the emitter falls in, by its hash. */
export function masterGroup(hash: string): EmitterGroup {
  const group = fieldGroup(hash);
  return RENDER_GROUPS.has(group) ? RENDER_GROUP : group;
}

/** The emitter field holding its forces, `VfxFieldCollectionDefinitionData`. */
export const FORCE_FIELD = nameHash("fieldCollectionDefinition");

/** The group a master node draws its forces under, which it draws even with none. */
export const FORCE_GROUP: EmitterGroup = masterGroup(FORCE_FIELD);

/** The order a Texture node lists its fields in: the texture, file order, then its effects. */
export function renderRank(hash: string): number {
  if (hash === TEXTURE_FIELD) return 0;
  return TEXTURE_EFFECTS.has(hash) ? 2 : 1;
}

/**
 * Whether a field's input draws inside the Texture node rather than as a node of its own: the
 * texture's file on its row, and an effect's struct as a section under the rows.
 */
export function drawnInSection(hash: string, input: InputItem | null): boolean {
  if (hash === TEXTURE_FIELD) return input?.type === "file";
  return TEXTURE_EFFECTS.has(hash) && input?.type === "struct";
}

/** The texture a Texture node draws, where the emitter writes one. */
export function renderTexture(item: RenderItem): FileItem | null {
  const input = item.fields.find((each) => each.hash === TEXTURE_FIELD)?.input ?? null;
  return input?.type === "file" ? input : null;
}
