import { mutationOptions } from "@tanstack/react-query";

import { api, type AppError, type PackProjectArgs, type PackResult } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

export const packMutations = {
  pack: () =>
    mutationOptions<PackResult, AppError, PackProjectArgs>({
      mutationFn: async (args) => unwrapForQuery(await api.packWorkshopProject(args)),
    }),
} as const;
