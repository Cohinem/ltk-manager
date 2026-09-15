import { useQuery } from "@tanstack/react-query";

import { problemQueries } from "./queries";

/** A project checked against everything packing requires of it. */
export function useValidateProject(projectPath: string, enabled = true) {
  return useQuery(problemQueries.validation(enabled ? projectPath : undefined));
}
