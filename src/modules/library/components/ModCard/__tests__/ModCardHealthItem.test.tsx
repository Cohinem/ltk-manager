// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Menu, ToastProvider } from "@/components";
import type { HealthCheckReadiness } from "@/lib/tauri";

import { ModCardHealthItem } from "../ModCardParts";

const readiness = vi.fn<() => HealthCheckReadiness>(() => "ready");
const checkOne = vi.fn();

vi.mock("@/modules/library/api", () => ({
  useModEffectiveCategories: () => ({
    derivedTags: [],
    derivedChampions: [],
    derivedMaps: [],
    primaryDerivedChampion: null,
  }),
  useHealthCheckReadiness: () => readiness(),
  useCheckModHealth: () => ({ mutate: checkOne, isPending: false }),
}));

vi.mock("@/modules/settings", () => ({
  useSettings: () => ({ data: { showModTags: true } }),
}));

function show(state: HealthCheckReadiness) {
  readiness.mockReturnValue(state);
  render(
    <ToastProvider>
      <Menu.Root open>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <ModCardHealthItem modId="a" />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModCardHealthItem", () => {
  it("offers the check on a machine whose tables are open", async () => {
    show("ready");

    await userEvent.click(screen.getByRole("menuitem", { name: "Check Health" }));

    expect(checkOne).toHaveBeenCalledWith("a", expect.anything());
  });

  /* The window the row exists for: pressing here would only earn a refusal. */
  it("says what it is waiting for while the hashtables are still coming", () => {
    show("syncing");

    expect(screen.getByRole("menuitem", { name: /syncing hashtables/i })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.queryByRole("menuitem", { name: "Check Health" })).not.toBeInTheDocument();
  });

  it("names the missing tables once nothing is fetching them", () => {
    show("unsynced");

    expect(screen.getByRole("menuitem", { name: /hashtables not synced/i })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("does not run a check from a row that is only saying it cannot", async () => {
    show("unsynced");

    await userEvent.click(screen.getByRole("menuitem", { name: /hashtables not synced/i }));

    expect(checkOne).not.toHaveBeenCalled();
  });
});
