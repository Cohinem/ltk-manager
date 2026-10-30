import { describe, expect, it } from "vitest";

import { AUDIO_KEYMAP, resolveCommand, sheetGroups, shortcutOf } from "../keymap";

/**
 * The chords that the app answers outside the audio document, per "The editor's keys" in
 * docs/ux/PROJECT_EDITOR.md, the routes and the palette. `Ctrl+D` is absent: the trees take it
 * for Duplicate and stop it there, as the VFX timeline does.
 */
const APP_CHORDS = [
  "Ctrl+W",
  "Ctrl+Shift+T",
  "Ctrl+Tab",
  "Ctrl+Shift+Tab",
  "Ctrl+PageUp",
  "Ctrl+PageDown",
  "Ctrl+S",
  "Ctrl+F",
  "Ctrl+Z",
  "Ctrl+Y",
  "Ctrl+Shift+Z",
  "Ctrl+P",
  "Ctrl+K",
  "Ctrl+R",
  "Ctrl+Shift+P",
  "Ctrl+Shift+F",
  "Ctrl+Shift+D",
  "Ctrl+Shift+I",
  "Ctrl+N",
  "Ctrl+O",
  "Ctrl+1",
  "Ctrl+2",
  "Ctrl+3",
  "Ctrl+,",
  "Ctrl+=",
  "Ctrl+-",
  "Ctrl+0",
  "Alt+ArrowLeft",
  "Alt+ArrowRight",
  ...Array.from({ length: 9 }, (_, at) => `Alt+${at + 1}`),
];

/** Returns a key press of `key` with the modifiers of `held`. */
function press(
  key: string,
  held: Partial<Record<"ctrl" | "meta" | "alt" | "shift", boolean>> = {},
) {
  return {
    key,
    ctrlKey: held.ctrl === true,
    metaKey: held.meta === true,
    altKey: held.alt === true,
    shiftKey: held.shift === true,
  };
}

describe("resolveCommand", () => {
  it("resolves a chord to the command that the surface binds to it", () => {
    expect(resolveCommand(press("d", { ctrl: true }), "voices")).toBe("duplicate");
    expect(resolveCommand(press("Delete"), "structure")).toBe("remove");
    expect(resolveCommand(press("ArrowUp", { alt: true }), "lines")).toBe("moveUp");
  });

  it("reads Meta as Ctrl and a letter in either case", () => {
    expect(resolveCommand(press("D", { meta: true }), "voices")).toBe("duplicate");
    expect(resolveCommand(press("c", { ctrl: true }), "media")).toBe("copy");
  });

  it("tells the space bar from Shift and the space bar", () => {
    expect(resolveCommand(press(" "), "structure")).toBe("play");
    expect(resolveCommand(press(" ", { shift: true }), "structure")).toBe("playAll");
  });

  it("resolves a symbol that the layout types with Shift", () => {
    expect(resolveCommand(press("?", { shift: true }), "document")).toBe("help");
    expect(resolveCommand(press("+", { shift: true }), "lines")).toBe("volumeUp");
  });

  it("returns null for a chord that an app-wide handler answers", () => {
    expect(resolveCommand(press("s", { ctrl: true }), "document")).toBeNull();
    expect(resolveCommand(press("f", { ctrl: true }), "document")).toBeNull();
  });

  it("returns null for a command that the surface does not bind", () => {
    expect(resolveCommand(press("d", { ctrl: true }), "media")).toBeNull();
    expect(resolveCommand(press("Delete", { ctrl: true }), "voices")).toBeNull();
    expect(resolveCommand(press("x", { ctrl: true }), "lines")).toBeNull();
  });
});

describe("AUDIO_KEYMAP", () => {
  it("binds each chord to one command of this module per surface", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const binding of AUDIO_KEYMAP.filter((each) => each.owner === "audio")) {
      for (const surface of binding.surfaces) {
        for (const key of binding.keys) {
          const slot = `${surface} ${key}`;
          const held = seen.get(slot);
          if (held !== undefined) clashes.push(`${slot}: ${held} and ${binding.id}`);
          seen.set(slot, binding.id);
        }
      }
    }

    expect(clashes).toEqual([]);
  });

  it("takes no chord that the app answers", () => {
    const taken = AUDIO_KEYMAP.filter((each) => each.owner === "audio").flatMap((each) =>
      each.keys.filter((key) => APP_CHORDS.includes(key)).map((key) => `${each.id} ${key}`),
    );

    expect(taken).toEqual([]);
  });
});

describe("sheetGroups", () => {
  it("lists the bindings of the surfaces in the order of the groups, without empty groups", () => {
    const groups = sheetGroups(["media"]);

    expect(groups.map((group) => group.group)).toEqual([
      "transport",
      "navigation",
      "editing",
      "pointer",
    ]);
    expect(groups[0]?.bindings.map((binding) => binding.id)).toEqual(["play", "stop"]);
  });

  it("leaves out a binding that no surface of the scope answers", () => {
    const ids = sheetGroups(["lines"]).flatMap((group) => group.bindings.map((each) => each.id));

    expect(ids).toContain("dragEvent");
    expect(ids).not.toContain("viewMedia");
    expect(ids).not.toContain("wrap");
  });
});

describe("shortcutOf", () => {
  it("returns the first chord of a command in the words that a keycap shows", () => {
    expect(shortcutOf("duplicate")).toBe("Ctrl+D");
    expect(shortcutOf("moveDown")).toBe("Alt+Down");
    expect(shortcutOf("playAll")).toBe("Shift+Space");
    expect(shortcutOf("movePage")).toBe("Page Up");
    expect(shortcutOf("redo")).toBe("Ctrl+Shift+Z");
  });

  it("returns null for a command without a key", () => {
    expect(shortcutOf("typeAhead")).toBeNull();
    expect(shortcutOf("dragReorder")).toBeNull();
  });
});
