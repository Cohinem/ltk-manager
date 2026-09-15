import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";

/** Delete a workshop project, and the editor strip it left behind. */
export function useDeleteProject() {
  return useMutation(projectDetailsMutations.remove(useQueryClient()));
}
