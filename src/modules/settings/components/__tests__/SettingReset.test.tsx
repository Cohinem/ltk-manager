import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockInvoke } from "@/test/mocks/tauri";

import { SettingGroup } from "../SettingGroup";
import { SettingRow } from "../SettingRow";
import { renderSettings, savedSettings } from "./fixtures";

function Startup() {
  return (
    <SettingGroup id="startup" title="Startup">
      <SettingRow title="Auto run" setting="autoRun" control={<input type="checkbox" />} />
      <SettingRow
        title="Minimize to system tray"
        setting="minimizeToTray"
        control={<input type="checkbox" />}
      />
      <SettingRow
        title="Installation path"
        setting="leaguePath"
        layout="stacked"
        control={<input aria-label="Installation path" />}
      />
    </SettingGroup>
  );
}

const RESET_GROUP = /Reset \d+ changed settings in this group/;

function saveCount() {
  return mockInvoke.mock.calls.filter(([command]) => command === "save_settings").length;
}

describe("the gear", () => {
  it("is absent on a row whose value is never put back", () => {
    renderSettings(<Startup />);

    /* Three rows, and the path is the one that keeps its data by construction
       rather than by a second flag. */
    expect(screen.getAllByLabelText("Setting actions")).toHaveLength(2);
  });

  it("offers a reset only while the row is off its default", async () => {
    const user = userEvent.setup();
    renderSettings(<Startup />, { settings: { autoRun: true } });

    const [autoRun, minimize] = screen.getAllByLabelText("Setting actions");

    await user.click(autoRun);
    expect(await screen.findByRole("menuitem", { name: "Reset setting" })).not.toHaveAttribute(
      "data-disabled",
    );
    await user.keyboard("{Escape}");

    await user.click(minimize);
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Reset setting" })).toHaveAttribute(
        "data-disabled",
      ),
    );
  });

  it("says what a reset would put back", async () => {
    const user = userEvent.setup();
    renderSettings(<Startup />, { settings: { autoRun: true } });

    await user.click(screen.getAllByLabelText("Setting actions")[0]);

    expect(await screen.findByText("Default: Off")).toBeInTheDocument();
  });

  it("puts the row back", async () => {
    const user = userEvent.setup();
    renderSettings(<Startup />, { settings: { autoRun: true } });

    await user.click(screen.getAllByLabelText("Setting actions")[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Reset setting" }));

    await waitFor(() => expect(saveCount()).toBe(1));
    expect(savedSettings().autoRun).toBe(false);
  });
});

describe("the group reset", () => {
  /* One changed row is a gear away, so a second control for it would say the
     same thing twice. */
  it("stays away until a second row has changed", () => {
    renderSettings(<Startup />, { settings: { autoRun: true } });

    expect(screen.queryByRole("button", { name: RESET_GROUP })).not.toBeInTheDocument();
  });

  it("appears once two rows have changed, and counts them", async () => {
    renderSettings(<Startup />, { settings: { autoRun: true, minimizeToTray: false } });

    expect(
      await screen.findByRole("button", { name: "Reset 2 changed settings in this group" }),
    ).toBeInTheDocument();
  });

  it("writes every changed row in a single save", async () => {
    const user = userEvent.setup();
    renderSettings(<Startup />, { settings: { autoRun: true, minimizeToTray: false } });

    await user.click(await screen.findByRole("button", { name: RESET_GROUP }));

    await waitFor(() => expect(saveCount()).toBe(1));
    expect(savedSettings().autoRun).toBe(false);
    expect(savedSettings().minimizeToTray).toBe(true);
  });

  it("undoes only the keys it wrote", async () => {
    const user = userEvent.setup();
    renderSettings(<Startup />, { settings: { autoRun: true, minimizeToTray: false } });

    await user.click(await screen.findByRole("button", { name: RESET_GROUP }));
    await waitFor(() => expect(saveCount()).toBe(1));

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(saveCount()).toBe(2));
    expect(savedSettings(1).autoRun).toBe(true);
    expect(savedSettings(1).minimizeToTray).toBe(false);
  });
});
