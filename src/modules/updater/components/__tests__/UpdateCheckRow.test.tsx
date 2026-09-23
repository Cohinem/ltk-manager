// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useUpdaterStore } from "@/stores";
import { renderWithProviders } from "@/test/utils";

import { UpdateCheckRow } from "../UpdateCheckRow";

describe("UpdateCheckRow", () => {
  beforeEach(() => {
    useUpdaterStore.setState({
      checking: false,
      checkedAt: null,
      checkError: null,
      update: null,
      dialogOpen: false,
    });
  });

  it("says the build is current once a check found nothing", () => {
    useUpdaterStore.setState({ checkedAt: Date.now() });
    renderWithProviders(<UpdateCheckRow />);

    expect(screen.getByText("LTK Manager is up to date")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check for Updates" })).toBeVisible();
  });

  it("names a failed check", () => {
    useUpdaterStore.setState({ checkedAt: Date.now(), checkError: "offline" });
    renderWithProviders(<UpdateCheckRow />);

    expect(screen.getByText("Couldn't check for updates")).toBeVisible();
  });

  it("opens the dialog for a release on offer", async () => {
    useUpdaterStore.setState({
      update: { version: "1.21.0", currentVersion: "1.20.0", body: null },
    });
    renderWithProviders(<UpdateCheckRow />);

    expect(screen.getByText("Version 1.21.0 is available")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "View Update" }));

    expect(useUpdaterStore.getState().dialogOpen).toBe(true);
  });
});
