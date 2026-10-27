import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type PackFormat,
  type Prefill,
  type PublishAnswer,
  type PublishOutcome,
  type PublishRequest,
  type PublishResult,
  type PublishReview,
  type RuneforgeStatus,
} from "@/lib/tauri";
import { settingsKeys } from "@/modules/settings/api";
import { mutationFn, unwrapForQuery } from "@/utils/query";

import { runeforgeKeys } from "./keys";

/** The variables of a prepare: the project to pack and the format to pack it in. */
export interface PrepareVariables {
  projectPath: string;
  format: PackFormat;
}

/** The variables of a submit: the project to stamp and what to create. */
export interface SubmitVariables {
  projectPath: string;
  request: PublishRequest;
}

/** Writes the connection status the command answered, and rereads what depends on the account. */
function connectionChanged(client: QueryClient, status: RuneforgeStatus): Promise<void> {
  client.setQueryData(runeforgeKeys.status(), status);
  client.removeQueries({ queryKey: runeforgeKeys.ownedMods() });
  client.removeQueries({ queryKey: runeforgeKeys.context() });
  return client.invalidateQueries({ queryKey: settingsKeys.settings() });
}

/** Ways the app changes the connection or publishes through it. */
export const runeforgeMutations = {
  connect: (client: QueryClient) =>
    mutationOptions<RuneforgeStatus, AppError, string>({
      mutationFn: mutationFn(api.runeforge.connect),
      onSuccess: (status) => connectionChanged(client, status),
      meta: { silentError: true },
    }),

  disconnect: (client: QueryClient) =>
    mutationOptions<RuneforgeStatus, AppError, void>({
      mutationFn: async () => unwrapForQuery(await api.runeforge.disconnect()),
      onSuccess: (status) => connectionChanged(client, status),
    }),

  /** A failed prepare is shown in the dialog, so it raises no toast. */
  prepare: (client: QueryClient) =>
    mutationOptions<PublishReview, AppError, PrepareVariables>({
      mutationFn: async ({ projectPath, format }) =>
        unwrapForQuery(await api.runeforge.prepare(projectPath, format)),
      onSettled: () => client.invalidateQueries({ queryKey: runeforgeKeys.status() }),
      meta: { silentError: true },
    }),

  prefill: () =>
    mutationOptions<Prefill, AppError, { uploadId: string; modId: string | null }>({
      mutationFn: async ({ uploadId, modId }) =>
        unwrapForQuery(await api.runeforge.prefill(uploadId, modId)),
      meta: { silentError: true },
    }),

  /** A failed submit is shown in the review, so it raises no toast. */
  submit: (client: QueryClient) =>
    mutationOptions<PublishOutcome, AppError, SubmitVariables>({
      mutationFn: async ({ projectPath, request }) =>
        unwrapForQuery(await api.runeforge.submit(projectPath, request)),
      onSuccess: () => client.invalidateQueries({ queryKey: runeforgeKeys.ownedMods() }),
      onSettled: () => client.invalidateQueries({ queryKey: runeforgeKeys.status() }),
      meta: { silentError: true },
    }),

  publish: (client: QueryClient) =>
    mutationOptions<PublishResult, AppError, { modId: string; answer: PublishAnswer }>({
      mutationFn: async ({ modId, answer }) =>
        unwrapForQuery(await api.runeforge.publish(modId, answer)),
      onSettled: () => client.invalidateQueries({ queryKey: runeforgeKeys.status() }),
      meta: { silentError: true },
    }),
} as const;
