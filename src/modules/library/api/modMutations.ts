import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { beginReorderHold } from "@/hooks";
import {
  api,
  type AppError,
  type EditModMetadataArgs,
  type InstalledMod,
  type ModStorage,
  type Settings,
} from "@/lib/tauri";
import { promoteToFolderFront } from "@/modules/library/utils";
import { settingsKeys } from "@/modules/settings";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

/** The mods list as it stood before an optimistic write, for the rollback. */
export interface ModsRollback {
  previous?: InstalledMod[];
}

export interface ToggleModVariables {
  modId: string;
  enabled: boolean;
}

export interface SetModLayersVariables {
  modId: string;
  layerStates: Record<string, boolean>;
}

export interface EditModVariables {
  modId: string;
  metadata: EditModMetadataArgs;
}

export interface SetModStorageVariables {
  modId: string;
  storage: ModStorage;
}

/**
 * Take the mods list out of the cache, hold it, and hand back the rollback.
 *
 * Every optimistic write below opens this way, so the snapshot and the cancel
 * are written once rather than per mutation.
 */
async function holdMods(
  client: QueryClient,
  edit: (mods: InstalledMod[]) => InstalledMod[],
): Promise<ModsRollback> {
  await client.cancelQueries({ queryKey: libraryKeys.mods(), exact: true });
  const previous = client.getQueryData<InstalledMod[]>(libraryKeys.mods());
  client.setQueryData<InstalledMod[]>(libraryKeys.mods(), (old) => (old ? edit(old) : old));
  return { previous };
}

/** Put back what `holdMods` snapshotted. */
function releaseMods(client: QueryClient, context: ModsRollback | undefined): void {
  if (context?.previous) client.setQueryData(libraryKeys.mods(), context.previous);
}

/**
 * Invalidate the mods list once a write has settled either way.
 *
 * The list alone. Each mod's thumbnail, readme and license text sit under the
 * same key, and a thumbnail refetch mints a new asset URL, so a prefix match
 * reloads the image on every card for a write that touched one mod's flag.
 */
function refreshMods(client: QueryClient): void {
  client.invalidateQueries({ queryKey: libraryKeys.mods(), exact: true });
}

/** Writes against the installed mods. */
export const modMutations = {
  toggle: (client: QueryClient) =>
    mutationOptions<void, AppError, ToggleModVariables, ModsRollback>({
      mutationFn: async ({ modId, enabled }) => unwrapForQuery(await api.toggleMod(modId, enabled)),
      onMutate: ({ modId, enabled }) => {
        const promote =
          client.getQueryData<Settings>(settingsKeys.settings())?.promoteEnabledMods === true;
        beginReorderHold();
        return holdMods(client, (mods) => {
          const next = mods.map((mod) => (mod.id === modId ? { ...mod, enabled } : mod));
          return enabled && promote ? promoteToFolderFront(next, modId) : next;
        });
      },
      onError: (_error, _variables, context) => releaseMods(client, context),
      onSettled: () => refreshMods(client),
    }),

  setLayers: (client: QueryClient) =>
    mutationOptions<void, AppError, SetModLayersVariables, ModsRollback>({
      mutationFn: async ({ modId, layerStates }) =>
        unwrapForQuery(await api.setModLayers(modId, layerStates)),
      onMutate: ({ modId, layerStates }) =>
        holdMods(client, (mods) =>
          mods.map((mod) => (mod.id === modId ? withLayers(mod, layerStates) : mod)),
        ),
      onError: (_error, _variables, context) => releaseMods(client, context),
      onSettled: () => refreshMods(client),
    }),

  enableWithLayers: (client: QueryClient) =>
    mutationOptions<void, AppError, SetModLayersVariables, ModsRollback>({
      mutationFn: async ({ modId, layerStates }) =>
        unwrapForQuery(await api.enableModWithLayers(modId, layerStates)),
      onMutate: ({ modId, layerStates }) => {
        const promote =
          client.getQueryData<Settings>(settingsKeys.settings())?.promoteEnabledMods === true;
        beginReorderHold();
        return holdMods(client, (mods) => {
          const next = mods.map((mod) =>
            mod.id === modId ? { ...withLayers(mod, layerStates), enabled: true } : mod,
          );
          return promote ? promoteToFolderFront(next, modId) : next;
        });
      },
      onError: (_error, _variables, context) => releaseMods(client, context),
      onSettled: () => refreshMods(client),
    }),

  edit: (client: QueryClient) =>
    mutationOptions<InstalledMod, AppError, EditModVariables>({
      mutationFn: async ({ modId, metadata }) =>
        unwrapForQuery(await api.editModMetadata(modId, metadata)),
      onSuccess: (updated) => replaceMod(client, updated),
      onSettled: () => refreshMods(client),
    }),

  setStorage: (client: QueryClient) =>
    mutationOptions<InstalledMod, AppError, SetModStorageVariables>({
      mutationFn: async ({ modId, storage }) =>
        unwrapForQuery(await api.setModStorage(modId, storage)),
      onSuccess: (updated) => replaceMod(client, updated),
      onSettled: (_updated, _error, { modId }) => {
        refreshMods(client);
        /* The tree the overlay reads was rewritten, so the cached scan of it is
           about a directory that no longer exists, and the archive the mod's
           documents are read from may be gone with it. */
        client.invalidateQueries({ queryKey: libraryKeys.wadReport(modId) });
        client.invalidateQueries({ queryKey: libraryKeys.mod(modId) });
      },
    }),

  uninstall: (client: QueryClient) =>
    mutationOptions<void, AppError, string, ModsRollback>({
      mutationFn: async (modId) => unwrapForQuery(await api.uninstallMod(modId)),
      onMutate: (modId) => holdMods(client, (mods) => mods.filter((mod) => mod.id !== modId)),
      onError: (_error, _variables, context) => releaseMods(client, context),
      onSettled: () => refreshMods(client),
    }),
} as const;

/** `mod` with each named layer switched as `layerStates` says. */
function withLayers(mod: InstalledMod, layerStates: Record<string, boolean>): InstalledMod {
  return {
    ...mod,
    layers: mod.layers.map((layer) => ({
      ...layer,
      enabled: layerStates[layer.name] ?? layer.enabled,
    })),
  };
}

/** Swap one mod in the cached list for the backend's answer. */
function replaceMod(client: QueryClient, updated: InstalledMod): void {
  client.setQueryData<InstalledMod[]>(libraryKeys.mods(), (old) =>
    old?.map((mod) => (mod.id === updated.id ? updated : mod)),
  );
}

export { holdMods, refreshMods, releaseMods };
