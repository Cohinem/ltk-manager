import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";

/** Save a project's configuration. */
export function useSaveProjectConfig() {
  return useMutation(projectDetailsMutations.saveConfig(useQueryClient()));
}
