import { describe, expect, it } from "vitest";

import { barMode, barPlaceholder } from "../barMode";

describe("barMode", () => {
  it("draws the crumb while the bar is closed, whatever the route", () => {
    expect(barMode(null, false, null)).toBe("idle");
    expect(barMode(null, true, null)).toBe("idle");
    expect(barMode(null, true, "commands")).toBe("idle");
  });

  it("opens on the palette on either surface, which is what a click asks for", () => {
    expect(barMode("palette", true, null)).toBe("palette");
    expect(barMode("palette", false, null)).toBe("palette");
  });

  it("keeps the palette under a scope, however it was opened", () => {
    expect(barMode("palette", true, "files")).toBe("palette");
    expect(barMode("filter", false, "commands")).toBe("palette");
  });

  it("filters the grid, which is the one thing the palette does not do", () => {
    expect(barMode("filter", false, null)).toBe("filter");
  });

  it("has no grid to narrow inside a project, so it answers with the palette", () => {
    expect(barMode("filter", true, null)).toBe("palette");
  });
});

describe("barPlaceholder", () => {
  it("names the grid while filtering, whatever the scope was", () => {
    expect(barPlaceholder("filter", false, null)).toContain("Filter the projects");
  });

  it("names the scope over the source it narrowed to", () => {
    expect(barPlaceholder("palette", true, "strings")).toBe("Search the strings");
    expect(barPlaceholder("palette", false, "commands")).toBe("Search the commands");
  });

  it("names what an unscoped box reaches, which differs by route", () => {
    expect(barPlaceholder("palette", true, null)).toContain("this project");
    expect(barPlaceholder("palette", false, null)).toContain("projects");
  });
});
