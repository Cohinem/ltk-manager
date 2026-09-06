import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type ClassSchema } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

export const classSchemaKeys = {
  class: (classHash: string) => ["class-schema", classHash] as const,
};

/**
 * One class's fields and their declared kinds at the install's build.
 *
 * Null for a class the schema does not describe. Held for the session, per "The class
 * card" in docs/ux/BIN_EDITOR.md.
 */
export function useClassSchema(classHash: string) {
  return useQuery<ClassSchema | null, AppError>({
    queryKey: classSchemaKeys.class(classHash),
    queryFn: async () => unwrapForQuery(await api.classSchema(classHash)),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
