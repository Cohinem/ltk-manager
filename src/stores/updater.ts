import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

import { api } from "@/lib/tauri";

const SKIPPED_VERSION_KEY = "ltk-update-skipped-version";

interface UpdaterStore {
  checking: boolean;
  updating: boolean;
  update: Update | null;
  error: string | null;
  progress: number;
  dialogOpen: boolean;
  skippedVersion: string | null;

  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  dismissError: () => void;
  setDialogOpen: (open: boolean) => void;
  isVersionSkipped: () => boolean;
  setSkipVersion: (skip: boolean) => void;
}

const store = create<UpdaterStore>((set, get) => ({
  checking: false,
  updating: false,
  update: null,
  error: null,
  progress: 0,
  dialogOpen: false,
  skippedVersion: localStorage.getItem(SKIPPED_VERSION_KEY),

  checkForUpdate: async () => {
    set({ checking: true, error: null });

    try {
      const update = await check();
      const hasUpdate = update ?? null;
      const shouldOpen = hasUpdate !== null && !get().isVersionSkipped();
      set({ checking: false, update: hasUpdate, dialogOpen: shouldOpen });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update check failed";
      console.error("Update check failed:", message);
      set({ checking: false, error: message });
    }
  },

  downloadAndInstall: async () => {
    const { update } = get();
    if (!update) return;

    set({ updating: true, error: null, progress: 0 });

    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.download((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              set({ progress: Math.round((downloaded / contentLength) * 100) });
            }
            break;
          case "Finished":
            set({ progress: 100 });
            break;
        }
      });

      await api.prepareForUpdate();
      await update.install();
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      console.error("Update installation failed:", message);
      set({ updating: false, error: message, dialogOpen: true });
    }
  },

  dismissError: () => set({ error: null }),

  setDialogOpen: (open) => set({ dialogOpen: open }),

  isVersionSkipped: () => {
    const { update, skippedVersion } = get();
    if (!update) return false;
    return skippedVersion === update.version;
  },

  setSkipVersion: (skip) => {
    const { update } = get();
    if (!update) return;

    if (skip) {
      localStorage.setItem(SKIPPED_VERSION_KEY, update.version);
      set({ skippedVersion: update.version });
    } else {
      localStorage.removeItem(SKIPPED_VERSION_KEY);
      set({ skippedVersion: null });
    }
  },
}));

export const useUpdaterStore = store;

export const useUpdaterChecking = () => store((s) => s.checking);
export const useUpdaterUpdating = () => store((s) => s.updating);
export const useUpdaterUpdate = () => store((s) => s.update);
export const useUpdaterError = () => store((s) => s.error);
export const useUpdaterProgress = () => store((s) => s.progress);
export const useUpdaterDialogOpen = () => store((s) => s.dialogOpen);
export const useUpdaterCheckForUpdate = () => store((s) => s.checkForUpdate);
export const useUpdaterDownloadAndInstall = () => store((s) => s.downloadAndInstall);
export const useUpdaterDismissError = () => store((s) => s.dismissError);
export const useUpdaterSetDialogOpen = () => store((s) => s.setDialogOpen);
export const useUpdaterSkippedVersion = () => store((s) => s.skippedVersion);
export const useUpdaterIsVersionSkipped = () => store((s) => s.isVersionSkipped);
export const useUpdaterSetSkipVersion = () => store((s) => s.setSkipVersion);
