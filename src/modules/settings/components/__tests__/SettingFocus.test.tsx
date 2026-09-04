// @vitest-environment happy-dom

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SettingsTab } from "../../tabs";
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
      <SettingGroup id="general.startup" title="Startup">
        <SettingRow setting="autoRun" control={<input type="checkbox" />} />
        <SettingRow
          setting="startInTrayUnlessUpdate"
          dependent
          hidden={!autoRun}
          control={<input type="checkbox" />}
        />
      </SettingGroup>
    </SettingFocusProvider>,
  );
}

/** What the one navigate the provider makes would write into the URL. */
function navigatedSearch(): { tab?: SettingsTab; focus?: string } {
  const [{ search: update }] = mockNavigate.mock.calls[0] as [
    { search: (prev: object) => { tab?: SettingsTab; focus?: string } },
  ];
  return update({});
}

describe("focus", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("lands on the row it names and drops the param", async () => {
    search = { focus: "general.autoRun" };
    renderStartup(true);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Auto run").closest("label"));
    });
    expect(navigatedSearch()).toEqual({ tab: "general", focus: undefined });
  });

  /* The namespace is what lets one param carry both halves, so a link needs no
     `tab=` beside the id it already spells the tab into. */
  it("opens the tab the id names", async () => {
    search = { focus: "appearance.theme" };
    renderStartup(true);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(navigatedSearch().tab).toBe("appearance");
  });

  /* Marking a row that draws nothing would be a link that appears to fail, so the
     reader lands on the header above the toggle that gates what they came for. */
  it("marks the group around a row its parent has turned off", async () => {
    search = { focus: "general.startInTrayUnlessUpdate" };
    renderStartup(false);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("group", { name: "Startup" }));
    });
  });

  it("selects the namespace's tab and does nothing else for an id nothing carries", async () => {
    search = { focus: "patching.somethingRenamedLastYear" };
    renderStartup(true);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(navigatedSearch().tab).toBe("patching");
    expect(document.activeElement).toBe(document.body);
  });
});
