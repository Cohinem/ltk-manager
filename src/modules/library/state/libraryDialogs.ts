import type { InstalledMod } from "@/lib/tauri";
import { createDialogStore } from "@/stores/createDialogStore";

/** The mods a confirmed uninstall would remove, frozen at the moment it was asked for. */
export const useBulkUninstallDialog = createDialogStore<InstalledMod[]>();

/** The mods a new folder takes in once it is named. */
export const useNewFolderForModsDialog = createDialogStore<InstalledMod[]>();
