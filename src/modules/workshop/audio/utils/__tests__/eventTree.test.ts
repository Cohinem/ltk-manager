import { describe, expect, it } from "vitest";

import type { AudioEvent, EventNode, EventTree, MediaLocation } from "@/lib/tauri";

import { eventRows, eventSounds, filterEvents, pickSounds, sortEvents } from "../eventTree";

function media(source: number): MediaLocation {
  return {
    asset: { kind: "file", path: "C:/mods/ahri_skin07_sfx_audio.bnk" },
    path: "assets/sounds/ahri_skin07_sfx_audio.bnk",
    source,
    container: "bank",
  };
}

function sound(id: number, source: number, found = true): EventNode {
  return { kind: "sound", id, source, stream: "dataBank", media: found ? media(source) : null };
}

function event(id: number, name: string | null): AudioEvent {
  return { id, name, actionCount: 1, mediaCount: 2, status: { kind: "resolved" } };
}

const RANDOM: EventNode = { kind: "random", id: 7, children: [sound(1, 11), sound(2, 12)] };

const TREE: EventTree = {
  event: 100,
  name: "Play_sfx_Ahri_AhriQ_OnCast",
  actions: [
    { id: 5, class: 0x0400, label: "Play", target: 7, node: RANDOM },
    { id: 6, class: 0x0100, label: "Stop", target: 9, node: null },
  ],
};

describe("eventRows", () => {
  it("draws a loading row under an expanded event whose tree has not answered", () => {
    const rows = eventRows([event(100, null)], new Set(["e100"]), new Map());

    expect(rows.map((row) => row.kind)).toEqual(["event", "loading"]);
  });

  it("draws the actions of an expanded event and the children of an expanded action", () => {
    const rows = eventRows(
      [event(100, TREE.name), event(200, null)],
      new Set(["e100", "e100/0", "e100/0.0"]),
      new Map([[100, { kind: "ready", tree: TREE }]]),
    );

    expect(rows.map((row) => [row.kind, row.depth, row.parent])).toEqual([
      ["event", 0, null],
      ["action", 1, "e100"],
      ["node", 2, "e100/0"],
      ["node", 3, "e100/0.0"],
      ["node", 3, "e100/0.0"],
      ["action", 1, "e100"],
      ["event", 0, null],
    ]);
    expect(rows[5]?.expandable).toBe(false);
  });
});

describe("pickSounds", () => {
  it("plays the child of a random container that the random source picks", () => {
    expect(pickSounds(RANDOM, () => 0).map((pick) => pick.source)).toEqual([11]);
    expect(pickSounds(RANDOM, () => 0.99).map((pick) => pick.source)).toEqual([12]);
  });

  it("plays the first child of a switch container and every child of a layer", () => {
    const children = [sound(1, 11), sound(2, 12)];

    expect(pickSounds({ kind: "switch", id: 3, children }, () => 0.99)).toEqual([media(11)]);
    expect(pickSounds({ kind: "layer", id: 4, children }, () => 0)).toEqual([media(11), media(12)]);
  });

  it("plays nothing for a sound without media and a music object", () => {
    expect(pickSounds(sound(1, 11, false), () => 0)).toEqual([]);
    expect(
      pickSounds(
        { kind: "unsupported", id: 1, objectKind: 10, kindName: "MusicSegment", music: true },
        () => 0,
      ),
    ).toEqual([]);
  });
});

describe("eventSounds", () => {
  it("plays the picks of the Play actions and skips the other classes", () => {
    expect(eventSounds(TREE, () => 0.6).map((pick) => pick.source)).toEqual([12]);
  });
});

describe("filterEvents", () => {
  it("keeps the events whose name or decimal ID contains the filter", () => {
    const events = [event(3409556120, null), event(1, "Play_sfx_Ahri_AhriQ_OnCast")];

    expect(filterEvents(events, "ahriq").map((each) => each.id)).toEqual([1]);
    expect(filterEvents(events, "34095").map((each) => each.id)).toEqual([3409556120]);
  });
});

describe("sortEvents", () => {
  it("puts named events first by name and unnamed events after by ID", () => {
    const sorted = sortEvents([
      event(9, null),
      event(5, "Play_b"),
      event(2, null),
      event(7, "Play_a"),
    ]);

    expect(sorted.map((each) => each.id)).toEqual([7, 5, 2, 9]);
  });
});
