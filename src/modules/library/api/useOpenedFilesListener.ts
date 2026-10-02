import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { api, type FilesOpened } from "@/lib/tauri";
import { useTauriEvent } from "@/lib/useTauriEvent";

import { useOpenedFilesStore } from "../state";

/**
 * Queues the mod files Explorer opens and brings the reader to the Mods page,
 * where `useOpenedModFiles` installs them.
 *
 * Mounted once at the root, so a file opened from any page is heard. Files a cold
 * start was launched with are asked for once, as the listener comes up.
 */
export function useOpenedFilesListener() {
  const navigate = useNavigate();

  const open = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;

      useOpenedFilesStore.getState().enqueue(paths);
      void navigate({ to: "/mods" });
    },
    [navigate],
  );

  useTauriEvent<FilesOpened>("files-opened", ({ paths }) => open(paths));

  useEffect(() => {
    void api.takePendingOpenedFiles().then((result) => {
      if (result.ok) open(result.value.paths);
    });
  }, [open]);
}
