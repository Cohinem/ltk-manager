import { useCallback } from "react";

import type { InstalledMod } from "@/lib/tauri";

import { useMoveModToFolder } from "./useMoveMod";

const ROOT_FOLDER_ID = "root";

/** Move a set of mods into one folder, skipping the ones already filed there. */
export function useMoveModsToFolder() {
  const { mutateAsync, isPending } = useMoveModToFolder();

  /* One at a time, since each move rewrites the folder the next one lands in. */
  const move = useCallback(
    async (mods: InstalledMod[], folderId: string) => {
      for (const mod of mods) {
        if ((mod.folderId ?? ROOT_FOLDER_ID) === folderId) continue;

        try {
          await mutateAsync({ modId: mod.id, folderId });
        } catch (error) {
          console.error("Failed to move mod to folder:", error);
        }
      }
    },
    [mutateAsync],
  );

  return { move, isPending } as const;
}
