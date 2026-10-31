import { describe, expect, it } from "vitest";

import { mapKeyCommand, type MapKeyEvent } from "../mapKeys";

function press(key: string, over: Partial<MapKeyEvent> = {}): MapKeyEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, ...over };
}

describe("mapKeyCommand", () => {
  it("returns the command of a plain key in either case", () => {
    expect(mapKeyCommand(press("q"))).toBe("select");
    expect(mapKeyCommand(press("Q"))).toBe("select");
    expect(mapKeyCommand(press("F2"))).toBe("rename");
  });

  it("reads the shown names of Delete and Escape", () => {
    expect(mapKeyCommand(press("Delete"))).toBe("delete");
    expect(mapKeyCommand(press("Escape"))).toBe("selectNone");
  });

  it("tells a plain key from the same key with a modifier", () => {
    expect(mapKeyCommand(press("h"))).toBe("hide");
    expect(mapKeyCommand(press("h", { altKey: true }))).toBe("showAll");
    expect(mapKeyCommand(press("h", { ctrlKey: true }))).toBeNull();
  });

  it("reads Meta as Ctrl", () => {
    expect(mapKeyCommand(press("d", { ctrlKey: true }))).toBe("duplicate");
    expect(mapKeyCommand(press("d", { metaKey: true }))).toBe("duplicate");
    expect(mapKeyCommand(press("d"))).toBeNull();
  });

  it("returns null if no binding matches", () => {
    expect(mapKeyCommand(press("b"))).toBeNull();
    expect(mapKeyCommand(press("s", { ctrlKey: true }))).toBeNull();
  });
});
