import { describe, expect, it } from "vitest";

import { TYPE_AHEAD_IDLE_MS, typeAheadMatch, typedText } from "../typeAhead";

function key(text: string, held: { ctrlKey?: boolean; altKey?: boolean } = {}) {
  return { key: text, ctrlKey: false, metaKey: false, altKey: false, ...held };
}

const LABELS = [
  "Play_sfx_Rumble_BasicAttack_OnHit",
  "Play_sfx_Rumble_Death3D_cast",
  "Play_vo_Rumble_Joke",
  "Stop_sfx_Rumble_Flamespitter",
];

describe("typeAheadMatch", () => {
  it("returns the next row after `from` whose label starts with the text, wrapping at the end", () => {
    expect(typeAheadMatch(LABELS, "s", 0)).toBe(3);
    expect(typeAheadMatch(LABELS, "p", 3)).toBe(0);
  });

  it("matches a word inside a label if no label starts with the text", () => {
    expect(typeAheadMatch(LABELS, "death", 0)).toBe(1);
    expect(typeAheadMatch(LABELS, "flame", 0)).toBe(3);
    expect(typeAheadMatch(["Death3D_cast / Random #500572873"], "rand", 0)).toBe(0);
  });

  it("prefers a label that starts with the text over a word inside an earlier one", () => {
    expect(typeAheadMatch(["Play_vo_Joke", "Joke_Taunt"], "joke", -1)).toBe(1);
  });

  it("keeps the row at `from` while its label still matches a longer text", () => {
    expect(typeAheadMatch(LABELS, "play_v", 2, { keep: true })).toBe(2);
  });

  it("returns null if no label matches", () => {
    expect(typeAheadMatch(LABELS, "zz", 0)).toBeNull();
    expect(typeAheadMatch([], "a", -1)).toBeNull();
  });
});

describe("typedText", () => {
  it("adds a key to the text typed before it, and keeps the row that the text selected", () => {
    const first = typedText(null, key("D"), 1000);
    expect(first).toEqual({ text: "d", at: 1000, keep: false });
    expect(typedText(first, key("e"), 1200)).toEqual({ text: "de", at: 1200, keep: true });
  });

  it("starts a new text after the idle time", () => {
    const first = typedText(null, key("d"), 1000);
    expect(typedText(first, key("s"), 1000 + TYPE_AHEAD_IDLE_MS + 1)?.text).toBe("s");
  });

  it("moves on from the row for a run of one letter, so the letter cycles the rows", () => {
    const first = typedText(null, key("p"), 0);
    expect(typedText(first, key("p"), 100)).toEqual({ text: "p", at: 100, keep: false });
  });

  it("returns null for a key that types no name", () => {
    expect(typedText(null, key(" "), 0)).toBeNull();
    expect(typedText(null, key("d", { ctrlKey: true }), 0)).toBeNull();
    expect(typedText(null, key("ArrowDown"), 0)).toBeNull();
    expect(typedText(null, key("?"), 0)).toBeNull();
    expect(typedText(null, key("-"), 0)).toBeNull();
  });

  it("takes the underscore and the hash that event names and unnamed IDs carry", () => {
    expect(typedText(null, key("#"), 0)?.text).toBe("#");
    expect(typedText(typedText(null, key("a"), 0), key("_"), 10)?.text).toBe("a_");
  });
});
