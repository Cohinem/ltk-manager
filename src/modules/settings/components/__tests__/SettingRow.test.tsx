import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingRow } from "../SettingRow";
import { renderSettings } from "./fixtures";

describe("SettingRow", () => {
  it("wraps a toggle in a label, so the title switches it", () => {
    renderSettings(<SettingRow title="Auto run" control={<input type="checkbox" />} />);

    expect(screen.getByLabelText("Auto run")).toBeInTheDocument();
  });

  it("draws nothing while its parent has it turned off", () => {
    renderSettings(
      <SettingRow
        title="Start in tray unless update available"
        setting="startInTrayUnlessUpdate"
        hidden
        control={<input type="checkbox" />}
      />,
    );

    expect(screen.queryByText("Start in tray unless update available")).not.toBeInTheDocument();
  });

  it("keeps the icon and the badge out of the title the marker reads", () => {
    renderSettings(
      <SettingRow
        title="Patch TFT files"
        icon={<span data-testid="icon" />}
        badge={<span data-testid="badge" />}
        control={<input type="checkbox" />}
      />,
    );

    expect(screen.getByLabelText("Patch TFT files")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });
});
