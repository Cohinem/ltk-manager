import { queryOptions } from "@tanstack/react-query";

import { api, type BinDocumentId, type EffectSystem } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { GAME_SANDBOX } from "../../../sandbox/utils/sandboxRef";

export const abilityQueries = {
  effect: (document: BinDocumentId, effect: EffectSystem) =>
    queryOptions({
      queryKey: ["spell", "ability-effect", document, effect],
      queryFn: async ({ signal }) => {
        if (effect.source === null)
          return unwrapForQuery(await api.bin.readVfxSystem(document, effect.system));
        const opened = unwrapForQuery(
          await api.bin.open(GAME_SANDBOX, effect.source, effect.system),
        );
        try {
          signal.throwIfAborted();
          return unwrapForQuery(await api.bin.readVfxSystem(opened.document, effect.system));
        } finally {
          await api.bin.close(opened.document);
        }
      },
      staleTime: Infinity,
      retry: false,
    }),
};
