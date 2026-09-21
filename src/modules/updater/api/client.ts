import { listen } from "@tauri-apps/api/event";

import { api } from "@/lib/tauri";
import type { AppError } from "@/utils/errors";

import { mockUpdater } from "../mockUpdate";
import type { UpdaterClient } from "../types";

/** Emitted by the backend's download, carrying a percentage. */
const DOWNLOAD_PROGRESS_EVENT = "update-download-progress";

const backendUpdater: UpdaterClient = {
  check: api.updater.check,
  async download(onProgress) {
    const unlisten = await listen<number>(DOWNLOAD_PROGRESS_EVENT, (event) =>
      onProgress(event.payload),
    );
    try {
      return await api.updater.download();
    } finally {
      unlisten();
    }
  },
  install: api.updater.install,
  discard: api.updater.discard,
};

/** The stand-in in a dev run with `VITE_MOCK_UPDATE=1`, and the backend's updater otherwise. */
export function updaterClient(): UpdaterClient {
  return import.meta.env.DEV && import.meta.env.VITE_MOCK_UPDATE === "1"
    ? mockUpdater
    : backendUpdater;
}

/** The sentence an updater failure shows. */
export function updaterErrorMessage(error: AppError): string {
  return "detail" in error ? error.detail : error.code;
}
