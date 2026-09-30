import { queryOptions, type UseQueryResult, useQueries } from "@tanstack/react-query";

import { type AppError, api } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { type ClassLayout, INHERITED_LAYOUTS } from "../utils/classLayouts";

/** Every class deriving from `base` at the install's build, held for the session. */
const derivedQuery = (base: string) =>
  queryOptions<string[], AppError>({
    queryKey: ["derived-classes", base],
    queryFn: async () => unwrapForQuery(await api.bin.derivedClasses(base)),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

const NO_LAYOUTS: ReadonlyMap<string, ClassLayout> = new Map();

/** The derived classes by the layout they take, the nearest listed base first. */
function combine(results: UseQueryResult<string[], AppError>[]): ReadonlyMap<string, ClassLayout> {
  if (results.every((result) => result.data === undefined)) return NO_LAYOUTS;

  const layouts = new Map<string, ClassLayout>();
  INHERITED_LAYOUTS.forEach(([, layout], at) => {
    for (const derived of results[at]?.data ?? []) {
      if (!layouts.has(derived)) layouts.set(derived, layout);
    }
  });
  return layouts;
}

/**
 * The layout each class takes from a base, by the class's hash, for a surface that has a class
 * hash and no schema read. Empty until the schema answers.
 */
export function useInheritedLayouts(): ReadonlyMap<string, ClassLayout> {
  return useQueries({
    queries: INHERITED_LAYOUTS.map(([base]) => derivedQuery(base)),
    combine,
  });
}
