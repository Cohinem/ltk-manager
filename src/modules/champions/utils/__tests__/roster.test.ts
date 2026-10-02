import { describe, expect, it } from "vitest";

import type { Champion } from "@/lib/tauri";

import {
  championKey,
  championOptions,
  championRoster,
  createdOption,
  selectedOptions,
} from "../roster";

function champion(id: string, name: string | null, metadataName = id): Champion {
  return { id, metadataName, name, icon: null };
}

const WUKONG = champion("MonkeyKing", "Wukong", "Wukong");
const KSANTE = champion("KSante", "K'Sante");
const AHRI = champion("Ahri", "Ahri");
const roster = championRoster([AHRI, KSANTE, WUKONG]);

describe("championKey", () => {
  it("keeps lowercase letters and digits alone", () => {
    expect(championKey("K'Sante")).toBe("ksante");
    expect(championKey("Jarvan IV")).toBe("jarvaniv");
  });
});

describe("championRoster", () => {
  it("finds a champion by its metadata name, ID or display name in any case", () => {
    expect(roster.find("Wukong")).toBe(WUKONG);
    expect(roster.find("monkeyking")).toBe(WUKONG);
    expect(roster.find("k'sante")).toBe(KSANTE);
    expect(roster.find("Teemo")).toBeUndefined();
  });

  it("gives every value naming one champion the same key", () => {
    expect(roster.keyOf("MonkeyKing")).toBe(roster.keyOf("Wukong"));
    expect(roster.keyOf("Teemo")).toBe("teemo");
  });

  it("labels a value by its champion's display name, and an unknown one by itself", () => {
    expect(roster.labelOf("KSante")).toBe("K'Sante");
    expect(roster.labelOf("Teemo")).toBe("Teemo");
  });

  it("labels a champion the string table does not name by its metadata name", () => {
    expect(championRoster([champion("Ahri", null)]).labelOf("ahri")).toBe("Ahri");
  });
});

describe("championOptions", () => {
  it("lists every champion and each value naming none, one row per champion, by label", () => {
    const options = championOptions(roster, ["ahri", "monkeyking", "Teemo", "teemo"]);

    expect(options.map((option) => [option.label, option.value])).toEqual([
      ["Ahri", "Ahri"],
      ["K'Sante", "KSante"],
      ["Teemo", "Teemo"],
      ["Wukong", "Wukong"],
    ]);
  });

  it("matches a search on the display name, the ID and the metadata name", () => {
    const [, ksante, , wukong] = championOptions(roster, ["Teemo"]);

    expect(ksante?.search).toContain("k'sante");
    expect(wukong?.search).toContain("monkeyking");
  });
});

describe("selectedOptions", () => {
  it("selects one row per champion, each keeping its value as written", () => {
    const values = ["monkeyking", "Teemo", "Wukong"];
    const rows = selectedOptions(roster, championOptions(roster, values), values);

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Wukong", "monkeyking"],
      ["Teemo", "Teemo"],
    ]);
    expect(rows[0]?.champion).toBe(WUKONG);
  });
});

describe("createdOption", () => {
  const options = championOptions(roster, ["Teemo"]);

  it("adds a typed name that matches no row, trimmed", () => {
    expect(createdOption(roster, options, "  Mel ")).toMatchObject({
      value: "Mel",
      label: "Mel",
      created: true,
    });
  });

  it("adds nothing for a name that matches a row, or for blank input", () => {
    expect(createdOption(roster, options, "wukong")).toBeNull();
    expect(createdOption(roster, options, "teemo")).toBeNull();
    expect(createdOption(roster, options, "  ")).toBeNull();
  });
});
