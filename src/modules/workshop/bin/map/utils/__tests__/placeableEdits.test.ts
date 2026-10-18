import { describe, expect, it } from "vitest";

import type { MapChunk, MapChunkItem } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import {
  duplicateEdits,
  freeName,
  moveEdits,
  moveToChunkEdits,
  placeEdits,
  removeEdits,
  renameEdits,
  takenNames,
} from "../placeableEdits";

const ITEMS = nameHash("items");
const TRANSFORM = nameHash("transform");
const NAME = nameHash("name");
const IDENTITY: MapChunkItem["transform"] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function item(name: string, key = nameHash(name)): MapChunkItem {
  return {
    key,
    name,
    class: "MapParticle",
    kind: "particle",
    position: [0, 0, 0],
    transform: IDENTITY,
    shape: null,
    visibility: 255,
    controller: null,
  };
}

function chunk(entry: string, names: string[]): MapChunk {
  return { entry, name: null, items: names.map((name) => item(name)) };
}

describe("moveEdits", () => {
  it("sets the transform of each placeable under its item", () => {
    expect(moveEdits([{ chunk: "0x00000001", key: "0x0000abcd", transform: IDENTITY }])).toEqual([
      {
        entry: "0x00000001",
        holder: `${ITEMS.slice(2)}{0000abcd}`,
        field: TRANSFORM,
        edits: [{ type: "setLeaf", path: "", value: { type: "matrix", values: IDENTITY } }],
      },
    ]);
  });
});

describe("removeEdits", () => {
  it("groups removals by chunk", () => {
    const edits = removeEdits([
      { chunk: "0x00000001", key: "0x0000000a" },
      { chunk: "0x00000002", key: "0x0000000b" },
      { chunk: "0x00000001", key: "0x0000000c" },
    ]);

    expect(edits).toEqual([
      {
        entry: "0x00000001",
        holder: "",
        field: ITEMS,
        edits: [
          { type: "removeItem", path: "{0000000a}" },
          { type: "removeItem", path: "{0000000c}" },
        ],
      },
      {
        entry: "0x00000002",
        holder: "",
        field: ITEMS,
        edits: [{ type: "removeItem", path: "{0000000b}" }],
      },
    ]);
  });

  it("splits a chunk's removals past the staged edit bound", () => {
    const refs = Array.from({ length: 65 }, (_, at) => ({
      chunk: "0x00000001",
      key: `0x${at.toString(16).padStart(8, "0")}`,
    }));

    expect(removeEdits(refs).map((edit) => edit.edits.length)).toEqual([64, 1]);
  });
});

describe("freeName", () => {
  it("counts on past the number the base ends in", () => {
    const taken = takenNames([chunk("0x00000001", ["Torch1", "Torch2"])]);

    expect(freeName("Torch1", taken)).toBe("Torch3");
    expect(freeName("Torch1", taken)).toBe("Torch4");
  });

  it("skips a name whose hash another chunk holds as a key", () => {
    const taken = takenNames([
      { entry: "0x00000001", name: null, items: [item("Shipped", nameHash("Lamp1"))] },
    ]);

    expect(freeName("Lamp", taken)).toBe("Lamp2");
  });
});

describe("duplicateEdits", () => {
  it("copies each placeable under the hash of a free name and sets the name", () => {
    const taken = takenNames([chunk("0x00000001", ["Torch1"])]);

    const { edits, added } = duplicateEdits(
      [{ chunk: "0x00000001", key: nameHash("Torch1"), name: "Torch1" }],
      taken,
    );

    const key = nameHash("Torch2");
    expect(added).toEqual([{ id: `0x00000001/${key}`, name: "Torch2", key }]);
    expect(edits).toEqual([
      {
        entry: "0x00000001",
        holder: "",
        field: ITEMS,
        edits: [
          {
            type: "copyItem",
            from: `{${nameHash("Torch1").slice(2)}}`,
            path: "",
            index: null,
            unique: null,
            key,
          },
          {
            type: "setLeaf",
            path: `{${key.slice(2)}}.${NAME.slice(2)}`,
            value: { type: "string", value: "Torch2" },
          },
        ],
      },
    ]);
  });
});

describe("placeEdits", () => {
  it("inserts the class under the hash of its name with its name and transform", () => {
    const at = `{${nameHash("Light1").slice(2)}}`;

    expect(placeEdits("0x00000001", "MapDynamicPointLight", "Light1", IDENTITY)[0]?.edits).toEqual([
      {
        type: "insertItem",
        path: "",
        item: { index: null, key: nameHash("Light1"), class: "MapDynamicPointLight" },
      },
      { type: "ensureProperty", path: at, field: NAME },
      {
        type: "setLeaf",
        path: `${at}.${NAME.slice(2)}`,
        value: { type: "string", value: "Light1" },
      },
      { type: "ensureProperty", path: at, field: TRANSFORM },
      {
        type: "setLeaf",
        path: `${at}.${TRANSFORM.slice(2)}`,
        value: { type: "matrix", values: IDENTITY },
      },
    ]);
  });
});

describe("moveToChunkEdits", () => {
  it("pastes under the same key into the target and removes from the source", () => {
    const edits = moveToChunkEdits(
      [
        { chunk: "0x00000001", key: "0x0000000a", text: "a" },
        { chunk: "0x00000002", key: "0x0000000b", text: "b" },
      ],
      "0x00000002",
    );

    expect(edits).toEqual([
      {
        entry: "0x00000002",
        holder: "",
        field: ITEMS,
        edits: [
          {
            type: "pasteItem",
            path: "",
            index: null,
            text: "a",
            unique: null,
            key: "0x0000000a",
          },
        ],
      },
      {
        entry: "0x00000001",
        holder: "",
        field: ITEMS,
        edits: [{ type: "removeItem", path: "{0000000a}" }],
      },
    ]);
  });
});

describe("renameEdits", () => {
  it("sets the name and every reference to it", () => {
    const edits = renameEdits({ chunk: "0x00000001", key: "0x0000000a" }, "Dragon", [
      { entry: "0x00000002", holder: "3a79338f{00000001}.actions[0]", field: "0x12345678" },
    ]);

    expect(edits.map((edit) => [edit.entry, edit.holder, edit.field])).toEqual([
      ["0x00000001", `${ITEMS.slice(2)}{0000000a}`, NAME],
      ["0x00000002", "3a79338f{00000001}.actions[0]", "0x12345678"],
    ]);
    expect(edits.every((edit) => edit.edits[0]?.type === "setLeaf")).toBe(true);
  });
});
