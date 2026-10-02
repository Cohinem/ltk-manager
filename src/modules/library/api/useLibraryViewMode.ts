import { useCallback } from "react";

import { useSettings, useUpdateSettings } from "@/modules/settings";

export type ViewMode = "grid" | "list";

export function useLibraryViewMode() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const viewMode: ViewMode = settings?.libraryViewMode === "list" ? "list" : "grid";

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (!settings) return;
      updateSettings({ libraryViewMode: mode });
    },
    [settings, updateSettings],
  );

  return { viewMode, setViewMode } as const;
}
