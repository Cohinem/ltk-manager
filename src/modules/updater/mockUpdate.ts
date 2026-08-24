import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

const MOCK_VERSION = "99.0.0";
const TOTAL_BYTES = 48 * 1024 * 1024;
const CHUNKS = 24;
const CHUNK_MS = 70;

const BODY = `## Highlights

- A persistent **Update** cell in the titlebar, so a closed dialog is no longer a dead end
- Faster overlay builds on large mod libraries

## Fixes

- The patcher no longer holds a lock on the executable the installer replaces
- Zoom hotkeys survive a restart

_This release does not exist. It is the dev mock, seeded by \`VITE_MOCK_UPDATE=1\`._`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A stand-in update, so the updater UI can be exercised without cutting a release.
 *
 * Only what the store reads is real - a version, release notes, and a download
 * reporting progress at a watchable speed. `install` replaces nothing, so the
 * run ends where the real one ends, in a relaunch onto the same build.
 */
export function mockUpdate(version: string = MOCK_VERSION): Update {
  const update = {
    rid: -1,
    available: true,
    currentVersion: "1.14.1",
    version,
    date: undefined,
    body: BODY,
    rawJson: {},

    async download(onEvent?: (event: DownloadEvent) => void) {
      onEvent?.({ event: "Started", data: { contentLength: TOTAL_BYTES } });
      for (let chunk = 0; chunk < CHUNKS; chunk++) {
        await sleep(CHUNK_MS);
        onEvent?.({ event: "Progress", data: { chunkLength: TOTAL_BYTES / CHUNKS } });
      }
      onEvent?.({ event: "Finished" });
    },

    async install() {},

    async downloadAndInstall(onEvent?: (event: DownloadEvent) => void) {
      await update.download(onEvent);
      await update.install();
    },

    async close() {},
  };

  return update as unknown as Update;
}
