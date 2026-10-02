import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components";
import { m } from "@/i18n";
import { api, type AppError, type InstalledMod, type InstallOutcome } from "@/lib/tauri";
import { checkModForSkinhack } from "@/modules/library/utils/skinhackCheck";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

/**
 * Hook to install a mod from a .modpkg file.
 */
export function useInstallMod() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<InstallOutcome, AppError, string>({
    mutationFn: async (filePath) => {
      const result = await api.installMod(filePath);
      return unwrapForQuery(result);
    },
    onSuccess: (outcome) => {
      const mod = outcome.mod;
      if (outcome.kind === "alreadyInstalled") {
        toast.info(
          m.library_import_already_installed_title(),
          m.library_install_already_installed_description({ name: mod.displayName }),
        );
        return;
      }

      queryClient.setQueryData<InstalledMod[]>(libraryKeys.mods(), (old) =>
        old ? [mod, ...old] : [mod],
      );

      const flag = checkModForSkinhack(mod);
      if (flag) {
        api.toggleMod(mod.id, false);
        toast.warning(
          m.library_install_skinhack_title(),
          m.library_install_skinhack_description({ name: mod.displayName }),
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.mods() });
    },
  });
}
