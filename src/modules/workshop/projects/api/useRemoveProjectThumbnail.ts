import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";

export type { RemoveThumbnailVariables } from "./mutations";

/** Remove a project's thumbnail image. */
export function useRemoveProjectThumbnail() {
  return useMutation(projectDetailsMutations.removeThumbnail(useQueryClient()));
}
