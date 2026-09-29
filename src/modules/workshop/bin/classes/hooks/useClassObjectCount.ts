import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, type AppError, type ClassObjectCount, type HexBinHash } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

/* The leaf rather than the browser's barrel, which reaches this module back mid-evaluation. */
import { BUILDING_POLL_MS } from "../../../gameBrowser/api/keys";

const classObjectCountQuery = (classHash: HexBinHash) =>
  queryOptions<ClassObjectCount, AppError>({
    queryKey: ["class-object-count", classHash],
    queryFn: async () => unwrapForQuery(await api.objects.classCount(classHash)),
    refetchInterval: (query) =>
      query.state.data?.status === "building" ? BUILDING_POLL_MS : false,
    retry: false,
  });

/** How many objects of the install declare the class, or null while the index cannot say. */
export function useClassObjectCount(classHash: HexBinHash): number | null {
  const { data } = useQuery(classObjectCountQuery(classHash));
  return data?.status === "ready" ? data.count : null;
}
