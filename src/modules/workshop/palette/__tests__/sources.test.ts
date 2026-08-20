import { describe, expect, it } from "vitest";

import { PALETTE_SOURCES, paletteSource, parseQuery, prefixScope } from "../sources";

describe("prefixScope", () => {
  it("names the source a leading prefix asks for", () => {
    expect(prefixScope(">test")).toBe("commands");
    expect(prefixScope("#greeting")).toBe("strings");
  });

  it("ignores a prefix character anywhere but the start", () => {
    expect(prefixScope("aatrox#tx")).toBeNull();
  });

  it("names nothing for a plain query", () => {
    expect(prefixScope("aatrox")).toBeNull();
  });

  it("gives every prefix to exactly one source", () => {
    const prefixes = PALETTE_SOURCES.flatMap((source) => source.prefix ?? []);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("parseQuery", () => {
  it("lowercases and trims the term", () => {
    expect(parseQuery("  AatroX  ", null).term).toBe("aatrox");
  });

  it("carries the chip through as the scope", () => {
    expect(parseQuery("aatrox", "files")).toEqual({
      scope: "files",
      help: false,
      term: "aatrox",
    });
  });

  it("reads a bare question mark as the request to list the prefixes", () => {
    expect(parseQuery("?", null)).toEqual({ scope: null, help: true, term: "" });
  });

  it("filters the prefix list by what follows the question mark", () => {
    expect(parseQuery("?comm", null)).toEqual({ scope: null, help: true, term: "comm" });
  });

  it("takes a question mark as a character once a scope is set", () => {
    expect(parseQuery("?", "strings")).toEqual({ scope: "strings", help: false, term: "?" });
  });
});

describe("paletteSource", () => {
  it("answers for every source id the sources declare", () => {
    for (const source of PALETTE_SOURCES) {
      expect(paletteSource(source.id)).toBe(source);
    }
  });
});
