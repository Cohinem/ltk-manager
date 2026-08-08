// Browser preview shim — makes the Tauri app render in a plain browser (Vite preview / static hosting).
// In the real Tauri WebView `window.__TAURI_INTERNALS__` is already present, so this file is a no-op there.
// In a browser (Freebuff preview, `vite preview`, static hosting) we stub `metadata` + `invoke` so
// `getCurrentWindow()` and every `api.*` call resolves instead of crashing with
// "Cannot read properties of undefined (reading 'metadata')".

import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

// Never run inside vitest — tests have their own `vi.mock` setup.
const isVitest =
  typeof process !== "undefined" &&
  // vitest sets VITEST env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).env?.VITEST === "true";

// Guard: only install the shim when Tauri isn't present.
if (
  typeof window !== "undefined" &&
  !isVitest &&
  !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
) {
  const APP_VERSION = "1.13.2";

  const mockSettings = {
    leaguePath: null,
    modStoragePath: null,
    workshopPath: null,
    firstRunComplete: true,
    theme: "system" as const,
    accentColor: { preset: "blue", customHue: null },
    backdropImage: null,
    backdropBlur: null,
    libraryViewMode: "grid",
    patchTft: false,
    minimizeToTray: true,
    startInTray: false,
    migrationDismissed: true,
    reloadModsHotkey: null,
    killLeagueHotkey: null,
    killLeagueStopsPatcher: true,
    trustedDomains: ["runeforge.dev", "divineskins.gg"],
    watcherEnabled: false,
    blockScriptsWad: true,
    linkedBinCheckEnabled: true,
    wadBlocklist: [],
    authorProfiles: [],
    defaultAuthorProfileId: null,
    autoRun: false,
    startInTrayUnlessUpdate: false,
    alwaysStartPatcher: false,
    launchMode: "classic" as const,
    hasSeenHddWarning: true,
    elevateInjector: false,
    autoCategorizationEnabled: true,
    enforceSkinhackScan: true,
    applyStringOverridesToAllLocales: false,
    verbosePatcherLogging: false,
    lazyWadScan: false,
    hideRiotClientOnLaunch: true,
  };

  // Try to persist settings in localStorage so the preview feels interactive.
  try {
    const stored = localStorage.getItem("ltk-preview-settings");
    if (stored) Object.assign(mockSettings, JSON.parse(stored));
  } catch {
    // ignore
  }

  const sampleMods = [
    {
      id: "preview-star-guardian-ahri",
      name: "star-guardian-ahri",
      displayName: "Star Guardian Ahri",
      version: "1.2.0",
      description: "Preview sample — Ahri skin replacement with star guardian visuals.",
      authors: ["Preview Author"],
      enabled: true,
      installedAt: new Date().toISOString(),
      layers: [{ name: "base", displayName: "Base", priority: 0, enabled: true }],
      tags: ["champion-skin"],
      champions: ["Ahri"],
      maps: [],
      modDir: "/preview/mods/star-guardian-ahri",
      folderId: null,
    },
    {
      id: "preview-dark-cosmos-jhin",
      name: "dark-cosmos-jhin",
      displayName: "Dark Cosmos Jhin",
      version: "2.0.1",
      description: "Preview sample — Dark Cosmos themed Jhin overhaul.",
      authors: ["Runeforge Preview"],
      enabled: false,
      installedAt: new Date().toISOString(),
      layers: [{ name: "base", displayName: "Base", priority: 0, enabled: false }],
      tags: ["champion-skin"],
      champions: ["Jhin"],
      maps: [],
      modDir: "/preview/mods/dark-cosmos-jhin",
      folderId: null,
    },
  ];

  const sampleProfile = {
    id: "preview-default",
    name: "Default",
    slug: "default",
    enabledMods: ["preview-star-guardian-ahri"],
    modOrder: ["preview-star-guardian-ahri", "preview-dark-cosmos-jhin"],
    layerStates: {},
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  };

  // `mockWindows` installs `window.__TAURI_INTERNALS__.metadata`
  mockWindows("main");
  mockConvertFileSrc("linux");

  mockIPC((cmd, args) => {
    // Plugin commands (window, event, updater, dialog, etc.) — just no-op.
    if (cmd.startsWith("plugin:")) {
      return null;
    }

    switch (cmd) {
      case "get_app_info":
        return {
          ok: true,
          value: {
            name: "LTK Manager",
            version: APP_VERSION,
            logFilePath: null,
            os: "browser",
            arch: "x86_64",
          },
        };
      case "get_platform_support":
        return { ok: true, value: { os: "browser", patcherAvailable: false, hotkeysAvailable: false } };
      case "get_settings":
        return { ok: true, value: mockSettings };
      case "save_settings": {
        const next = (args as { settings?: typeof mockSettings })?.settings;
        if (next) {
          Object.assign(mockSettings, next);
          try {
            localStorage.setItem("ltk-preview-settings", JSON.stringify(mockSettings));
          } catch {
            // ignore
          }
        }
        return { ok: true, value: null };
      }
      case "check_setup_required":
        return { ok: true, value: false };
      case "show_main_window":
      case "prepare_for_update":
      case "pause_hotkeys":
      case "resume_hotkeys":
      case "minimize_to_tray":
        return { ok: true, value: null };
      case "get_installed_mods":
        return { ok: true, value: sampleMods };
      case "get_folders":
        return { ok: true, value: [] };
      case "get_folder_order":
        return { ok: true, value: [] };
      case "list_mod_profiles":
        return { ok: true, value: [sampleProfile] };
      case "get_active_mod_profile":
        return { ok: true, value: sampleProfile };
      case "get_patcher_status":
        return { ok: true, value: { running: false, overlayPrefix: null, phase: "idle" } };
      case "get_launch_availability":
        return {
          ok: true,
          value: {
            canLaunch: false,
            riotClientPath: null,
            riotClientRunning: false,
            leagueRunning: false,
          },
        };
      case "get_storage_directory":
        return { ok: true, value: "/tmp/ltk-manager" };
      case "list_available_wads":
        return { ok: true, value: [] };
      case "get_all_mod_wad_reports":
        return { ok: true, value: {} };
      case "get_linked_bin_offenders":
        return { ok: true, value: {} };
      case "get_mod_wad_report":
        return { ok: true, value: null };
      case "get_mod_thumbnail":
        return { ok: true, value: null };
      case "get_workshop_projects":
        return { ok: true, value: [] };
      case "run_diagnostics":
        return {
          ok: true,
          value: { generatedAt: new Date().toISOString(), appVersion: APP_VERSION, checks: [] },
        };
      case "detect_storage_medium":
        return { ok: true, value: "unknown" };
      case "validate_league_path":
        return { ok: true, value: true };
      case "auto_detect_league_path":
        return { ok: true, value: null };
      case "detect_league_run_as_admin":
        return { ok: true, value: false };
      case "get_project_content_tree":
        return { ok: true, value: { layers: [] } };
      case "search_string_keys":
        return { ok: true, value: { suggestions: [], totalKeys: 0, locale: null } };
      case "get_layer_info":
        return { ok: true, value: {} };
      case "get_layer_content_path":
        return { ok: true, value: "/preview/layer" };
      default:
        // Generic fallback — keep the app from crashing on any other command.
        return { ok: true, value: null };
    }
  }, { shouldMockEvents: true });

  // Tag the document so you can spot preview mode in CSS if needed.
  document.documentElement.dataset.preview = "browser";

  // Friendly console hint.
  console.info(
    "[LTK Manager] Browser preview mock active — Tauri backend is stubbed with sample data. Run `pnpm tauri dev` for the full desktop app."
  );
}
