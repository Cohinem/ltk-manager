import { describe, expect, it } from "vitest";

import {
  PALETTE_SOURCES,
  paletteSource,
  parseQuery,
  prefixScope,
  PROJECT_SOURCES,
  WORKSHOP_SOURCES,
} from "../sources";

describe("prefixScope", () => {
  it("names the source a leading prefix asks for", () => {
    expect(prefixScope(">test")).toBe("commands");
    expect(prefixScope("#greeting")).toBe("strings");
    expect(prefixScope("$smolder skin0")).toBe("objects");
  });

  it("ignores a prefix character anywhere but the start", () => {
    expect(prefixScope("aatrox#tx")).toBeNull();
  });

  it("names nothing for a plain query", () => {
    expect(prefixScope("aatrox")).toBeNull();
  });

  it("reaches the projects by either of the two characters that name them", () => {
    expect(prefixScope("/aatrox")).toBe("projects");
    expect(prefixScope("~aatrox")).toBe("projects");
  });

  it("gives every prefix to exactly one source", () => {
    const prefixes = PALETTE_SOURCES.flatMap((source) => [
      ...(source.prefix ?? []),
      ...(source.altPrefix ?? []),
    ]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("names an alias only where the source also carries a primary", () => {
    for (const source of PALETTE_SOURCES) {
      if (source.altPrefix !== undefined) expect(source.prefix).toBeDefined();
    }
  });

  /* The project's objects carry no prefix of their own, so `$` has to reach
     them through the install's. */
  it("lets a source share a prefix only with one that carries it", () => {
    for (const source of PALETTE_SOURCES) {
      if (source.scopedWith === undefined) continue;
      expect(source.prefix).toBeUndefined();
      expect(paletteSource(source.scopedWith).prefix).toBeDefined();
    }
    expect(paletteSource("projectObjects").scopedWith).toBe("objects");
  });
});

describe("parseQuery", () => {
  it("lowercases and trims the term, and keeps the query as typed", () => {
    const parsed = parseQuery("  AatroX  ", null);
    expect(parsed.term).toBe("aatrox");
    expect(parsed.query).toBe("  AatroX  ");
  });

  it("carries the chip through as the scope", () => {
    expect(parseQuery("aatrox", "files")).toEqual({
      scope: "files",
      help: false,
      term: "aatrox",
      query: "aatrox",
    });
  });

  it("reads a bare question mark as the request to list the prefixes", () => {
    expect(parseQuery("?", null)).toEqual({ scope: null, help: true, term: "", query: "" });
  });

  it("filters the prefix list by what follows the question mark", () => {
    expect(parseQuery("?comm", null)).toEqual({
      scope: null,
      help: true,
      term: "comm",
      query: "comm",
    });
  });

  it("takes a question mark as a character once a scope is set", () => {
    expect(parseQuery("?", "strings")).toEqual({
      scope: "strings",
      help: false,
      term: "?",
      query: "?",
    });
  });
});

describe("paletteSource", () => {
  it("answers for every source id the sources declare", () => {
    for (const source of PALETTE_SOURCES) {
      expect(paletteSource(source.id)).toBe(source);
    }
  });
});

describe("the source lists", () => {
  it("gives a project every source there is", () => {
    expect(PROJECT_SOURCES).toEqual(PALETTE_SOURCES.map((source) => source.id));
  });

  it("keeps the game and its objects off the workshop's own surface, where no row could open", () => {
    expect(WORKSHOP_SOURCES).not.toContain("game");
    expect(WORKSHOP_SOURCES).not.toContain("objects");
  });

  it("gives the workshop the projects, which is what a prefix reaches there", () => {
    expect(WORKSHOP_SOURCES).toContain("projects");
  });

  it("names only sources that exist", () => {
    for (const id of WORKSHOP_SOURCES) expect(() => paletteSource(id)).not.toThrow();
  });
});
