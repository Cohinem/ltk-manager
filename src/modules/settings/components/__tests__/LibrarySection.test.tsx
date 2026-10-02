// @vitest-environment happy-dom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LibrarySection } from "../LibrarySection";
import { freshSettings, renderSettings, savedSettings } from "./fixtures";

describe("LibrarySection", () => {
  it("leaves priority promotion off until the reader selects it", async () => {
    const settings = freshSettings();
    renderSettings(<LibrarySection />);

    const toggle = screen.getByRole("switch", { name: /Move enabled mods to front/ });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => expect(savedSettings()).toEqual({ ...settings, promoteEnabledMods: true }));
  });

  it("allows priority promotion to be switched off again", async () => {
    const settings = { ...freshSettings(), promoteEnabledMods: true };
    renderSettings(<LibrarySection />, { settings });

    const toggle = screen.getByRole("switch", { name: /Move enabled mods to front/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(savedSettings()).toEqual({ ...settings, promoteEnabledMods: false }),
    );
  });
});
