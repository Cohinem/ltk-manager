import { projectDetailsMutations } from "../projects/api/mutations";
import { stringOverrideMutations } from "../string-overrides/api/mutations";

export const projectMutations = {
  create: projectDetailsMutations.create,
  remove: projectDetailsMutations.remove,
  rename: projectDetailsMutations.rename,
  saveConfig: projectDetailsMutations.saveConfig,
  setThumbnail: projectDetailsMutations.setThumbnail,
  removeThumbnail: projectDetailsMutations.removeThumbnail,
  saveStringOverrides: stringOverrideMutations.saveStringOverrides,
} as const;

export * from "../ignore-rules/api/mutations";
export * from "../imports/api/mutations";
export type {
  RemoveThumbnailVariables,
  RenameProjectVariables,
  SetThumbnailVariables,
} from "../projects/api/mutations";
export type { SaveStringOverridesVariables } from "../string-overrides/api/mutations";
export * from "../text-files/api/mutations";
