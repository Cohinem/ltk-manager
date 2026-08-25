import { createFileRoute } from "@tanstack/react-router";

import { isSettingsTab, type SettingsTab } from "@/modules/settings/tabs";

import { Settings } from "../pages/Settings";

interface SettingsSearch {
  firstRun?: boolean;
  /** Optional, so the links that mean the whole page keep pointing at `/settings` alone. */
  tab?: SettingsTab;
  /**
   * A group id or a setting key to point at.
   *
   * A string rather than a union, because the ids it addresses are spread across
   * four sections. An unknown one selects the tab and does nothing else, which is
   * the right failure for a link that outlived the setting it named.
   */
  focus?: string;
}

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    return {
      firstRun: search.firstRun === true || search.firstRun === "true",
      tab: isSettingsTab(search.tab) ? search.tab : undefined,
      focus: typeof search.focus === "string" ? search.focus : undefined,
    };
  },
  component: Settings,
});
