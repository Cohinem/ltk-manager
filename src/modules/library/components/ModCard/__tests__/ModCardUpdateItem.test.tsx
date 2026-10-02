// @vitest-environment happy-dom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Menu } from "@/components";
import { api } from "@/lib/tauri";
import { createMockInstalledMod } from "@/test/fixtures";
import { renderWithProviders } from "@/test/utils";

import { ModCardUpdateItem } from "../ModCardUpdateItem";

const picker = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: picker.open }));

async function openMenu() {
  renderWithProviders(
    <Menu.Root>
      <Menu.Trigger>Options</Menu.Trigger>
      <Menu.Content>
        <ModCardUpdateItem modId="existing-id" />
      </Menu.Content>
    </Menu.Root>,
  );
  fireEvent.click(screen.getByText("Options"));
  return screen.findByRole("menuitem", { name: "Update from file" });
}

describe("mod updates", () => {
  beforeEach(() => {
    picker.open.mockReset();
    vi.restoreAllMocks();
  });

  it("updates the selected library identity with the chosen archive", async () => {
    picker.open.mockResolvedValue("C:/mods/new.fantome");
    const update = vi.spyOn(api, "updateMod").mockResolvedValue({
      ok: true,
      value: createMockInstalledMod({ id: "existing-id" }),
    });
    fireEvent.click(await openMenu());
    await waitFor(() => expect(update).toHaveBeenCalledWith("existing-id", "C:/mods/new.fantome"));
  });

  it("leaves the library alone when the file picker is cancelled", async () => {
    picker.open.mockResolvedValue(null);
    const update = vi.spyOn(api, "updateMod");
    fireEvent.click(await openMenu());
    await waitFor(() => expect(picker.open).toHaveBeenCalledOnce());
    expect(update).not.toHaveBeenCalled();
  });
});
