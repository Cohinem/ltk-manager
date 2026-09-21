import type { PendingUpdate, Result } from "@/lib/tauri";

/** The update backend the updater hooks drive, so a dev run can swap in the stand-in. */
export interface UpdaterClient {
  check(): Promise<Result<PendingUpdate | null>>;
  /** Download the installer ahead of the install, reporting a percentage. */
  download(onProgress: (percent: number) => void): Promise<Result<null>>;
  /** Install and relaunch. It resolves only on failure, with the app still running. */
  install(): Promise<Result<null>>;
  /** Drop a downloaded installer, so quitting installs nothing. */
  discard(): Promise<Result<null>>;
}
