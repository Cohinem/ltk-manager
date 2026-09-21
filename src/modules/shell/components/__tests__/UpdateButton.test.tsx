// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { PendingUpdate } from "@/lib/tauri";
import { useUpdaterStore } from "@/stores";

import { UpdateButton } from "../UpdateButton";

const UPDATE: PendingUpdate = { version: "1.15.0", currentVersion: "1.14.1", body: "" };

describe("UpdateButton", () => {
  beforeEach(() => {
    useUpdaterStore.setState({ update: null, dialogOpen: false, skippedVersion: null });
  });

  it("stays out of the bar while the app is current", () => {
    render(<UpdateButton />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reopens a dialog the user closed", async () => {
    useUpdaterStore.setState({ update: UPDATE });
    render(<UpdateButton />);

    await userEvent.click(screen.getByRole("button", { name: "Update to v1.15.0" }));

    expect(useUpdaterStore.getState().dialogOpen).toBe(true);
  });

  /* Skipping silences the prompt. The route to the version stays open. */
  it("stands for a version the user skipped", () => {
    useUpdaterStore.setState({ update: UPDATE, skippedVersion: UPDATE.version });
    render(<UpdateButton />);

    expect(screen.getByRole("button", { name: "Update to v1.15.0" })).toBeVisible();
  });
});
