import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";

/** Create a new workshop project. */
export function useCreateProject() {
  return useMutation(projectDetailsMutations.create(useQueryClient()));
}
