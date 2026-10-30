import { describe, expect, it } from "vitest";

import type { EventAction, EventNode, NodeProperty, ObjectProperties } from "@/lib/tauri";

import {
  fieldDisplay,
  fieldEdit,
  fieldEntryText,
  knobRange,
  type NodeField,
  nodeFields,
  parseField,
  resetEdit,
} from "../nodeFields";

const SOUND: EventNode = { kind: "sound", id: 1, source: 11, stream: "dataBank", media: null };

const RANDOM: EventNode = {
  kind: "random",
  id: 7,
  children: [SOUND],
  mode: "random",
  playlist: [{ child: 0, weight: 50000 }],
};

const PLAY: EventAction = {
  id: 5,
  class: 0x0403,
  label: "Play",
  target: 7,
  node: RANDOM,
  delay: 250,
};

const STOP: EventAction = {
  id: 6,
  class: 0x0102,
  label: "Stop",
  target: 9,
  node: null,
  delay: 1500,
};

function properties(entries: readonly ObjectProperties[]): Map<number, ObjectProperties> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

const PROPERTIES = properties([
  { id: 5, editable: true, values: [{ property: "delay", value: 0.25 }], weights: null },
  {
    id: 1,
    editable: true,
    values: [
      { property: "volume", value: -3 },
      { property: "loopCount", value: null },
    ],
    weights: null,
  },
  {
    id: 7,
    editable: true,
    values: [{ property: "pitch", value: 120 }],
    weights: { weighted: false, items: [{ child: 1, weight: 50000 }] },
  },
]);

describe("nodeFields", () => {
  it("lists the target and the delay of a Play action", () => {
    const fields = nodeFields({ kind: "action", action: PLAY }, PROPERTIES, null);

    expect(fields.map((field) => [field.name, field.value, field.editable])).toEqual([
      ["target", 7, true],
      ["delay", 0.25, true],
    ]);
  });

  it("lists the source, the properties and the playlist weight of a sound", () => {
    const fields = nodeFields({ kind: "node", node: SOUND }, PROPERTIES, RANDOM);

    expect(fields.map((field) => [field.name, field.value])).toEqual([
      ["source", 11],
      ["volume", -3],
      ["loopCount", 1],
      ["weight", 50],
    ]);
  });

  it("lists the target and the delay of another action as read-only", () => {
    const fields = nodeFields({ kind: "action", action: STOP }, PROPERTIES, null);

    expect(fields.map((field) => [field.name, field.value, field.editable])).toEqual([
      ["target", 9, false],
      ["delay", 1.5, false],
    ]);
  });

  it("lists the source of a sound whose properties were not read as read-only", () => {
    const fields = nodeFields({ kind: "node", node: SOUND }, new Map(), null);

    expect(fields.map((field) => [field.name, field.editable])).toEqual([["source", false]]);
  });
});

describe("fieldEdit", () => {
  const [target, delay] = nodeFields({ kind: "action", action: PLAY }, PROPERTIES, null);
  const weight = nodeFields({ kind: "node", node: SOUND }, PROPERTIES, RANDOM).at(-1);

  it("points a Play action at the typed target", () => {
    expect(target && fieldEdit(target, 42)).toEqual({ kind: "target", action: 5, target: 42 });
  });

  it("sets a property of the object", () => {
    expect(delay && fieldEdit(delay, 0.5)).toEqual({
      kind: "property",
      object: 5,
      property: "delay",
      value: 0.5,
    });
  });

  it("stores a weight as a thousand times the Wwise weight", () => {
    expect(weight && fieldEdit(weight, 12.5)).toEqual({
      kind: "weight",
      container: 7,
      child: 1,
      weight: 12500,
    });
  });
});

describe("parseField", () => {
  const [source, volume, loopCount, weight] = nodeFields(
    { kind: "node", node: SOUND },
    PROPERTIES,
    RANDOM,
  );

  it("reads an ID with or without a leading #", () => {
    expect(source && parseField(source, "#4047148852")).toBe(4047148852);
  });

  it("reads an empty property as its default", () => {
    expect(loopCount && parseField(loopCount, "")).toBe(1);
    expect(volume && parseField(volume, " ")).toBe(0);
  });

  it("returns null for a negative weight and a text that is not a number", () => {
    expect(weight && parseField(weight, "-1")).toBeNull();
    expect(volume && parseField(volume, "loud")).toBeNull();
  });
});

/** Returns the field `name` of the sound in the random container. */
function soundField(name: string) {
  const field = nodeFields({ kind: "node", node: SOUND }, PROPERTIES, RANDOM).find(
    (each) => each.name === name,
  );
  if (field === undefined) throw new Error(`No field ${name}`);
  return field;
}

/** Returns the field `name` of `values` on the sound. */
function propertyOf(name: NodeProperty, value: number) {
  const [, field] = nodeFields(
    { kind: "node", node: SOUND },
    properties([{ id: 1, editable: true, values: [{ property: name, value }], weights: null }]),
    null,
  );
  if (field === undefined) throw new Error(`No field ${name}`);
  return field;
}

describe("fieldDisplay", () => {
  it("shows a gain signed with one decimal, in dB", () => {
    expect(fieldDisplay(propertyOf("volume", -3))).toEqual({
      kind: "quantity",
      number: "-3.0",
      unit: "dB",
    });
    expect(fieldDisplay(propertyOf("makeUpGain", 4.25))).toEqual({
      kind: "quantity",
      number: "+4.3",
      unit: "dB",
    });
  });

  it("shows a pitch signed in whole cents", () => {
    expect(fieldDisplay(propertyOf("pitch", 120))).toEqual({
      kind: "quantity",
      number: "+120",
      unit: "cents",
    });
    expect(fieldDisplay(propertyOf("pitch", 0))).toEqual({
      kind: "quantity",
      number: "0",
      unit: "cents",
    });
  });

  it("shows a filter as a percentage and a delay in seconds", () => {
    expect(fieldDisplay(propertyOf("lpf", 40))).toEqual({
      kind: "quantity",
      number: "40",
      unit: "%",
    });
    expect(fieldDisplay(propertyOf("delay", 0.25))).toEqual({
      kind: "quantity",
      number: "0.25",
      unit: "s",
    });
  });

  it("shows a loop count as its plays, where 0 loops forever", () => {
    expect(fieldDisplay(propertyOf("loopCount", 0))).toEqual({ kind: "loop", plays: 0 });
  });

  it("resolves a Play target to the node it plays", () => {
    const [target] = nodeFields({ kind: "action", action: PLAY }, PROPERTIES, null);

    expect(target && fieldDisplay(target)).toEqual({ kind: "object", id: 7, node: RANDOM });
  });

  it("resolves a source to the file name of its media", () => {
    const sound: EventNode = {
      ...SOUND,
      media: {
        asset: { kind: "file", path: "x" },
        path: "assets/sounds/wwise2016/sfx/champions/ahri_base_sfx_audio.wpk",
        source: 11,
        container: "package",
      },
    } as EventNode;
    const [source] = nodeFields({ kind: "node", node: sound }, PROPERTIES, null);

    expect(source && fieldDisplay(source)).toEqual({
      kind: "media",
      id: 11,
      name: "ahri_base_sfx_audio.wpk",
    });
  });

  it("shows a weight's share of a weighted random container", () => {
    const twoChildren = properties([
      {
        id: 7,
        editable: true,
        values: [],
        weights: {
          weighted: true,
          items: [
            { child: 1, weight: 30_000 },
            { child: 2, weight: 90_000 },
          ],
        },
      },
    ]);
    const weight = nodeFields({ kind: "node", node: SOUND }, twoChildren, RANDOM).at(-1);

    expect(weight && fieldDisplay(weight)).toEqual({ kind: "weight", number: "30", share: 0.25 });
  });

  it("shows no share if the container picks without weights", () => {
    expect(fieldDisplay(soundField("weight"))).toEqual({
      kind: "weight",
      number: "50",
      share: null,
    });
  });
});

describe("fieldEntryText", () => {
  it("opens with the exact value, without the rounding of the row", () => {
    expect(fieldEntryText(propertyOf("volume", -3.25))).toBe("-3.25");
    expect(fieldEntryText(soundField("source"))).toBe("11");
  });
});

describe("parseField units", () => {
  it("reads a unit typed after the number", () => {
    expect(parseField(propertyOf("volume", 0), "-6 dB")).toBe(-6);
    expect(parseField(propertyOf("pitch", 0), "+120 cents")).toBe(120);
    expect(parseField(propertyOf("lpf", 0), "35%")).toBe(35);
    expect(parseField(propertyOf("delay", 0), "0.5s")).toBe(0.5);
  });

  it("reads a delay typed in milliseconds as seconds", () => {
    expect(parseField(propertyOf("delay", 0), "250 ms")).toBe(0.25);
  });

  it("returns null for the unit of another field", () => {
    expect(parseField(propertyOf("volume", 0), "120 cents")).toBeNull();
  });
});

describe("knobRange", () => {
  it("bounds the filters from 0 to 100 and leaves the delay without a knob", () => {
    const fields = nodeFields(
      { kind: "node", node: SOUND },
      properties([
        {
          id: 1,
          editable: true,
          values: [
            { property: "lpf", value: 20 },
            { property: "delay", value: 0 },
          ],
          weights: null,
        },
      ]),
      null,
    );

    expect(fields.map((field) => knobRange(field.name)?.max ?? null)).toEqual([null, 100, null]);
  });
});

describe("resetEdit", () => {
  const field = (name: NodeField["name"], target: NodeField["target"]): NodeField => ({
    name,
    owner: "node",
    value: 7,
    editable: true,
    target,
    detail: { kind: "none" },
  });

  it("returns the edit that sets a property to its default", () => {
    expect(resetEdit(field("pitch", { kind: "property", object: 1, property: "pitch" }))).toEqual({
      kind: "property",
      object: 1,
      property: "pitch",
      value: 0,
    });
    expect(
      resetEdit(field("loopCount", { kind: "property", object: 1, property: "loopCount" })),
    ).toEqual({ kind: "property", object: 1, property: "loopCount", value: 1 });
  });

  it("returns the edit that sets a weight to 50", () => {
    expect(resetEdit(field("weight", { kind: "weight", container: 7, child: 1 }))).toEqual({
      kind: "weight",
      container: 7,
      child: 1,
      weight: 50000,
    });
  });

  it("returns null for a reference and for a field that takes no edit", () => {
    expect(resetEdit(field("source", { kind: "source", sound: 1 }))).toBeNull();
    expect(
      resetEdit({
        ...field("pitch", { kind: "property", object: 1, property: "pitch" }),
        editable: false,
      }),
    ).toBeNull();
  });
});
