import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { projectDetailsMutations } from "./mutations";
import { projectDetailsQueries } from "./queries";

/** Reads the supported maps and their skins while `enabled`. */
export function useMapStarts(enabled: boolean) {
  return useQuery({ ...projectDetailsQueries.mapStarts(), enabled });
}

/** Creates a map project. */
export function useCreateMapProject() {
  return useMutation(projectDetailsMutations.createMap(useQueryClient()));
}
