import { describe, expect, it } from "vitest";

import type { PaneCommand } from "../../../menus/state/paneCommands";
import { listCommands, listedCommands, offerRadio } from "../skinCommands";

describe("listedCommands", () => {
  it("returns the offers that listCommands published, in order", () => {
    const offers: PaneCommand[] = [
      { run: null, title: "a" },
      { run: null, title: "b" },
    ];
    const published = listCommands("list", offers);

    expect(listedCommands((id) => published[id] ?? null, "list")).toEqual(offers);
  });

  it("returns nothing if no pane offers the list", () => {
    expect(listedCommands(() => null, "list")).toEqual([]);
  });
});

describe("offerRadio", () => {
  it("reads the current option from the checked offer", () => {
    const radio = offerRadio("radio", [
      { run: null, title: "a" },
      { run: () => {}, title: "b", checked: true },
    ]);

    expect(radio.value).toBe("1");
    expect(radio.options.map((option) => option.disabled)).toEqual([true, false]);
  });

  it("has no current option if no offer is checked", () => {
    expect(offerRadio("radio", [{ run: null }]).value).toBeNull();
  });

  it("runs the offer of the picked option", () => {
    let ran = 0;
    const radio = offerRadio("radio", [{ run: null }, { run: () => (ran += 1) }]);

    radio.onPick("1");

    expect(ran).toBe(1);
  });
});
