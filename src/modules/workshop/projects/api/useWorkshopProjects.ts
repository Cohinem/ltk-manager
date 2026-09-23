import { useQuery } from "@tanstack/react-query";

import { projectDetailsQueries } from "./queries";

/** Every workshop project the configured directory holds. */
export function useWorkshopProjects() {
  return useQuery(projectDetailsQueries.all());
}
