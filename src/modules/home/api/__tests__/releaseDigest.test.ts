import { describe, expect, it } from "vitest";

import { releaseDigest } from "../releaseDigest";

describe("releaseDigest", () => {
  it("lists each area with its change count and first change", () => {
    const body = [
      "## Library",
      "",
      "- Change the library while the patcher runs: toggle, reorder,",
      "  manage folders, switch profiles",
      "- With a game open, changes wait for the next game",
      "",
      "## Problems",
      "",
      "- Files that could not be checked are listed once",
      "",
      "### Fixed",
      "",
      "- `.tex` files that hold DDS data reported as unreadable",
    ].join("\n");

    expect(releaseDigest(body)).toEqual([
      {
        title: "Library",
        count: 2,
        summary:
          "Change the library while the patcher runs: toggle, reorder, manage folders, switch profiles",
      },
      { title: "Problems", count: 2, summary: "Files that could not be checked are listed once" },
    ]);
  });

  it("summarises an area by its lead sentence, without its inline marks", () => {
    const body = [
      "## Atlas UI Editor",
      "",
      "A new Workshop editor. Open a `ViewController` in the **View** layout.",
      "",
      "- Preview each scene on its own screen",
    ].join("\n");

    expect(releaseDigest(body)).toEqual([
      {
        title: "Atlas UI Editor",
        count: 1,
        summary: "A new Workshop editor. Open a ViewController in the View layout.",
      },
    ]);
  });

  it("counts the changes under an area's sub-groups as the area's own", () => {
    const body = ["## Particle Editor", "### Graph", "- One", "- Two", "### Templates", "- Three"];

    expect(releaseDigest(body.join("\n"))).toEqual([
      { title: "Particle Editor", count: 3, summary: "One" },
    ]);
  });

  it("opens with a sub-group or with no heading at all", () => {
    expect(releaseDigest("### Fixed\n\n- A fix the build itself carries\n")).toEqual([
      { title: "Fixed", count: 1, summary: "A fix the build itself carries" },
    ]);
    expect(releaseDigest("- The same fix, as the feed words it")).toEqual([
      { title: null, count: 1, summary: "The same fix, as the feed words it" },
    ]);
  });

  it("keeps a link's words and drops its target", () => {
    expect(releaseDigest("## Bin Editor\n\n- Docs from the [Meta Wiki](https://x.dev/)")).toEqual([
      { title: "Bin Editor", count: 1, summary: "Docs from the Meta Wiki" },
    ]);
  });

  it("is empty for a release with no notes", () => {
    expect(releaseDigest(undefined)).toEqual([]);
    expect(releaseDigest("  \n")).toEqual([]);
  });
});
