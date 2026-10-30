import { describe, expect, it } from "vitest";

import type {
  AudioEvent,
  EventAction,
  EventNode,
  NodeProperty,
  ObjectProperties,
} from "@/lib/tauri";

import { inspectorSections, sharedFields } from "../inspector";
import type { NodeField } from "../nodeFields";
import { voiceRows } from "../voices";

function property(object: number, name: NodeProperty, value = 0): NodeField {
  return {
    name,
    value,
    editable: true,
    target: { kind: "property", object, property: name },
    detail: { kind: "none" },
  };
}

function sound(id: number): EventNode {
  return { kind: "sound", id, source: id * 10, stream: "dataBank", media: null };
}

function props(id: number, values: ObjectProperties["values"]): [number, ObjectProperties] {
  return [id, { id, editable: true, values, weights: { weighted: true, items: [] } }];
}

const EVENT: AudioEvent = {
  id: 100,
  name: null,
  actionCount: 1,
  mediaCount: 1,
  status: { kind: "resolved" },
  contexts: [],
  listed: null,
  nodes: [],
};

describe("sharedFields", () => {
  it("keeps the properties that every list holds, with the values of the first", () => {
    const source: NodeField = {
      name: "source",
      value: 10,
      editable: true,
      target: { kind: "source", sound: 1 },
      detail: { kind: "media", path: null },
    };
    const soundFields = [
      source,
      property(1, "volume", -3),
      property(1, "pitch"),
      property(1, "loopCount", 1),
    ];
    const containerFields = [property(7, "volume"), property(7, "pitch", 200), property(7, "lpf")];

    expect(sharedFields([soundFields, containerFields])).toEqual([
      property(1, "volume", -3),
      property(1, "pitch"),
    ]);
  });

  it("keeps every field of one list", () => {
    const fields = [property(1, "volume"), property(1, "loopCount", 1)];

    expect(sharedFields([fields])).toEqual(fields);
  });
});

describe("inspectorSections", () => {
  it("lists a header's container, then the wrappers above it and the facts of each", () => {
    const random: EventNode = {
      kind: "random",
      id: 7,
      children: [sound(1)],
      mode: "sequence",
      playlist: [{ child: 0, weight: 50000 }],
    };
    const mixer: EventNode = { kind: "mixer", id: 2, children: [random] };
    const play: EventAction = {
      id: 5,
      class: 0x0400,
      label: "Play",
      target: 2,
      node: mixer,
      delay: 0,
    };
    const properties = new Map([
      props(7, [{ property: "volume", value: -3 }]),
      props(2, [{ property: "pitch", value: null }]),
    ]);
    const rows = voiceRows(
      [EVENT],
      new Set(["e100"]),
      new Map([[100, { kind: "ready", tree: { event: 100, name: null, actions: [play] } }]]),
      { properties, editable: true },
    );
    const header = rows.find((row) => row.kind === "group");
    const sections = header === undefined ? [] : inspectorSections(header, properties);

    expect(
      sections.map((section) => [
        section.owner.kind === "node" ? section.owner.node.id : section.owner.action.id,
        section.fields.map((field) => field.name),
        section.facts,
      ]),
    ).toEqual([
      [
        7,
        ["volume"],
        [
          { kind: "playlist", mode: "sequence" },
          { kind: "pick", weighted: true },
        ],
      ],
      [2, ["pitch"], []],
    ]);
  });
});
