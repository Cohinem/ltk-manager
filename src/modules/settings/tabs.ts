/** The tab values the settings route validates and `?tab=` addresses. */
export const SETTINGS_TABS = [
  "general",
  "library",
  "workshop",
  "patching",
  "cache",
  "hotkeys",
  "appearance",
  "about",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** What a tab is called, wherever it is named away from the rail that draws it. */
export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  general: "General",
  library: "Library",
  workshop: "Workshop",
  patching: "Patching",
  cache: "Cache",
  hotkeys: "Hotkeys",
  appearance: "Appearance",
  about: "About",
};

export const DEFAULT_SETTINGS_TAB: SettingsTab = "general";

/** A link that outlived the tab it named falls back to the default rather than blanking the page. */
export function isSettingsTab(value: unknown): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}
