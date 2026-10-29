import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, type AppError, type HexBinHash, type IndexResponse } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

/* The leaf rather than the browser's barrel, which reaches this module back mid-evaluation. */
import { useModuleObjects } from "../../../objectsBrowser/hooks/useModuleObjects";
import { createdOfClass } from "../../../objectsBrowser/utils/moduleObjects";
import { pollWhileBuilding, readyValue } from "../../../shared/api/indexQueries";

const classObjectCountQuery = (classHash: HexBinHash) =>
  queryOptions<IndexResponse<number>, AppError>({
    queryKey: ["class-object-count", classHash],
    queryFn: queryFnWithArgs(api.objects.classCount, classHash),
    refetchInterval: (query) => pollWhileBuilding(query.state.data?.status),
    retry: false,
  });

/**
 * How many objects of the install declare the class, and how many the project's game data
 * declarations create. Null while the index cannot say.
 */
export function useClassObjectCount(classHash: HexBinHash): number | null {
  const { data } = useQuery(classObjectCountQuery(classHash));
  const modules = useModuleObjects();
  const installed = readyValue(data);
  if (installed === undefined) return null;

  return installed + createdOfClass(modules, classHash);
}
