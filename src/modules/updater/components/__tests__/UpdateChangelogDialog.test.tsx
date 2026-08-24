import type { Update } from "@tauri-apps/plugin-updater";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUpdaterStore } from "@/stores";

import { UpdateChangelogDialog } from "../UpdateChangelogDialog";

const UPDATE = {
  version: "1.15.0",
  currentVersion: "1.14.1",
  body: "## Fixes\n\n- The patcher lets go of the executable",
} as unknown as Update;

describe("UpdateChangelogDialog", () => {
  beforeEach(() => {
    useUpdaterStore.setState({
      update: UPDATE,
      dialogOpen: true,
      updating: false,
      progress: 0,
      error: null,
      skippedVersion: null,
    });
  });

  it("names the version on offer and what it changes", () => {
    render(<UpdateChangelogDialog />);

    expect(screen.getByRole("heading", { name: "What's New" })).toBeVisible();
    expect(screen.getByText("v1.14.1 → v1.15.0")).toBeVisible();
    expect(screen.getByText("The patcher lets go of the executable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Update Now" })).toBeVisible();
  });

  /* The install replaces the running executable, so the dialog holds the user
     until it is over - there is nothing to close it with and nothing to skip. */
  it("offers no way out while the install runs", () => {
    useUpdaterStore.setState({ updating: true, progress: 40 });
    render(<UpdateChangelogDialog />);

    expect(screen.getByText("Installing update")).toBeVisible();
    expect(screen.getByText("40%")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Update Now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("turns a failed install into a retry", () => {
    useUpdaterStore.setState({ error: "signature mismatch" });
    render(<UpdateChangelogDialog />);

    expect(screen.getByRole("alert")).toHaveTextContent("Update failed");
    expect(screen.getByRole("alert")).toHaveTextContent("signature mismatch");
    expect(screen.getByRole("button", { name: "Retry Update" })).toBeVisible();
  });
});
