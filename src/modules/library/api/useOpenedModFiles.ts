import { useEffect, useRef } from "react";

import { useOpenedFilesStore } from "../state";

/** Hands queued Explorer files to `onOpen`, the handler a drop onto the page uses. */
export function useOpenedModFiles(onOpen: (filePaths: string[]) => void) {
  const queued = useOpenedFilesStore((s) => s.paths.length > 0);

  const handler = useRef(onOpen);
  useEffect(() => {
    handler.current = onOpen;
  });

  useEffect(() => {
    if (!queued) return;

    const paths = useOpenedFilesStore.getState().take();
    if (paths.length > 0) handler.current(paths);
  }, [queued]);
}
