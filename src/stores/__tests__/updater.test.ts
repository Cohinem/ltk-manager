import { beforeEach, describe, expect, it } from "vitest";

import type { PendingUpdate } from "@/lib/tauri";

import { useUpdaterStore } from "../updater";

const RELEASE: PendingUpdate = { version: "1.21.0", currentVersion: "1.20.0", body: null };
const NEXT: PendingUpdate = { version: "1.22.0", currentVersion: "1.20.0", body: null };

describe("updater store", () => {
  beforeEach(() => {
    useUpdaterStore.setState({
      checkedAt: null,
      update: null,
      foundAtLaunch: false,
      downloaded: false,
      progress: 0,
      dialogOpen: false,
      dialogOpener: null,
      skippedVersion: null,
    });
  });

  it("raises the dialog for a release the run has not seen", () => {
    useUpdaterStore.getState().reportCheck(RELEASE);

    expect(useUpdaterStore.getState()).toMatchObject({ dialogOpen: true, dialogOpener: "check" });
  });

  /* A recheck every few hours must not put a dismissed dialog back up. */
  it("leaves the dialog alone when a recheck finds the same release", () => {
    useUpdaterStore.getState().reportCheck(RELEASE);
    useUpdaterStore.setState({ dialogOpen: false, dialogOpener: null, downloaded: true });

    useUpdaterStore.getState().reportCheck(RELEASE);

    expect(useUpdaterStore.getState()).toMatchObject({ dialogOpen: false, downloaded: true });
  });

  it("raises again, with nothing downloaded, for a newer release", () => {
    useUpdaterStore.getState().reportCheck(RELEASE);
    useUpdaterStore.setState({ dialogOpen: false, downloaded: true, progress: 100 });

    useUpdaterStore.getState().reportCheck(NEXT);

    expect(useUpdaterStore.getState()).toMatchObject({
      update: NEXT,
      dialogOpen: true,
      downloaded: false,
      progress: 0,
    });
  });

  it("keeps a skipped release quiet", () => {
    useUpdaterStore.setState({ skippedVersion: RELEASE.version });

    useUpdaterStore.getState().reportCheck(RELEASE);

    expect(useUpdaterStore.getState()).toMatchObject({ update: RELEASE, dialogOpen: false });
  });

  it("marks only an update the first check found as found at launch", () => {
    useUpdaterStore.getState().reportCheck(null);
    useUpdaterStore.getState().reportCheck(RELEASE);

    expect(useUpdaterStore.getState().foundAtLaunch).toBe(false);

    useUpdaterStore.setState({ checkedAt: null, update: null });
    useUpdaterStore.getState().reportCheck(RELEASE);

    expect(useUpdaterStore.getState().foundAtLaunch).toBe(true);
  });
});
