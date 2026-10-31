import { describe, expect, it } from "vitest";

import {
  type CommandMenuEntry,
  compactMenuItems,
  compactMenus,
  flattenMenuCommands,
  MENU_SEPARATOR,
} from "../commandMenu";

const command = (id: string, run: (() => void) | null = () => {}): CommandMenuEntry => ({
  kind: "command",
  id,
  title: id,
  run,
});

describe("compactMenuItems", () => {
  it("drops falsy entries and collapses separators", () => {
    const items = compactMenuItems([
      MENU_SEPARATOR,
      null,
      command("a"),
      false,
      MENU_SEPARATOR,
      undefined,
      MENU_SEPARATOR,
      command("b"),
      MENU_SEPARATOR,
    ]);

    expect(items.map((item) => (item.kind === "separator" ? "-" : item.id))).toEqual([
      "a",
      "-",
      "b",
    ]);
  });

  it("drops a submenu if all of its entries drop", () => {
    const items = compactMenuItems([
      { kind: "submenu", id: "empty", title: "Empty", items: [null, MENU_SEPARATOR] },
      { kind: "submenu", id: "kept", title: "Kept", items: [command("a")] },
    ]);

    expect(items.map((item) => (item.kind === "submenu" ? item.id : ""))).toEqual(["kept"]);
  });
});

describe("compactMenus", () => {
  it("leaves out a menu with no entry", () => {
    const menus = compactMenus([
      { id: "file", title: "File", items: [command("save")] },
      { id: "view", title: "View", items: [null] },
    ]);

    expect(menus.map((menu) => menu.id)).toEqual(["file"]);
  });
});

describe("flattenMenuCommands", () => {
  it("lists commands, choices and submenu commands under their menu", () => {
    const flat = flattenMenuCommands([
      {
        id: "view",
        title: "View",
        items: [
          command("fit"),
          {
            kind: "radio",
            id: "mode",
            value: "a",
            options: [
              { value: "a", title: "A" },
              { value: "b", title: "B", disabled: true },
            ],
            onPick: () => {},
          },
          { kind: "submenu", id: "more", title: "More", items: [command("nested", null)] },
          { kind: "slot", id: "slot", node: null },
        ],
      },
    ]);

    expect(flat.map((each) => [each.id, each.menu, each.run !== null])).toEqual([
      ["fit", "View", true],
      ["mode:a", "View", true],
      ["mode:b", "View", false],
      ["nested", "View", false],
    ]);
  });
});
