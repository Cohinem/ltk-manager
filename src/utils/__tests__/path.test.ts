import { describe, expect, it } from "vitest";

import { basename, slashed } from "../path";

describe("slashed", () => {
  it("spells a path with forward slashes and no verbatim prefix", () => {
    expect(slashed("\\\\?\\C:\\Riot Games\\League of Legends (PBE)")).toBe(
      "C:/Riot Games/League of Legends (PBE)",
    );
    expect(slashed("C:/Riot Games/League of Legends")).toBe("C:/Riot Games/League of Legends");
  });
});

describe("basename", () => {
  it("takes the last segment whichever slash the path uses", () => {
    expect(basename("C:\\Riot Games\\League of Legends (PBE)")).toBe("League of Legends (PBE)");
    expect(basename("C:/Riot Games/League of Legends/")).toBe("League of Legends");
  });
});
