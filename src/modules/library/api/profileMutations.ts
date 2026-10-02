import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { api, type AppError, type Profile } from "@/lib/tauri";
import { mutationFn, unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";
import { refreshMods } from "./modMutations";

/** What renaming one profile takes. */
export interface RenameProfileVariables {
  profileId: string;
  newName: string;
}

/** Writes against the profile list. */
export const profileMutations = {
  create: (client: QueryClient) =>
    mutationOptions<Profile, AppError, string>({
      mutationFn: mutationFn(api.createModProfile),
      onSuccess: () => {
        client.invalidateQueries({ queryKey: libraryKeys.profiles() });
      },
    }),

  remove: (client: QueryClient) =>
    mutationOptions<null, AppError, string>({
      mutationFn: mutationFn(api.deleteModProfile),
      onSuccess: () => {
        client.invalidateQueries({ queryKey: libraryKeys.profiles() });
      },
    }),

  rename: (client: QueryClient) =>
    mutationOptions<Profile, AppError, RenameProfileVariables>({
      mutationFn: async ({ profileId, newName }) =>
        unwrapForQuery(await api.renameModProfile(profileId, newName)),
      onSuccess: () => {
        client.invalidateQueries({ queryKey: libraryKeys.profiles() });
        client.invalidateQueries({ queryKey: libraryKeys.activeProfile() });
      },
    }),

  switchTo: (client: QueryClient) =>
    mutationOptions<Profile, AppError, string>({
      mutationFn: mutationFn(api.switchModProfile),
      onSuccess: () => {
        client.invalidateQueries({ queryKey: libraryKeys.activeProfile() });
        refreshMods(client);
      },
    }),
} as const;
