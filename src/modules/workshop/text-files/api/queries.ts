import { queryOptions, skipToken } from "@tanstack/react-query";

import { api, type AppError, type ProjectText, type ProjectTextFile } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { CONTENT_SCAN_STALE_MS } from "../../shared/api/freshness";
import { workshopKeys } from "../../shared/api/keys";

export const projectTextQueries = {
  /* Refetched on focus for the reason the rules are: a creator writes prose in
     a real editor as readily as in this one. */
  projectText: (projectPath: string | undefined, file: ProjectTextFile) =>
    queryOptions<ProjectText, AppError>({
      queryKey: workshopKeys.projectText(projectPath ?? "", file),
      queryFn: projectPath
        ? async () => unwrapForQuery(await api.projectText.read(projectPath, file))
        : skipToken,
      refetchOnWindowFocus: true,
      staleTime: CONTENT_SCAN_STALE_MS,
    }),
} as const;
