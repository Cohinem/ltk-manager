import { relaunch } from "@tauri-apps/plugin-process";

import type { PendingUpdate } from "@/lib/tauri";

import type { UpdaterClient } from "./types";

const CHUNKS = 24;
const CHUNK_MS = 70;

const BODY = `## Highlights

- A persistent **Update** cell in the titlebar, so a closed dialog is no longer a dead end
- Faster overlay builds on large mod libraries

## Fixes

- The patcher no longer holds a lock on the executable the installer replaces
- Zoom hotkeys survive a restart

_This release does not exist. It is the dev mock, seeded by \`VITE_MOCK_UPDATE=1\`._`;

/** The stand-in release a dev run with `VITE_MOCK_UPDATE=1` is offered. */
export const MOCK_UPDATE: PendingUpdate = {
  version: "99.0.0",
  currentVersion: "1.14.1",
  body: BODY,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A stand-in updater, so the updater UI can be exercised without cutting a release.
 *
 * The download reports progress at a watchable speed, and the install replaces
 * nothing, so the run ends where the real one ends, in a relaunch onto the same build.
 */
export const mockUpdater: UpdaterClient = {
  check: async () => ({ ok: true, value: MOCK_UPDATE }),

  async download(onProgress) {
    for (let chunk = 1; chunk <= CHUNKS; chunk++) {
      await sleep(CHUNK_MS);
      onProgress(Math.round((chunk / CHUNKS) * 100));
    }
    return { ok: true, value: null };
  },

  async install() {
    await relaunch();
    return { ok: true, value: null };
  },

  discard: async () => ({ ok: true, value: null }),
};
