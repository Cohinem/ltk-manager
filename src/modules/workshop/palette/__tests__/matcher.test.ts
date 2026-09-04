import { describe, expect, it } from "vitest";

import { compileQuery, letterMask, maskCovers, matchQuery, startsQuery } from "../matcher";

function query(raw: string) {
  const compiled = compileQuery(raw);
  if (!compiled) throw new Error(`${raw} compiled to nothing`);
  return compiled;
}

/** The matched substrings a match marks, which is what a row draws. */
function marked(raw: string, text: string): string[] | null {
  const match = matchQuery(query(raw), text);
  if (!match) return null;
  return match.ranges.map(([start, end]) => text.slice(start, end));
}

function score(raw: string, text: string): number {
  const match = matchQuery(query(raw), text);
  if (!match) throw new Error(`"${raw}" did not match "${text}"`);
  return match.score;
}

describe("compileQuery", () => {
  it("compiles nothing out of an empty query", () => {
    expect(compileQuery("   ")).toBeNull();
  });

  it("splits a query on its whitespace", () => {
    expect(query("nasus  base ").terms).toEqual(["nasus", "base"]);
  });
});

describe("matchQuery", () => {
  it("matches a run of characters", () => {
    expect(marked("nasus", "nasus.bin")).toEqual(["nasus"]);
  });

  it("ignores case on both sides", () => {
    expect(marked("AATROX", "Aatrox_Base.bin")).toEqual(["Aatrox"]);
  });

  it("reports no match when the run is broken", () => {
    expect(matchQuery(query("nasus"), "n_a_s_u_s.bin")).toBeNull();
  });

  /* The reason this replaced a subsequence matcher. */
  it("reports no match for a query scattered over a path", () => {
    const scattered = "assets/characters/smolder/sounds/charizard_sfx_audio.bnk";
    expect(matchQuery(query("nasus"), scattered)).toBeNull();
  });

  it("holds every term or nothing", () => {
    const text = "assets/characters/nasus/skins/base/nasus_base_tx_cm.dds";
    expect(marked("nasus tx", text)).toEqual(["nasus", "tx"]);
    expect(matchQuery(query("nasus zed"), text)).toBeNull();
  });

  it("folds two terms that meet into one run", () => {
    expect(marked("na sus", "nasus.bin")).toEqual(["nasus"]);
  });

  it("prefers a term that opens a word", () => {
    expect(score("base", "skins/base/skin.bin")).toBeGreaterThan(score("base", "databases.bin"));
  });

  it("prefers a term that is a whole word", () => {
    expect(score("base", "skins/base/skin.bin")).toBeGreaterThan(
      score("base", "skins/basename.bin"),
    );
  });

  it("scores every term it holds", () => {
    expect(score("nasus base", "nasus/base.bin")).toBeGreaterThan(score("nasus", "nasus/base.bin"));
  });
});

describe("startsQuery", () => {
  it("reports where a name opens with the query", () => {
    expect(startsQuery(query("nasus"), "nasus.bin")).toBe(true);
    expect(startsQuery(query("nasus"), "old_nasus.bin")).toBe(false);
  });
});

describe("letterMask", () => {
  it("covers a query whose letters the candidate holds", () => {
    expect(maskCovers(letterMask("aatrox.bin"), query("ari").mask)).toBe(true);
  });

  it("rejects a query holding a letter the candidate does not", () => {
    expect(maskCovers(letterMask("aatrox.bin"), query("zed").mask)).toBe(false);
  });

  it("never rejects on a digit or a separator, which it does not track", () => {
    expect(maskCovers(letterMask("skin.bin"), query("01/").mask)).toBe(true);
  });
});
