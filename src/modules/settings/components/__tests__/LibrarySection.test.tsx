// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LibrarySection } from "../LibrarySection";
import { freshSettings, renderSettings } from "./fixtures";

describe("LibrarySection", () => {
  it("leaves priority promotion off until the reader selects it", async () => {
    const settings = freshSettings();
    const onSave = vi.fn();
    renderSettings(<LibrarySection settings={settings} onSave={onSave} />);

    const toggle = screen.getByRole("switch", { name: /Move enabled mods to front/ });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);

    expect(onSave).toHaveBeenCalledWith({ ...settings, promoteEnabledMods: true });
  });

  it("allows priority promotion to be switched off again", async () => {
    const settings = { ...freshSettings(), promoteEnabledMods: true };
    const onSave = vi.fn();
    renderSettings(<LibrarySection settings={settings} onSave={onSave} />, { settings });

    const toggle = screen.getByRole("switch", { name: /Move enabled mods to front/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    expect(onSave).toHaveBeenCalledWith({ ...settings, promoteEnabledMods: false });
  });
});
