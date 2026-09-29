import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api, type VfxTemplate, type VfxTemplateKind } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

export const templateQueries = {
  all: () =>
    queryOptions({
      queryKey: ["vfx-templates"],
      queryFn: async () => unwrapForQuery(await api.bin.vfxTemplates()),
      staleTime: Infinity,
      retry: false,
    }),
};

/** The catalog's templates of `kind`, in its order, and none while the catalog loads. */
export function useVfxTemplates(kind: VfxTemplateKind): readonly VfxTemplate[] {
  const { data } = useQuery(templateQueries.all());
  return useMemo(() => (data ?? []).filter((template) => template.kind === kind), [data, kind]);
}
