import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type DeclaredObjects,
  type IndexAnswer,
  type ObjectSearchResult,
  type SandboxRef,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { gameKeys } from "../../gameBrowser/api/keys";
import { GAME_SANDBOX } from "../../sandbox/utils/sandboxRef";
import {
  liveSearchOptions,
  pollUntilReady,
  pollWhileBuilding,
  supersededAnswer,
} from "../../shared/api/indexQueries";

/** What the object index answers, and how it reports a build still running. */
export const objectIndexQueries = {
  /* Asked whatever the Objects switch says, and asked again each second while a
     build runs. A ready answer never refetches on its own, and a warm or a drop
     settling asks again. */
  declarations: (objectHashes: readonly string[], sandbox: SandboxRef = GAME_SANDBOX) =>
    queryOptions<DeclaredObjects, AppError>({
      queryKey: [...gameKeys.declaredObjects(objectHashes), sandbox],
      queryFn:
        objectHashes.length > 0
          ? queryFnWithArgs(api.objects.declared, sandbox, [...objectHashes])
          : skipToken,
      staleTime: Infinity,
      refetchInterval: (query) => pollWhileBuilding(query.state.data?.index.status),
    }),

  /* The answer carries the slot the index is in, so a query typed while the build
     runs reads as building rather than as nothing, and asks again until the build
     lands. */
  search: (query: string, active: boolean) =>
    queryOptions<IndexAnswer<ObjectSearchResult>, AppError>({
      queryKey: gameKeys.objectSearch(query),
      queryFn: active ? queryFnWithArgs(api.objects.search, query) : skipToken,
      ...liveSearchOptions(supersededAnswer, (answer) => pollUntilReady(answer.status)),
    }),
} as const;
