import { describe, expect, it } from "vitest";

import type { BankUnitGroup } from "@/lib/tauri";

import { unitsTrigger } from "../bankUnits";

function group(name: string, file: string): BankUnitGroup {
  return {
    name,
    voiceOver: false,
    files: [{ path: file, asset: null, state: { kind: "missing" }, opened: false }],
    declarations: [],
  };
}

describe("unitsTrigger", () => {
  it("returns null if no unit names the file", () => {
    expect(unitsTrigger([])).toBeNull();
  });

  it("names the one unit that names the file", () => {
    expect(unitsTrigger([group("Rumble_Base_SFX", "a_audio.bnk")])).toEqual({
      name: "Rumble_Base_SFX",
      more: 0,
    });
  });

  it("counts the other unit names after the first", () => {
    const units = [
      group("Ahri_Base_VO", "ahri_base_vo_audio.bnk"),
      group("Ahri_Skin07_VO", "ahri_skin07_vo_audio.bnk"),
      group("Ahri_Skin08_VO", "ahri_skin08_vo_audio.bnk"),
    ];

    expect(unitsTrigger(units)).toEqual({ name: "Ahri_Base_VO", more: 2 });
  });

  it("counts a name once if two groups share it", () => {
    const units = [
      group("Rumble_Base_SFX", "a_audio.bnk"),
      group("Rumble_Base_SFX", "b_audio.bnk"),
    ];

    expect(unitsTrigger(units)).toEqual({ name: "Rumble_Base_SFX", more: 0 });
  });
});
