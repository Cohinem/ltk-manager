import type { Update } from "@tauri-apps/plugin-updater";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useUpdaterStore } from "@/stores";

import { UpdateButton } from "../UpdateButton";

const UPDATE = { version: "1.15.0", body: "" } as unknown as Update;

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
