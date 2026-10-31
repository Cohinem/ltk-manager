import { describe, expect, it } from "vitest";

import {
  type AudioMenu,
  type AudioMenuEntry,
  type AudioMenuFacts,
  type AudioMenuId,
  audioMenus,
} from "../audioMenus";
import type { AudioCommandId } from "../keymap";

const MEDIA_ONLY: AudioMenuFacts = {
  surfaces: ["media", "document"],
  commands: {},
  checked: {},
  reasons: {},
  slots: [],
  hidden: [],
};

describe("audioMenus", () => {
  it("leaves out a menu whose commands no surface of the document answers", () => {
    const menus = audioMenus(MEDIA_ONLY);

    expect(menus.map((menu) => menu.id)).toEqual(["file", "edit", "view", "playback"]);
  });

  it("draws a separator only between two groups that keep an entry", () => {
    const edit = audioMenus(MEDIA_ONLY).find((menu) => menu.id === "edit");

    expect(edit?.entries.map(entryName)).toEqual(["undo", "redo", "-", "copy"]);
  });

  it("leaves out a hidden command", () => {
    const menus = audioMenus({ ...MEDIA_ONLY, hidden: ["save", "undo", "redo", "details"] });

    expect(menus.map((menu) => menu.id)).toEqual(["edit", "view", "playback"]);
    expect(menus[0]?.entries.map(entryName)).toEqual(["copy"]);
  });

  it("reads the shortcut of a command from the keymap and runs what the document offers", () => {
    const undo = () => {};
    const command = commandOf(audioMenus({ ...BANK, commands: { undo } }), "edit", "undo");

    expect(command).toMatchObject({ shortcut: "Ctrl+Z", run: undo, reason: null });
  });

  it("disables a command that the document does not offer, with the reason it gives", () => {
    const menus = audioMenus({ ...BANK, reasons: { duplicate: "Takes no edits", undo: "None" } });

    expect(commandOf(menus, "edit", "duplicate")).toMatchObject({
      run: null,
      reason: "Takes no edits",
    });
    expect(commandOf(menus, "edit", "redo")).toMatchObject({ run: null, reason: null });
  });

  it("drops the reason of a command that runs", () => {
    const menus = audioMenus({ ...BANK, commands: { undo: () => {} }, reasons: { undo: "None" } });

    expect(commandOf(menus, "edit", "undo")?.reason).toBeNull();
  });

  it("lists the views as one radio group whose checked command is the open view", () => {
    const menus = audioMenus({ ...BANK, checked: { viewEvents: true, toggleInspector: true } });
    const view = menus.find((menu) => menu.id === "view");

    expect(view?.entries.map(entryName)).toEqual([
      "viewMedia|viewEvents",
      "toggleInspector",
      "-",
      "expandAll",
      "collapseAll",
      "-",
      "find",
      "help",
    ]);
    const radio = view?.entries[0];
    expect(radio?.kind === "radio" && radio.commands.map((each) => each.checked)).toEqual([
      false,
      true,
    ]);
  });

  it("nests the container kinds of Insert in a submenu", () => {
    const insert = audioMenus(BANK).find((menu) => menu.id === "insert");

    expect(insert?.entries.map(entryName)).toEqual([
      "newEvent",
      "add",
      "-",
      "addSound",
      "addContainer>",
      "importWem",
    ]);
  });

  it("keeps a slot only if the document fills it", () => {
    const bank = audioMenus({ ...BANK, slots: ["units"] }).find((menu) => menu.id === "bank");

    expect(bank?.entries.map(entryName)).toEqual(["[units]", "-", "replaceMedia"]);
  });

  it("lists the rule edits and the Voice menu on the Voice lines view, without Bank", () => {
    const menus = audioMenus({ ...BANK, surfaces: ["lines"], slots: ["volume"] });

    expect(menus.map((menu) => menu.id)).toEqual([
      "file",
      "edit",
      "insert",
      "view",
      "playback",
      "voice",
    ]);
    expect(menus.find((menu) => menu.id === "edit")?.entries.map(entryName)).toEqual([
      "undo",
      "redo",
      "-",
      "duplicate",
      "remove",
      "-",
      "moveUp",
      "moveDown",
      "-",
      "copy",
      "-",
      "selectAll",
    ]);
    expect(menus.find((menu) => menu.id === "voice")?.entries.map(entryName)).toEqual([
      "addChance",
      "removeChance",
      "pickRandom",
      "-",
      "createEvent",
      "showInBank",
      "showInTree",
      "-",
      "copyForSkin",
    ]);
  });

  it("leaves the Voice menu off a bank", () => {
    expect(audioMenus(BANK).some((menu) => menu.id === "voice")).toBe(false);
  });
});

const BANK: AudioMenuFacts = {
  surfaces: ["media", "voices", "document"],
  commands: {},
  checked: {},
  reasons: {},
  slots: [],
  hidden: [],
};

/** Returns the command `id` of the menu `menu`, at the top level. */
function commandOf(menus: readonly AudioMenu[], menu: AudioMenuId, id: AudioCommandId) {
  const entry = menus
    .find((each) => each.id === menu)
    ?.entries.find(
      (each) => (each.kind === "command" || each.kind === "check") && each.command.id === id,
    );

  return entry?.kind === "command" || entry?.kind === "check" ? entry.command : undefined;
}

/** Returns the command id of `entry`, `-` for a separator, or the slot name. */
function entryName(entry: AudioMenuEntry): string {
  if (entry.kind === "command" || entry.kind === "check") return entry.command.id;
  if (entry.kind === "radio") return entry.commands.map((each) => each.id).join("|");
  if (entry.kind === "submenu") return `${entry.id}>`;
  if (entry.kind === "slot") return `[${entry.slot}]`;

  return "-";
}
