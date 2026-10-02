import {
  BooksIcon,
  DatabaseIcon,
  GearIcon,
  InfoIcon,
  KeyboardIcon,
  PaletteIcon,
  PlugsConnectedIcon,
  PuzzlePieceIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { getRouteApi } from "@tanstack/react-router";
import { type ReactNode } from "react";

import { LootIcon, PatcherIcon, Tabs } from "@/components";
import { m } from "@/i18n";
import { MigrationPanel } from "@/modules/migration";
import {
  AboutSection,
  AppearanceSection,
  BuiltinModsSection,
  CacheSection,
  DEFAULT_SETTINGS_TAB,
  GeneralSection,
  HotkeySection,
  IntegrationsSection,
  LibrarySection,
  PatchingSection,
  SettingFocusProvider,
  SETTINGS_TAB_LABELS,
  type SettingsTab,
  useAppInfo,
  useSettings,
  WorkshopSection,
} from "@/modules/settings";
import { twMerge } from "@/utils";

const routeApi = getRouteApi("/settings");

const tabClass =
  "flex items-center gap-2.5 text-left text-base data-active:bg-accent-500/15 data-active:text-accent-300";

const PANEL = "mx-auto max-w-5xl px-6 pt-4 pb-6";

const TABS: { value: SettingsTab; icon: ReactNode }[] = [
  { value: "general", icon: <GearIcon className="size-5 shrink-0" /> },
  { value: "library", icon: <BooksIcon className="size-5 shrink-0" /> },
  { value: "workshop", icon: <LootIcon className="size-5 shrink-0" /> },
  { value: "builtins", icon: <PuzzlePieceIcon className="size-5 shrink-0" /> },
  { value: "integrations", icon: <PlugsConnectedIcon className="size-5 shrink-0" /> },
  { value: "patching", icon: <PatcherIcon className="size-5 shrink-0" /> },
  { value: "cache", icon: <DatabaseIcon className="size-5 shrink-0" /> },
  { value: "hotkeys", icon: <KeyboardIcon className="size-5 shrink-0" /> },
  { value: "appearance", icon: <PaletteIcon className="size-5 shrink-0" /> },
  { value: "about", icon: <InfoIcon className="size-5 shrink-0" /> },
];

export function Settings() {
  const { firstRun, tab } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data: settings, isLoading } = useSettings();
  const { data: appInfo } = useAppInfo();

  if (isLoading || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinnerGapIcon className="size-8 animate-spin text-accent-500" />
      </div>
    );
  }

  function selectTab(value: unknown) {
    /* Replace, because a tab is not a place a reader wants Back to walk through.
       Back leaves settings. */
    void navigate({ search: (prev) => ({ ...prev, tab: value as SettingsTab }), replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs.Root
        value={tab ?? DEFAULT_SETTINGS_TAB}
        onValueChange={selectTab}
        className="flex min-h-0 flex-1 flex-row"
      >
        <Tabs.List
          variant="pills"
          className="w-52 shrink-0 flex-col items-stretch rounded-none border-r border-surface-700/50 bg-surface-800/40 p-3"
        >
          {TABS.map((item) => (
            <Tabs.Tab key={item.value} variant="pills" value={item.value} className={tabClass}>
              {item.icon}
              {SETTINGS_TAB_LABELS[item.value]}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <div className="min-h-0 flex-1 overflow-auto">
          <SettingFocusProvider>
            <Tabs.Panel value="general" className={twMerge(PANEL, "flex flex-col gap-8")}>
              {firstRun && !settings.leaguePath && (
                <div className="flex items-start gap-3 rounded-xl border border-accent-500/30 bg-accent-500/10 p-5">
                  <InfoIcon className="mt-0.5 size-5 shrink-0 text-accent-400" />
                  <div>
                    <h3 className="font-medium text-accent-300">{m.settings_welcome_title()}</h3>
                    <p className="mt-1 text-sm text-surface-400">
                      {m.settings_welcome_description()}
                    </p>
                  </div>
                </div>
              )}
              <GeneralSection migration={<MigrationPanel />} />
            </Tabs.Panel>

            <Tabs.Panel value="library" className={PANEL}>
              <LibrarySection />
            </Tabs.Panel>

            <Tabs.Panel value="workshop" className={PANEL}>
              <WorkshopSection />
            </Tabs.Panel>

            <Tabs.Panel value="builtins" className={PANEL}>
              <BuiltinModsSection />
            </Tabs.Panel>

            <Tabs.Panel value="integrations" className={PANEL}>
              <IntegrationsSection />
            </Tabs.Panel>

            <Tabs.Panel value="patching" className={PANEL}>
              <PatchingSection />
            </Tabs.Panel>

            <Tabs.Panel value="cache" className={PANEL}>
              <CacheSection />
            </Tabs.Panel>

            <Tabs.Panel value="hotkeys" className={PANEL}>
              <HotkeySection />
            </Tabs.Panel>

            <Tabs.Panel value="appearance" className={PANEL}>
              <AppearanceSection />
            </Tabs.Panel>

            <Tabs.Panel value="about" className={PANEL}>
              <AboutSection appInfo={appInfo} />
            </Tabs.Panel>
          </SettingFocusProvider>
        </div>
      </Tabs.Root>
    </div>
  );
}
