import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import {
  CLIPBOARD_FORMAT,
  COMPLEX_LIST,
  type CopiedEmitter,
  duplicateAllEdits,
  emitterCopiesText,
  EMITTERS_FORMAT,
  landingPropertyEdits,
  linkedSystems,
  readEmitterCopies,
  remappedMasks,
  removeAllEdits,
  SIMPLE_LIST,
} from "../emitterCopy";

const EMITTER = nameHash("VfxEmitterDefinitionData");
const NAME = nameHash("emitterName");
const STENCIL_REF = nameHash("stencilRef");

/** A property key of a copied struct: the field's hash in decimal. */
function key(field: string): string {
  return String(Number.parseInt(nameHash(field).slice(2), 16));
}

function link(hash: number) {
  return { kind: "ObjectLink", value: { value: hash } };
}

/** A copied emitter whose child set links each of `effects`. */
function emitterText(...effects: number[]): string {
  const children = effects.map((effect) => ({
    kind: "Struct",
    value: { class_hash: 1, properties: { [key("effect")]: link(effect) } },
  }));
  const set = { kind: "Container", value: { item_kind: "Struct", items: children } };
  const value = {
    kind: "Struct",
    value: {
      class_hash: 2,
      properties: {
        [key("childParticleSetDefinition")]: {
          kind: "Embedded",
          value: { class_hash: 3, properties: { [key("childrenIdentifiers")]: set } },
        },
      },
    },
  };
  return JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, classHash: EMITTER, value });
}

function emitter(list: string, text: string, mask: number | null = null): CopiedEmitter {
  return { list, text, mask };
}

describe("duplicateAllEdits", () => {
  const at = (list: string, index: number) => ({
    entry: "0x00000001",
    wire: `${list.slice(2)}[${index}]`,
    name: "Spark",
  });

  it("copies each emitter after itself from the last index down, one edit per list", () => {
    const emitters = [at(COMPLEX_LIST, 1), at(SIMPLE_LIST, 0), at(COMPLEX_LIST, 3)];

    expect(duplicateAllEdits("0x00000001", emitters, false)).toEqual([
      {
        entry: "0x00000001",
        holder: "",
        field: COMPLEX_LIST,
        edits: [
          { type: "copyItem", from: "[3]", path: "", index: 4, unique: NAME },
          { type: "copyItem", from: "[1]", path: "", index: 2, unique: NAME },
        ],
      },
      {
        entry: "0x00000001",
        holder: "",
        field: SIMPLE_LIST,
        edits: [{ type: "copyItem", from: "[0]", path: "", index: 1, unique: NAME }],
      },
    ]);
  });

  it("copies to the end of the list in index order if atEnd is set", () => {
    const edits = duplicateAllEdits("0x00000001", [at(COMPLEX_LIST, 3), at(COMPLEX_LIST, 1)], true);

    expect(edits[0]?.edits).toEqual([
      { type: "copyItem", from: "[1]", path: "", index: null, unique: NAME },
      { type: "copyItem", from: "[3]", path: "", index: null, unique: NAME },
    ]);
  });
});

describe("removeAllEdits", () => {
  it("removes the emitters of each list from the last index down", () => {
    const emitters = [0, 2].map((index) => ({
      entry: "0x00000001",
      wire: `${COMPLEX_LIST.slice(2)}[${index}]`,
      name: "Spark",
    }));

    expect(removeAllEdits("0x00000001", emitters)).toEqual([
      {
        entry: "0x00000001",
        holder: "",
        field: COMPLEX_LIST,
        edits: [
          { type: "removeItem", path: "[2]" },
          { type: "removeItem", path: "[0]" },
        ],
      },
    ]);
  });
});

describe("readEmitterCopies", () => {
  it("reads a copy of one emitter as one complex emitter", () => {
    const text = emitterText();

    expect(readEmitterCopies(text)).toEqual({
      system: null,
      emitters: [{ list: COMPLEX_LIST, text, mask: null }],
      systems: [],
    });
  });

  it("reads back the text that emitterCopiesText writes", () => {
    const copies = {
      system: "0x00000001",
      emitters: [emitter(SIMPLE_LIST, "a", 2), emitter(COMPLEX_LIST, "b")],
      systems: [{ entry: "0x00000002", name: "Child", text: "c" }],
    };

    expect(readEmitterCopies(emitterCopiesText(copies))).toEqual(copies);
  });

  it("returns null if an emitter names no emitter list", () => {
    const text = JSON.stringify({
      format: EMITTERS_FORMAT,
      version: 1,
      system: null,
      emitters: [emitter("0x00000003", "a")],
      systems: [],
    });

    expect(readEmitterCopies(text)).toBeNull();
    expect(readEmitterCopies("Spark")).toBeNull();
  });
});

describe("linkedSystems", () => {
  it("returns each effect link once and skips a null link", () => {
    expect(linkedSystems(emitterText(0x1a, 0, 0x1a, 0xff00))).toEqual(["0x0000001a", "0x0000ff00"]);
  });
});

describe("remappedMasks", () => {
  it("maps a numbered mask that the target uses to the lowest free reference", () => {
    const emitters = [emitter(COMPLEX_LIST, "a", 1), emitter(COMPLEX_LIST, "b", 2)];
    const taken = [
      { id: null, ref: 1 },
      { id: "0x00000009", ref: 0 },
    ];

    expect(remappedMasks(emitters, taken)).toEqual(new Map([[1, 3]]));
  });

  it("returns no mapping if no mask collides", () => {
    expect(remappedMasks([emitter(COMPLEX_LIST, "a", 4)], [{ id: null, ref: 1 }])).toEqual(
      new Map(),
    );
  });
});

describe("landingPropertyEdits", () => {
  it("lands each list's emitters in order from its start and writes mapped masks", () => {
    const emitters = [
      emitter(COMPLEX_LIST, "a", 1),
      emitter(SIMPLE_LIST, "b"),
      emitter(COMPLEX_LIST, "c"),
    ];
    const start = (list: string) => (list === COMPLEX_LIST ? 2 : 0);

    const edits = landingPropertyEdits("0x00000001", emitters, start, new Map([[1, 5]]));

    expect(edits).toEqual([
      {
        entry: "0x00000001",
        holder: "",
        field: COMPLEX_LIST,
        edits: [
          { type: "pasteItem", path: "", index: 2, text: "a", unique: NAME },
          { type: "ensureProperty", path: "[2]", field: STENCIL_REF },
          {
            type: "setLeaf",
            path: `[2].${STENCIL_REF.slice(2)}`,
            value: { type: "integer", text: "5" },
          },
          { type: "pasteItem", path: "", index: 3, text: "c", unique: NAME },
        ],
      },
      {
        entry: "0x00000001",
        holder: "",
        field: SIMPLE_LIST,
        edits: [{ type: "pasteItem", path: "", index: 0, text: "b", unique: NAME }],
      },
    ]);
  });
});
