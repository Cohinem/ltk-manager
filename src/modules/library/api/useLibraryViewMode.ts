import { useCallback } from "react";

import { useSettings, useUpdateSettings } from "@/modules/settings";

export type ViewMode = "grid" | "table";

/** The saved view, where the retired `"list"` reads as the table that replaced it. */
function viewModeOf(saved: string | null | undefined): ViewMode {
  if (saved === "table" || saved === "list") return "table";
  return "grid";
}

export function useLibraryViewMode() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const viewMode = viewModeOf(settings?.libraryViewMode);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (!settings) return;
      updateSettings({ libraryViewMode: mode });
    },
    [settings, updateSettings],
  );

  return { viewMode, setViewMode } as const;
}
