import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, type AppError, type Incident } from "@/lib/tauri";
import { useIncidentLineStore } from "@/stores";
import { unwrapForQuery } from "@/utils/query";

import { diagnosticsKeys } from "./keys";

/**
 * Marks every incident dismissed in one round trip. Optimistic, as the single
 * dismiss is, and the rows stay in the list dimmed.
 */
export function useDismissAllIncidents() {
  const queryClient = useQueryClient();
  const clearLine = useIncidentLineStore((s) => s.clear);

  return useMutation<string[], AppError, void, { previous?: Incident[] }>({
    mutationFn: async () => unwrapForQuery(await api.diagnostics.dismissAllIncidents()),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: diagnosticsKeys.incidents() });
      const previous = queryClient.getQueryData<Incident[]>(diagnosticsKeys.incidents());
      queryClient.setQueryData<Incident[]>(diagnosticsKeys.incidents(), (old) =>
        old?.map((incident) => (incident.dismissed ? incident : { ...incident, dismissed: true })),
      );
      clearLine();
      return { previous };
    },
    onError: (_error, _void, context) => {
      if (context?.previous) {
        queryClient.setQueryData(diagnosticsKeys.incidents(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: diagnosticsKeys.incidents() });
    },
  });
}
