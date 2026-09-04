import { describe, expect, it } from "vitest";

import { isSettingsTab } from "../tabs";

describe("isSettingsTab", () => {
  it("accepts a tab the rail draws", () => {
    expect(isSettingsTab("patching")).toBe(true);
  });

  /* A link outliving the tab it named falls back to General rather than blanking
     the page, which is the right failure for a URL somebody bookmarked. */
  it("rejects anything else", () => {
    expect(isSettingsTab("plugins")).toBe(false);
    expect(isSettingsTab(undefined)).toBe(false);
    expect(isSettingsTab(3)).toBe(false);
  });
});
