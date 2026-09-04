import { useMutation, useQueryClient } from "@tanstack/react-query";

import { beginReorderHold } from "@/hooks";
import { api, type AppError, type InstalledMod } from "@/lib/tauri";
import { promoteToFolderFront } from "@/modules/library/utils";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

interface EnableModWithLayersVariables {
  modId: string;
  layerStates: Record<string, boolean>;
}

export function useEnableModWithLayers() {
  const queryClient = useQueryClient();

  return useMutation<void, AppError, EnableModWithLayersVariables, { previous?: InstalledMod[] }>({
    mutationFn: async ({ modId, layerStates }) => {
      const result = await api.enableModWithLayers(modId, layerStates);
      return unwrapForQuery(result);
    },
    onMutate: async ({ modId, layerStates }) => {
      beginReorderHold();

      await queryClient.cancelQueries({ queryKey: libraryKeys.mods() });

      const previous = queryClient.getQueryData<InstalledMod[]>(libraryKeys.mods());

      queryClient.setQueryData<InstalledMod[]>(libraryKeys.mods(), (old) => {
        if (!old) return old;
        const next = old.map((mod) =>
          mod.id === modId
            ? {
                ...mod,
                enabled: true,
                layers: mod.layers.map((layer) => ({
                  ...layer,
                  enabled: layerStates[layer.name] ?? layer.enabled,
                })),
              }
            : mod,
        );
        return promoteToFolderFront(next, modId);
      });

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(libraryKeys.mods(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.mods() });
    },
  });
}
