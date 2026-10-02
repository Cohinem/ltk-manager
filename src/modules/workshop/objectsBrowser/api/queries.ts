import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type SearchHits,
  type IndexResponse,
  type ObjectDirListing,
  type ObjectFindHit,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

/* The leaves rather than the browser's barrel. The barrel reaches this module back
   through the documents registry mid-evaluation, its keys unbound. */
import {
  liveSearchOptions,
  pollUntilReady,
  supersededResponse,
} from "../../shared/api/indexQueries";
import { objectKeys } from "./keys";

/** The object tree of the install, in the slot the index is in. */
export const objectTreeQueries = {
  /* The install's for the session. A warm or a drop settling asks again, and an
     answer the build has not given asks again each second. */
  dir: (prefix: string) =>
    queryOptions<IndexResponse<ObjectDirListing>, AppError>({
      queryKey: objectKeys.dir(prefix),
      queryFn: queryFnWithArgs(api.objects.dir, prefix),
      staleTime: Infinity,
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
} as const;
