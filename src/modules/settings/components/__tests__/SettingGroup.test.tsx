import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingGroup } from "../SettingGroup";
import { SettingRow } from "../SettingRow";
import { renderSettings } from "./fixtures";

describe("SettingGroup", () => {
  it("labels the band with its own heading", () => {
    renderSettings(
      <SettingGroup id="patching.mod-safety" title="Mod safety">
        <SettingRow setting="blockScriptsWad" control={<input />} />
      </SettingGroup>,
    );

    const heading = screen.getByRole("heading", { level: 4, name: "Mod safety" });
    expect(screen.getByRole("group", { name: "Mod safety" })).toContainElement(heading);
  });

  /* The rule belongs to the group below it, so the panel's first band is not
     divided from the panel edge it already sits against. */
  it("draws its rule only when something precedes it", () => {
    renderSettings(
      <SettingGroup id="patching.injector" title="Injector">
        <SettingRow setting="patchTft" control={<input />} />
      </SettingGroup>,
    );

    expect(screen.getByRole("group", { name: "Injector" })).toHaveClass(
      "border-t",
      "first:border-t-0",
      "first:pt-0",
    );
  });
});
