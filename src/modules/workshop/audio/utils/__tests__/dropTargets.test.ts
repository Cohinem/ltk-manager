import { describe, expect, it } from "vitest";

import { dropAction, type DropSlot, ruleShortName } from "../dropTargets";

describe("ruleShortName", () => {
  it("returns the name after the verb and the tag of the skin, as compose_vo_names composes it", () => {
    expect(ruleShortName("Play_vo_Ahri_Joke3D", ["Ahri"], null)).toBe("Joke3D");
    expect(ruleShortName("play_vo_ahribase_cast3D", ["Ahri", "AhriBase"], null)).toBe("cast3D");
  });

  it("drops the spell segment of a rule with a spell condition", () => {
    expect(ruleShortName("Play_vo_Ahri_AhriQ_cast3D", ["Ahri"], "AhriQ")).toBe("cast3D");
  });

  it("returns null for a name that no tag of the skin composes", () => {
    expect(ruleShortName("Play_sfx_Ahri_Joke", ["Ahri"], null)).toBeNull();
    expect(ruleShortName("Play_vo_Lux_Joke", ["Ahri"], null)).toBeNull();
    expect(ruleShortName("Play_vo_Ahri_", ["Ahri"], null)).toBeNull();
  });
});

const SOUND: DropSlot = { kind: "sound", key: "v1", source: 4047148852, place: null };

describe("dropAction", () => {
  it("replaces the media of a sound with a dropped WEM", () => {
    expect(dropAction({ kind: "file", path: "C:/mods/cast.WEM" }, SOUND)).toEqual({
      kind: "replace",
      source: 4047148852,
      file: "C:/mods/cast.WEM",
    });
  });

  it("replaces with a file that the Wwise console converts, and refuses another kind", () => {
    expect(dropAction({ kind: "file", path: "C:/mods/cast.wav" }, SOUND)?.kind).toBe("replace");
    expect(dropAction({ kind: "file", path: "C:/mods/notes.txt" }, SOUND)).toBeNull();
  });

  it("refuses a file on a sound whose media takes no replacement", () => {
    const fixed: DropSlot = { ...SOUND, source: null };
    expect(dropAction({ kind: "file", path: "C:/mods/cast.wem" }, fixed)).toBeNull();
  });

  it("imports a dropped WEM into the add row, and refuses a file that needs a conversion", () => {
    const add: DropSlot = { kind: "add", key: "a", into: { kind: "container", container: 7 } };

    expect(dropAction({ kind: "file", path: "D:/new.wem" }, add)).toEqual({
      kind: "import",
      into: { kind: "container", container: 7 },
      file: "D:/new.wem",
    });
    expect(dropAction({ kind: "file", path: "D:/new.ogg" }, add)).toBeNull();
  });

  it("moves a row to the place of another row of its list", () => {
    const dragged = { kind: "row", key: "v1", place: { list: "c:7", index: 0 } } as const;
    const over: DropSlot = {
      kind: "sound",
      key: "v3",
      source: 1,
      place: { list: "c:7", index: 2 },
    };

    expect(dropAction(dragged, over)).toEqual({ kind: "move", key: "v1", list: "c:7", index: 2 });
  });

  it("refuses a move to another list, onto the row itself, and of a row without a place", () => {
    const dragged = { kind: "row", key: "v1", place: { list: "c:7", index: 0 } } as const;

    expect(
      dropAction(dragged, { kind: "container", key: "g", place: { list: "c:9", index: 1 } }),
    ).toBeNull();
    expect(dropAction(dragged, { ...SOUND, place: { list: "c:7", index: 0 } })).toBeNull();
    expect(
      dropAction({ kind: "row", key: "v2", place: null }, { ...SOUND, place: null }),
    ).toBeNull();
  });

  it("targets a rule with a dropped event, and refuses an event on a bank row", () => {
    const rule: DropSlot = { kind: "rule", key: "r:1", place: { list: "s:0", index: 1 } };
    const event = { kind: "event", name: "Play_vo_Ahri_Joke" } as const;

    expect(dropAction(event, rule)).toEqual({
      kind: "target",
      rule: "r:1",
      name: "Play_vo_Ahri_Joke",
    });
    expect(dropAction(event, SOUND)).toBeNull();
  });
});
