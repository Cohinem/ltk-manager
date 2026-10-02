import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type IndexResponse,
  type ReferenceQuery,
  type ReferenceResult,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

/* The leaves rather than the browsers' barrels, which reach this module back through
   the documents registry mid-evaluation, their keys unbound. */
import { gameKeys } from "../../gameBrowser/api/keys";
import { pollUntilReady } from "../../shared/api/indexQueries";
import type { ReferenceRequest } from "../../state";

export const referenceKeys = {
  /* Under the object searches. The invalidation of a warm or a drop asks again. */
  all: [...gameKeys.objectSearches, "references"] as const,
  request: (request: ReferenceRequest | null) =>
    [
      ...gameKeys.objectSearches,
      "references",
      request?.query ?? null,
      request?.project ?? null,
    ] as const,
};

/** How long a walk's answer outlives the document that drew it: TanStack's own default. */
const WALK_GC_MS = 5 * 60 * 1000;

/** Whether a query is answered by a walk of every bin rather than by the index. */
export function isWalk(query: ReferenceQuery): boolean {
  return query.kind !== "class";
}

/** What the index and the walk answer about who points at a class or an object. */
export const referenceQueries = {
  /* An answer the build has not given asks again each second. The previous answer
     stays on screen while the next one arrives. A walk costs seconds, so its answer
     stands until Run again rather than being asked again on every mount and focus. */
  forRequest: (request: ReferenceRequest | null) => {
    const walk = request !== null && isWalk(request.query);
    return queryOptions<IndexResponse<ReferenceResult>, AppError>({
      queryKey: referenceKeys.request(request),
      queryFn: request
        ? queryFnWithArgs(api.objects.references, request.query, request.project)
        : skipToken,
      placeholderData: keepPreviousData,
      refetchInterval: (result) => pollUntilReady(result.state.data?.status),
      refetchOnWindowFocus: !walk,
      staleTime: walk ? Infinity : 0,
      gcTime: walk ? WALK_GC_MS : 0,
    });
  },
} as const;
