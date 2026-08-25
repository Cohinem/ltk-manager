import { describe, expect, it } from "vitest";

import { isSettingDefault, settingFormat, settingValue } from "../settingDefaults";

describe("isSettingDefault", () => {
  /* An unset preset is the brand preset, and both spellings reach the store, so
     comparing them raw would report a change nobody made. */
  it("reads an unset accent preset as the brand preset", () => {
    expect(
      isSettingDefault(
        "accentColor",
        { preset: "ltk", customHue: null },
        { preset: null, customHue: null },
      ),
    ).toBe(true);
  });

  it("still sees a real accent change", () => {
    expect(
      isSettingDefault(
        "accentColor",
        { preset: "teal", customHue: null },
        { preset: null, customHue: null },
      ),
    ).toBe(false);
  });

  it("compares a list by its order", () => {
    expect(isSettingDefault("trustedDomains", ["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("settingFormat", () => {
  it("has no entry for the keys that hold a reader's own data", () => {
    for (const key of ["leaguePath", "modStoragePath", "workshopPath", "wadBlocklist"] as const) {
      expect(settingFormat(key)).toBeUndefined();
    }
  });

  it("reads a default the way the row does", () => {
    expect(settingFormat("autoRun")?.(false)).toBe("Off");
    expect(settingFormat("display.zoomLevel")?.(100)).toBe("100%");
    expect(settingFormat("display.sansFont")?.("geist")).toBe("Geist");
    expect(settingFormat("display.monoFont")?.("jetbrains")).toBe("JetBrains Mono");
    expect(settingFormat("launchMode")?.("classic")).toBe("Classic");
    expect(settingFormat("killLeagueHotkey")?.(null)).toBe("None");
    expect(settingFormat("accentColor")?.({ preset: null, customHue: null })).toBe("LTK");
  });
});

describe("settingValue", () => {
  it("reads each namespace from the store that owns it", () => {
    const settings = { autoRun: true } as never;
    const display = { zoomLevel: 120 } as never;
    const layout = { tabOpenMode: "replace" } as never;

    expect(settingValue("autoRun", settings, display, layout)).toBe(true);
    expect(settingValue("display.zoomLevel", settings, display, layout)).toBe(120);
    expect(settingValue("layout.tabOpenMode", settings, display, layout)).toBe("replace");
  });
});
