import type { InstalledMod, LibraryFolder } from "@/lib/tauri";
import { getFolderEnabledState } from "@/modules/library/utils";

import { useToggleFolder } from "./useFolderMutations";

export function useFolderToggle(folder: LibraryFolder, mods: InstalledMod[]) {
  const toggleFolder = useToggleFolder();
  const { checked, indeterminate } = getFolderEnabledState(mods);

  const handleToggle = () => {
    if (mods.length === 0) return;
    toggleFolder.mutate({
      folderId: folder.id,
      enabled: !checked,
    });
  };

  return { handleToggle, checked, indeterminate };
}
