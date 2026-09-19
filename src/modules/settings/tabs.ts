import { m } from "@/i18n";

/** The tab values the settings route validates and `?tab=` addresses. */
export const SETTINGS_TABS = [
  "general",
  "library",
  "workshop",
  "builtins",
  "integrations",
  "patching",
  "cache",
  "hotkeys",
  "appearance",
  "about",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** What a tab is called, wherever it is named away from the rail that draws it. */
export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  general: m.settings_tab_general_title(),
  library: m.settings_tab_library_title(),
  workshop: m.settings_tab_workshop_title(),
  builtins: m.settings_tab_builtins_title(),
  integrations: m.settings_integrations_title(),
  patching: m.settings_tab_patching_title(),
  cache: m.settings_tab_cache_title(),
  hotkeys: m.settings_tab_hotkeys_title(),
  appearance: m.settings_tab_appearance_title(),
  about: m.settings_tab_about_title(),
};

export const DEFAULT_SETTINGS_TAB: SettingsTab = "general";

/** A link that outlived the tab it named falls back to the default rather than blanking the page. */
export function isSettingsTab(value: unknown): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}
