import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";

export type { RenameProjectVariables } from "./mutations";

/** Rename a workshop project, which moves its directory. */
export function useRenameProject() {
  return useMutation(projectDetailsMutations.rename(useQueryClient()));
}
