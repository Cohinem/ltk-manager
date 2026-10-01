import { describe, expect, it } from "vitest";

import {
  documentSource,
  gameDocument,
  gameWadDocument,
  gameWadsDocument,
} from "../contentDocument";

describe("game browser documents", () => {
  /* A saved layout holds the bare ids, and the game's tabs must keep opening into them. */
  it("keeps the game's ids and carries no source for the game", () => {
    expect(gameDocument()).toEqual({ id: "game", kind: "game" });
    expect(gameWadsDocument()).toEqual({ id: "game-wads", kind: "game-wads" });
    expect(gameWadDocument("Champions/Aatrox.wad.client")).toEqual({
      id: "game-wad:Champions/Aatrox.wad.client",
      kind: "game-wad",
      wadName: "Champions/Aatrox.wad.client",
    });
  });

  it("keys the League client's tabs apart from the game's", () => {
    expect(gameDocument("lcu").id).toBe("lcu");
    expect(gameWadsDocument("lcu").id).toBe("lcu-wads");
    expect(gameWadDocument("rcp-fe-lol-loot/assets.wad", "lcu").id).toBe(
      "lcu-wad:rcp-fe-lol-loot/assets.wad",
    );
  });

  it("reads the source back, and the game where a document names none", () => {
    expect(documentSource(gameDocument("lcu"))).toBe("lcu");
    expect(documentSource(gameWadsDocument())).toBe("game");
  });
});
