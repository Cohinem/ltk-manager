import { describe, expect, it } from "vitest";

import { settingById, settingEntry, settingFocusTab, SETTINGS_INDEX } from "../settingsIndex";
import { isSettingsTab } from "../tabs";

describe("the index", () => {
  it("namespaces every id by a tab that exists", () => {
    for (const entry of SETTINGS_INDEX) {
      const [namespace, name] = entry.id.split(".");
      expect(isSettingsTab(namespace), entry.id).toBe(true);
      expect(name, entry.id).toBeTruthy();
    }
  });

  /* Two rows sharing an id would make a link ambiguous, and two sharing a key
     would make the lookup a row does on mount pick one of them at random. */
  it("carries each id and each key once", () => {
    expect(new Set(SETTINGS_INDEX.map((entry) => entry.id)).size).toBe(SETTINGS_INDEX.length);
    expect(new Set(SETTINGS_INDEX.map((entry) => entry.key)).size).toBe(SETTINGS_INDEX.length);
  });

  it("reads a key back as the row that declared it", () => {
    expect(settingEntry("autoRun")).toMatchObject({ id: "general.autoRun", title: "Auto run" });
    expect(settingEntry("display.sansFont")).toMatchObject({
      id: "appearance.sansFont",
      title: "Interface font",
    });
  });

  it("resolves a public id, and nothing else", () => {
    expect(settingById("patching.patchTft")?.key).toBe("patchTft");
    expect(settingById("patchTft")).toBeUndefined();
  });
});

describe("settingFocusTab", () => {
  it("reads the tab off a setting id", () => {
    expect(settingFocusTab("appearance.theme")).toBe("appearance");
  });

  /* A group id is namespaced the same way, so one rule answers for both and the
     tab is known before the panel holding the target has mounted. */
  it("reads the tab off a group id nothing else resolves", () => {
    expect(settingFocusTab("patching.mod-safety")).toBe("patching");
  });

  it("falls back to the default tab rather than a blank page", () => {
    expect(settingFocusTab("nowhere.somethingRenamedLastYear")).toBe("general");
    expect(settingFocusTab("bareKeyFromAnOlderBuild")).toBe("general");
  });
});
