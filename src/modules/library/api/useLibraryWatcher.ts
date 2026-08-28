import { useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { libraryKeys } from "./keys";

/**
 * Listen for `library-changed` events from the backend file watcher
 * and invalidate all library queries so the UI stays in sync.
 *
 * Also listens for `check-verdicts-updated`, which an install's background
 * health check emits after the library-changed it rode in on.
 */
export function useLibraryWatcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unlistens: UnlistenFn[] = [];
    let mounted = true;

    const subscribe = (event: string, keys: readonly unknown[]) => {
      listen(event, () => {
        queryClient.invalidateQueries({ queryKey: keys });
      }).then((fn) => {
        if (!mounted) {
          fn();
          return;
        }
        unlistens.push(fn);
      });
    };

    subscribe("library-changed", libraryKeys.all);
    subscribe("check-verdicts-updated", libraryKeys.checkVerdicts());

    return () => {
      mounted = false;
      for (const fn of unlistens) fn();
    };
  }, [queryClient]);
}
