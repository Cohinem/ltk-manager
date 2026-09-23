import { queryOptions, skipToken } from "@tanstack/react-query";

import { api, type AppError, type ContentTree } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { CONTENT_SCAN_STALE_MS } from "../../shared/api/freshness";
import { workshopKeys } from "../../shared/api/keys";

export const contentQueries = {
  /* Refetches on window focus so external edits to the content directory surface
     without a manual refresh, throttled by `CONTENT_SCAN_STALE_MS`. Every
     mutation that writes into a layer invalidates the key directly, so a change
     made in the app never waits for that interval. */
  contentTree: (projectPath: string | undefined) =>
    queryOptions<ContentTree, AppError>({
      queryKey: workshopKeys.contentTree(projectPath ?? ""),
      queryFn: projectPath ? queryFnWithArgs(api.getProjectContentTree, projectPath) : skipToken,
      refetchOnWindowFocus: true,
      staleTime: CONTENT_SCAN_STALE_MS,
    }),
} as const;
