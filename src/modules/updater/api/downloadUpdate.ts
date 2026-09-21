import type { Result } from "@/lib/tauri";
import { useUpdaterStore } from "@/stores";

import { updaterClient } from "./client";

let inflight: Promise<Result<null>> | null = null;

/** Download the installer for the update on offer, joining a download already running. */
export function downloadUpdate(): Promise<Result<null>> {
  inflight ??= run().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(): Promise<Result<null>> {
  const { startDownload, reportProgress, finishDownload, failDownload } =
    useUpdaterStore.getState();
  startDownload();
  const result = await updaterClient().download(reportProgress);
  if (result.ok) {
    finishDownload();
  } else {
    console.error("Update download failed:", result.error);
    failDownload();
  }
  return result;
}
