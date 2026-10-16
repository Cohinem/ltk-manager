import { describe, expect, it } from "vitest";

import { settingsFocus } from "../useOpenDeepLink";

describe("settingsFocus", () => {
  it("returns the focus of a settings link", () => {
    expect(settingsFocus("ltk://settings?focus=builtins.baseSkins")).toBe("builtins.baseSkins");
  });

  it("returns null if the link is not a settings link", () => {
    expect(settingsFocus("ltk://install?url=https://example.com/a.modpkg")).toBeNull();
    expect(settingsFocus("https://settings?focus=general.autoRun")).toBeNull();
  });

  it("returns null if the settings link has no focus", () => {
    expect(settingsFocus("ltk://settings?tab=general")).toBeNull();
    expect(settingsFocus("ltk://settings?focus=")).toBeNull();
  });
});
