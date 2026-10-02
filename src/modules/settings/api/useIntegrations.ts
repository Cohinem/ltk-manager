import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type FileTypeStatus,
  type IntegrationStatus,
  type IntegrationRelease,
  type IntegrationAction,
  type MenuConflictPolicy,
  type Tool,
} from "@/lib/tauri";
import { queryFn, queryFnWithArgs, unwrapForQuery } from "@/utils/query";

const statusKey = ["settings", "integrations"] as const;

/** Local installation state, refreshed across navigation and external changes. */
export function useIntegrations() {
  return useQuery(
    queryOptions<IntegrationStatus[], AppError>({
      queryKey: statusKey,
      queryFn: queryFn(api.integrations.status),
      refetchInterval: 1500,
      refetchOnWindowFocus: true,
    }),
  );
}

/** Release availability stays separate from local installation health. */
export function useIntegrationRelease(tool: Tool, enabled: boolean) {
  return useQuery(
    queryOptions<IntegrationRelease, AppError>({
      queryKey: ["settings", "integration-release", tool],
      queryFn: queryFnWithArgs(api.integrations.release, tool),
      enabled,
      staleTime: 10 * 60 * 1000,
      retry: false,
    }),
  );
}

/** Installation writes invalidate local state even after partial failure. */
export function useChangeIntegration(tool: Tool) {
  const client = useQueryClient();
  return useMutation<void, AppError, { action: IntegrationAction; conflicts: MenuConflictPolicy }>({
    mutationFn: async ({
      action,
      conflicts,
    }: {
      action: IntegrationAction;
      conflicts: MenuConflictPolicy;
    }) => {
      unwrapForQuery(await api.integrations.change(tool, action, conflicts));
    },
    onSettled: () => client.invalidateQueries({ queryKey: statusKey }),
  });
}

/** How often the file type status is read while the card is mounted. */
const FILE_TYPES_POLL_MS = 2000;

/**
 * Which program opens each mod file type.
 *
 * Polled rather than invalidated, because the switch applies its change after the
 * settings save and Default apps changes it outside the app.
 */
export function useFileTypes() {
  return useQuery(
    queryOptions<FileTypeStatus[], AppError>({
      queryKey: ["settings", "file-types"],
      queryFn: queryFn(api.integrations.fileTypeStatus),
      refetchInterval: FILE_TYPES_POLL_MS,
      refetchOnWindowFocus: true,
    }),
  );
}

/** Opens the app's page in Windows' Default apps settings. */
export function useOpenDefaultApps() {
  return useMutation<void, AppError>({
    mutationFn: async () => {
      unwrapForQuery(await api.integrations.openDefaultApps());
    },
  });
}

/** Cancellation applies only to the named download. */
export function useCancelIntegration() {
  const client = useQueryClient();
  return useMutation<void, AppError, string>({
    mutationFn: async (operationId: string) => {
      unwrapForQuery(await api.integrations.cancel(operationId));
    },
    onSettled: () => client.invalidateQueries({ queryKey: statusKey }),
  });
}
