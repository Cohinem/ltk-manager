import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type SearchHits,
  type IndexResponse,
  type ModuleObject,
  type ObjectDirListing,
  type ObjectFindHit,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { CONTENT_SCAN_STALE_MS } from "../../shared/api/freshness";
/* The leaves rather than the browser's barrel. The barrel reaches this module back
   through the documents registry mid-evaluation, its keys unbound. */
import {
  liveSearchOptions,
  pollUntilReady,
  supersededResponse,
} from "../../shared/api/indexQueries";
import { DECLARATIONS_OUTLINE_ROOT } from "../../shared/api/keys";
import { objectKeys } from "./keys";

/** The object tree of the install, in the slot the index is in. */
export const objectTreeQueries = {
  /* The install's for the session. A warm or a drop settling asks again, and an
     answer the build has not given asks again each second. A prefix the index does not hold
     fails the same way every time, and a prefix only the project holds is one, so no retry. */
  dir: (prefix: string) =>
    queryOptions<IndexResponse<ObjectDirListing>, AppError>({
      queryKey: objectKeys.dir(prefix),
      queryFn: queryFnWithArgs(api.objects.dir, prefix),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => pollUntilReady(query.state.data?.status),
    }),

  /* A pattern that does not parse resolves as an error and leaves the last good
     answer in `data`. */
  find: (pattern: string, regex: boolean, cls: string | null, active: boolean) =>
    queryOptions<IndexResponse<SearchHits<ObjectFindHit>>, AppError>({
      queryKey: objectKeys.find(pattern, regex, cls),
      queryFn: active ? queryFnWithArgs(api.objects.find, pattern, regex, cls) : skipToken,
      ...liveSearchOptions(supersededResponse, (answer) => pollUntilReady(answer.status)),
    }),

  /* Under the outline's root, so a declared edit asks again. Refetched on focus the way the
     outline is, and each second while the index builds, since a clone takes its class from it. */
  moduleObjects: (projectPath: string | undefined) =>
    queryOptions<IndexResponse<ModuleObject[]>, AppError>({
      queryKey: [...DECLARATIONS_OUTLINE_ROOT, projectPath ?? "", "module-objects"],
      queryFn: projectPath ? queryFnWithArgs(api.objects.moduleObjects, projectPath) : skipToken,
      refetchOnWindowFocus: true,
      staleTime: CONTENT_SCAN_STALE_MS,
      refetchInterval: (query) => pollUntilReady(query.state.data?.status),
    }),
} as const;
