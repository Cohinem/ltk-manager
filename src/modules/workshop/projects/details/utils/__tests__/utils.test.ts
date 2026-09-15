import { describe, expect, it } from "vitest";

import {
  appendAuthor,
  filterEmptyAuthors,
  parseChampionsText,
  removeAuthorAt,
  updateAuthorAt,
} from "../utils";

describe("parseChampionsText", () => {
  it("splits comma-separated names and trims whitespace", () => {
    expect(parseChampionsText("Aatrox, Ahri, Zed")).toEqual(["Aatrox", "Ahri", "Zed"]);
  });

  it("filters out empty entries from trailing commas", () => {
    expect(parseChampionsText("Aatrox,,, Ahri,")).toEqual(["Aatrox", "Ahri"]);
  });

  it("returns empty array for blank input", () => {
    expect(parseChampionsText("")).toEqual([]);
    expect(parseChampionsText("   ")).toEqual([]);
    expect(parseChampionsText(",,,")).toEqual([]);
  });

  it("handles single champion without commas", () => {
    expect(parseChampionsText("Jinx")).toEqual(["Jinx"]);
  });

  it("trims leading/trailing whitespace on each name", () => {
    expect(parseChampionsText("  Lux ,  Ezreal  ")).toEqual(["Lux", "Ezreal"]);
  });
});

describe("filterEmptyAuthors", () => {
  it("removes authors with empty names", () => {
    const authors = [
      { name: "Alice", role: "Artist" },
      { name: "", role: "Writer" },
      { name: "Bob", role: "" },
    ];
    expect(filterEmptyAuthors(authors)).toEqual([
      { name: "Alice", role: "Artist" },
      { name: "Bob", role: "" },
    ]);
  });

  it("removes authors with whitespace-only names", () => {
    const authors = [
      { name: "  ", role: "Role" },
      { name: "Valid", role: null },
    ];
    expect(filterEmptyAuthors(authors)).toEqual([{ name: "Valid", role: null }]);
  });

  it("returns empty array when all authors are empty", () => {
    expect(filterEmptyAuthors([{ name: "", role: "" }])).toEqual([]);
  });

  it("returns all authors when none are empty", () => {
    const authors = [
      { name: "A", role: "X" },
      { name: "B", role: "Y" },
    ];
    expect(filterEmptyAuthors(authors)).toEqual(authors);
  });
});

describe("updateAuthorAt", () => {
  const base = [
    { name: "Alice", role: "Artist" },
    { name: "Bob", role: "Writer" },
  ];

  it("updates name at given index", () => {
    const result = updateAuthorAt(base, 0, "name", "Carol");
    expect(result[0].name).toBe("Carol");
    expect(result[0].role).toBe("Artist");
    expect(result[1]).toEqual(base[1]);
  });

  it("updates role at given index", () => {
    const result = updateAuthorAt(base, 1, "role", "Designer");
    expect(result[1].role).toBe("Designer");
    expect(result[1].name).toBe("Bob");
  });

  it("does not mutate the original array", () => {
    const result = updateAuthorAt(base, 0, "name", "Changed");
    expect(base[0].name).toBe("Alice");
    expect(result).not.toBe(base);
  });
});

describe("removeAuthorAt", () => {
  const base = [
    { name: "Alice", role: "A" },
    { name: "Bob", role: "B" },
    { name: "Carol", role: "C" },
  ];

  it("removes the author at the given index", () => {
    const result = removeAuthorAt(base, 1);
    expect(result).toEqual([
      { name: "Alice", role: "A" },
      { name: "Carol", role: "C" },
    ]);
  });

  it("removes the first author", () => {
    expect(removeAuthorAt(base, 0)).toHaveLength(2);
    expect(removeAuthorAt(base, 0)[0].name).toBe("Bob");
  });

  it("removes the last author", () => {
    expect(removeAuthorAt(base, 2)).toHaveLength(2);
    expect(removeAuthorAt(base, 2)[1].name).toBe("Bob");
  });

  it("does not mutate the original array", () => {
    const result = removeAuthorAt(base, 0);
    expect(base).toHaveLength(3);
    expect(result).not.toBe(base);
  });
});

describe("appendAuthor", () => {
  it("appends a blank author to the list", () => {
    const base = [{ name: "Alice", role: "Artist" }];
    const result = appendAuthor(base);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ name: "", role: "" });
  });

  it("works on empty array", () => {
    const result = appendAuthor([]);
    expect(result).toEqual([{ name: "", role: "" }]);
  });

  it("does not mutate the original array", () => {
    const base = [{ name: "A", role: "B" }];
    const result = appendAuthor(base);
    expect(base).toHaveLength(1);
    expect(result).not.toBe(base);
  });
});
