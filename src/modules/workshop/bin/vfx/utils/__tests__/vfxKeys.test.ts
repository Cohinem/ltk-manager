import { describe, expect, it } from "vitest";

import { hotkeyOf, keyEventOf, pressedKey, VFX_KEYS, type VfxKey, vfxShortcut } from "../vfxKeys";

const NAMES = Object.keys(VFX_KEYS) as VfxKey[];

describe("hotkeyOf", () => {
  it("spells each key as react-hotkeys-hook reads it", () => {
    expect(hotkeyOf(VFX_KEYS.play)).toBe("space");
    expect(hotkeyOf(VFX_KEYS.jumpBack)).toBe("shift+left");
    expect(hotkeyOf(VFX_KEYS.slower)).toBe("bracketleft");
    expect(hotkeyOf(VFX_KEYS.faster)).toBe("bracketright");
    expect(hotkeyOf(VFX_KEYS.markerAdd)).toBe("ctrl+m");
  });
});

describe("vfxShortcut", () => {
  it("shows the words of a keycap", () => {
    expect(vfxShortcut("stepBack")).toBe("Left");
    expect(vfxShortcut("jumpForward")).toBe("Shift+Right");
    expect(vfxShortcut("systemNext")).toBe("Alt+Down");
    expect(vfxShortcut("remove")).toBe("Del");
    expect(vfxShortcut("selectNone")).toBe("Esc");
  });
});

describe("pressedKey", () => {
  const bare = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

  it("reads a chord in either letter case, and Meta as Ctrl", () => {
    expect(pressedKey({ ...bare, key: "d", ctrlKey: true }, "duplicate")).toBe(true);
    expect(pressedKey({ ...bare, key: "D", metaKey: true }, "duplicate")).toBe(true);
  });

  it("refuses a chord with one more modifier", () => {
    expect(pressedKey({ ...bare, key: "d", ctrlKey: true, shiftKey: true }, "duplicate")).toBe(
      false,
    );
    expect(pressedKey({ ...bare, key: "Delete", ctrlKey: true }, "remove")).toBe(false);
  });
});

describe("keyEventOf", () => {
  it("returns a press that reads back as the same key, for every key", () => {
    for (const name of NAMES) {
      const event = keyEventOf(name);
      const press = {
        key: event.key ?? "",
        ctrlKey: event.ctrlKey === true,
        metaKey: false,
        altKey: event.altKey === true,
        shiftKey: event.shiftKey === true,
      };

      expect(pressedKey(press, name), name).toBe(true);
    }
  });
});
