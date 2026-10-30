import { describe, expect, it } from "vitest";

import type { EventAction, EventNode, ObjectProperties } from "@/lib/tauri";

import { fieldEdit, knobRange, nodeFields, parseField } from "../nodeFields";

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

    expect(fields.map((field) => [field.name, field.tag, field.value, field.editable])).toEqual([
      ["target", "u32", 7, true],
      ["delay", "i32", 0.25, true],
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
