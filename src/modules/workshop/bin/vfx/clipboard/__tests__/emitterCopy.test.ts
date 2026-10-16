import { describe, expect, it, vi } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import {
  CLIPBOARD_FORMAT,
  COMPLEX_LIST,
  duplicateEdits,
  type EmitterRef,
  emitterPlace,
  isEmitterCopy,
  pasteEdits,
  removeEdits,
} from "../emitterCopy";
import { type EmitterClipboard, runEmitterKey } from "../emitterKeys";

const EMITTER = nameHash("VfxEmitterDefinitionData");
const NAME = nameHash("emitterName");

function copied(classHash: string, format = CLIPBOARD_FORMAT): string {
  return JSON.stringify({ format, version: 1, classHash, value: { kind: "Struct" } }, null, 2);
}

describe("emitter clipboard text", () => {
  it("takes a copy of an emitter", () => {
    expect(isEmitterCopy(copied(EMITTER))).toBe(true);
  });

  it("refuses text that is no emitter copy", () => {
    expect(isEmitterCopy("")).toBe(false);
    expect(isEmitterCopy("Spark")).toBe(false);
    expect(isEmitterCopy("null")).toBe(false);
    expect(isEmitterCopy("[1]")).toBe(false);
    expect(isEmitterCopy(copied(nameHash("ValueColor")))).toBe(false);
    expect(isEmitterCopy(copied(EMITTER, "ritobin"))).toBe(false);
  });
});

describe("emitter edits", () => {
  it("reads the list and the index out of an item wire path", () => {
    expect(emitterPlace(`${COMPLEX_LIST.slice(2)}[3]`)).toEqual({ list: COMPLEX_LIST, index: 3 });
    expect(emitterPlace(`${COMPLEX_LIST.slice(2)}[3].0a1b2c3d`)).toBeNull();
    expect(emitterPlace("")).toBeNull();
  });

  it("copies an emitter to the place asked under a unique name, or to the end", () => {
    expect(duplicateEdits(2, 3)).toEqual([
      { type: "copyItem", from: "[2]", path: "", index: 3, unique: NAME },
    ]);
    expect(duplicateEdits(2, null)[0]).toMatchObject({ index: null });
  });

  it("lands a paste where asked, or at the end", () => {
    expect(pasteEdits("text", 1)).toEqual([
      { type: "pasteItem", path: "", index: 1, text: "text", unique: NAME },
    ]);
    expect(pasteEdits("text", null)[0]).toMatchObject({ index: null });
  });

  it("removes the emitter at its index", () => {
    expect(removeEdits(4)).toEqual([{ type: "removeItem", path: "[4]" }]);
  });
});

describe("emitter keys", () => {
  const picked: EmitterRef = { entry: "0x00000001", wire: "0a1b2c3d[0]", name: "Spark" };
  const chord = (key: string, ctrlKey = true) => ({
    key,
    ctrlKey,
    metaKey: false,
    shiftKey: false,
    altKey: false,
  });
  const clipboard = (): EmitterClipboard => ({
    copy: vi.fn(() => Promise.resolve()),
    duplicate: vi.fn(() => Promise.resolve()),
    paste: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    land: vi.fn(() => Promise.resolve(true)),
  });

  it("duplicates and copies the selected emitters and pastes after the picked one", () => {
    const actions = clipboard();

    expect(runEmitterKey(chord("d"), actions, picked.entry, picked, [picked])).toBe(true);
    expect(runEmitterKey(chord("C"), actions, picked.entry, picked, [picked])).toBe(true);
    expect(runEmitterKey(chord("v"), actions, picked.entry, picked, [picked])).toBe(true);

    expect(actions.duplicate).toHaveBeenCalledWith([picked]);
    expect(actions.copy).toHaveBeenCalledWith([picked]);
    expect(actions.paste).toHaveBeenCalledWith(picked.entry, picked);
  });

  it("copies every selected emitter", () => {
    const actions = clipboard();
    const other: EmitterRef = { ...picked, wire: "0a1b2c3d[1]", name: "Glow" };

    expect(runEmitterKey(chord("c"), actions, picked.entry, null, [picked, other])).toBe(true);

    expect(actions.copy).toHaveBeenCalledWith([picked, other]);
  });

  it("pastes with no selection and leaves the other chords alone", () => {
    const actions = clipboard();

    expect(runEmitterKey(chord("d"), actions, picked.entry, null, [])).toBe(false);
    expect(runEmitterKey(chord("c"), actions, picked.entry, null, [])).toBe(false);
    expect(runEmitterKey(chord("v", false), actions, picked.entry, null, [])).toBe(false);
    expect(runEmitterKey(chord("v"), actions, picked.entry, null, [])).toBe(true);

    expect(actions.paste).toHaveBeenCalledWith(picked.entry, null);
    expect(actions.duplicate).not.toHaveBeenCalled();
  });

  it("deletes the selected emitters on a bare Delete, and nothing with none selected", () => {
    const actions = clipboard();

    expect(runEmitterKey(chord("Delete", false), actions, picked.entry, null, [])).toBe(false);
    expect(runEmitterKey(chord("Delete"), actions, picked.entry, picked, [picked])).toBe(false);
    expect(runEmitterKey(chord("Delete", false), actions, picked.entry, picked, [picked])).toBe(
      true,
    );

    expect(actions.remove).toHaveBeenCalledExactlyOnceWith([picked]);
  });

  it("offers copy alone on a document that takes no edit", () => {
    const actions = { ...clipboard(), duplicate: null, paste: null, remove: null };

    expect(runEmitterKey(chord("d"), actions, picked.entry, picked, [picked])).toBe(false);
    expect(runEmitterKey(chord("v"), actions, picked.entry, picked, [picked])).toBe(false);
    expect(runEmitterKey(chord("c"), actions, picked.entry, picked, [picked])).toBe(true);
  });
});
