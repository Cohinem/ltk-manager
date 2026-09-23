import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";

export type { SetThumbnailVariables } from "./mutations";

/** Set a project's thumbnail image. */
export function useSetProjectThumbnail() {
  return useMutation(projectDetailsMutations.setThumbnail(useQueryClient()));
}
