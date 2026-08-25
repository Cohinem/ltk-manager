import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingFocusProvider } from "../SettingFocus";
import { SettingGroup } from "../SettingGroup";
import { SettingRow } from "../SettingRow";
import { renderSettings } from "./fixtures";

const mockNavigate = vi.fn();
let search: { focus?: string } = {};

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mockNavigate,
  useSearch: () => search,
}));

function renderStartup(autoRun: boolean) {
  return renderSettings(
    <SettingFocusProvider>
      <SettingGroup id="startup" title="Startup">
        <SettingRow title="Auto run" setting="autoRun" control={<input type="checkbox" />} />
        <SettingRow
          title="Start in tray unless update available"
          setting="startInTrayUnlessUpdate"
          dependent
          hidden={!autoRun}
          control={<input type="checkbox" />}
        />
      </SettingGroup>
    </SettingFocusProvider>,
  );
}

describe("focus", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("lands on the row it names and drops the param", async () => {
    search = { focus: "autoRun" };
    renderStartup(true);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Auto run").closest("label"));
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true, search: expect.any(Function) }),
    );
  });

  /* Marking a row that draws nothing would be a link that appears to fail, so the
     reader lands on the header above the toggle that gates what they came for. */
  it("marks the group around a row its parent has turned off", async () => {
    search = { focus: "startInTrayUnlessUpdate" };
    renderStartup(false);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("group", { name: "Startup" }));
    });
  });

  it("selects the tab and does nothing else for an id nothing carries", async () => {
    search = { focus: "somethingRenamedLastYear" };
    renderStartup(true);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(document.activeElement).toBe(document.body);
  });
});
