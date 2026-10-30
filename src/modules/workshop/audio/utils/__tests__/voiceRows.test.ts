import { describe, expect, it } from "vitest";

import type {
  AudioEvent,
  EventAction,
  EventNode,
  EventTree,
  MediaLocation,
  ObjectProperties,
} from "@/lib/tauri";

import {
  chainLine,
  inlineVoice,
  movedCell,
  replayOf,
  voiceChains,
  voiceColumns,
  voiceFields,
  type VoiceRow,
  voiceRows,
} from "../voices";

function media(source: number): MediaLocation {
  return {
    asset: { kind: "file", path: "C:/mods/ahri_skin07_sfx_audio.bnk" },
    path: "assets/sounds/ahri_skin07_sfx_audio.bnk",
    source,
    container: "bank",
  };
}

function sound(id: number, found = true): EventNode {
  return {
    kind: "sound",
    id,
    source: id * 10,
    stream: "dataBank",
    media: found ? media(id * 10) : null,
  };
}

function random(id: number, children: EventNode[]): EventNode {
  return {
    kind: "random",
    id,
    children,
    mode: "random",
    playlist: children.map((_, child) => ({ child, weight: 50000 })),
  };
}

function play(node: EventNode | null, delay = 0): EventAction {
  return { id: 5, class: 0x0400, label: "Play", target: node?.id ?? null, node, delay };
}

const STOP: EventAction = { id: 6, class: 0x0100, label: "Stop", target: 9, node: null, delay: 0 };

function tree(...actions: EventAction[]): EventTree {
  return { event: 100, name: "Play_sfx_Ahri_AhriQ_OnCast", actions };
}

function props(
  id: number,
  values: ObjectProperties["values"],
  weights: ObjectProperties["weights"] = null,
): [number, ObjectProperties] {
  return [id, { id, editable: true, values, weights }];
}

const WEIGHTED = props(7, [], {
  weighted: true,
  items: [
    { child: 1, weight: 30000 },
    { child: 2, weight: 10000 },
  ],
});

function audioEvent(id: number, mediaCount = 2): AudioEvent {
  return {
    id,
    name: null,
    actionCount: 1,
    mediaCount,
    status: { kind: "resolved" },
    contexts: [],
    listed: null,
  };
}

function ready(...actions: EventAction[]) {
  return new Map([[100, { kind: "ready" as const, tree: tree(...actions) }]]);
}

function shape(rows: readonly VoiceRow[]) {
  return rows.map((row) => [row.key, row.kind, row.depth, row.parent]);
}

const SWITCH: EventNode = {
  kind: "switch",
  id: 3,
  children: [sound(1), sound(2)],
  group: 11,
  defaultSwitch: 12,
  pick: { kind: "firstChild" },
};

describe("chainLine", () => {
  it("names the Play with its delay, each container of the run, and the voice count", () => {
    const [chain] = voiceChains(tree(play(random(7, [sound(1), sound(2)]), 250)), "e100");
    const line = chain === undefined ? [] : chainLine(chain, new Map([WEIGHTED]));

    expect(line).toEqual([
      { kind: "play", action: chain?.action, delay: 250 },
      { kind: "container", container: chain?.run[0], weighted: true },
      { kind: "count", count: 2 },
    ]);
  });

  it("counts the voices of other switch branches", () => {
    const [chain] = voiceChains(tree(play(SWITCH)), "e100");
    const line = chain === undefined ? [] : chainLine(chain, new Map());

    expect(line.map((segment) => segment.kind)).toEqual(["play", "container", "count"]);
    expect(line.at(-1)).toEqual({ kind: "count", count: 2 });
  });

  it("marks a random pick that reads no weights", () => {
    const [chain] = voiceChains(tree(play(random(7, [sound(1)]))), "e100");
    const line = chain === undefined ? [] : chainLine(chain, new Map([props(7, [])]));

    expect(line[1]).toEqual({ kind: "container", container: chain?.run[0], weighted: false });
  });
});

describe("inlineVoice", () => {
  it("returns the voice of an event that plays one sound without a container", () => {
    const inline = inlineVoice(voiceChains(tree(play(sound(1)), STOP), "e100"));

    expect(inline?.voice.node.id).toBe(1);
  });

  it("returns null for one sound in a container", () => {
    expect(inlineVoice(voiceChains(tree(play(random(7, [sound(1)]))), "e100"))).toBeNull();
  });

  it("returns null for two Play actions of one sound each", () => {
    const chains = voiceChains(tree(play(sound(1)), play(sound(2))), "e100");

    expect(inlineVoice(chains)).toBeNull();
  });
});

describe("voiceFields", () => {
  const [chain] = voiceChains(tree(play(random(7, [sound(1), sound(2)]))), "e100");
  const voice = chain?.voices[0];

  it("shows the volume and the pitch, and the weight when the pick reads weights", () => {
    const properties = new Map([
      WEIGHTED,
      props(1, [
        { property: "volume", value: -3 },
        { property: "pitch", value: null },
        { property: "lpf", value: null },
        { property: "delay", value: 0 },
      ]),
    ]);
    const fields = voice === undefined ? null : voiceFields(voice, properties);

    expect(Object.keys(fields?.cells ?? {})).toEqual(["volume", "pitch", "weight"]);
    expect(fields?.cells.weight?.detail).toEqual({ kind: "weight", share: 0.75 });
  });

  it("shows the delay and the filters only when they are not 0", () => {
    const properties = new Map([
      props(1, [
        { property: "volume", value: null },
        { property: "pitch", value: null },
        { property: "lpf", value: 30 },
        { property: "hpf", value: 0 },
        { property: "delay", value: 0.25 },
      ]),
    ]);
    const fields = voice === undefined ? null : voiceFields(voice, properties);

    expect(Object.keys(fields?.cells ?? {})).toEqual(["volume", "pitch", "delay", "lpf"]);
  });

  it("gives a missing object no source and no cells", () => {
    const missing = { key: "e100/0.0", node: { kind: "missing" as const, id: 6 }, path: [] };

    expect(voiceFields(missing, new Map())).toEqual({ source: null, cells: {} });
  });
});

describe("voiceColumns", () => {
  it("takes every cell that a voice of the list shows, in the row's order", () => {
    const [chain] = voiceChains(tree(play(random(7, [sound(1), sound(2)]))), "e100");
    const properties = new Map([
      props(1, [{ property: "hpf", value: 20 }]),
      props(2, [
        { property: "volume", value: -6 },
        { property: "delay", value: 0.1 },
      ]),
    ]);
    const fields = (chain?.voices ?? []).map((voice) => voiceFields(voice, properties));

    expect(voiceColumns(fields)).toEqual(["media", "volume", "delay", "hpf"]);
  });
});

describe("movedCell", () => {
  it("moves right up to the last cell and left down to the first", () => {
    expect(movedCell("ArrowRight", 1, 3)).toBe(2);
    expect(movedCell("ArrowRight", 2, 3)).toBe(2);
    expect(movedCell("ArrowLeft", 2, 3)).toBe(1);
  });

  it("returns null for ArrowLeft on the first cell, which leaves the row", () => {
    expect(movedCell("ArrowLeft", 0, 3)).toBeNull();
  });
});

describe("voiceRows", () => {
  const RANDOM = random(7, [sound(1), sound(2)]);

  it("draws the chain line, the voices and the add row under an expanded event", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100"]), ready(play(RANDOM)), {
      properties: new Map([WEIGHTED]),
      editable: true,
    });

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100/0", "chain", 1, "e100"],
      ["e100/0.0.0", "voice", 2, "e100/0"],
      ["e100/0.0.1", "voice", 2, "e100/0"],
      ["e100/0:add", "add", 2, "e100/0"],
    ]);
  });

  it("draws no add row while the bank takes no edit", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100"]), ready(play(RANDOM)), {
      properties: new Map([WEIGHTED]),
      editable: false,
    });

    expect(rows.map((row) => row.kind)).not.toContain("add");
  });

  it("draws the fields of a pressed container between the chain line and the voices", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100", "e100/0#7"]), ready(play(RANDOM)), {
      properties: new Map([props(7, [{ property: "volume", value: -3 }])]),
      editable: false,
    });

    expect(shape(rows).slice(1, 4)).toEqual([
      ["e100/0", "chain", 1, "e100"],
      ["e100/0#7:volume", "field", 2, "e100/0"],
      ["e100/0.0.0", "voice", 2, "e100/0"],
    ]);
  });

  it("folds the other branches of a switch under one row", () => {
    const options = { properties: new Map(), editable: true };
    const closed = voiceRows([audioEvent(100)], new Set(["e100"]), ready(play(SWITCH)), options);
    const open = voiceRows(
      [audioEvent(100)],
      new Set(["e100", "e100/0:others"]),
      ready(play(SWITCH)),
      options,
    );

    expect(shape(closed).slice(2)).toEqual([
      ["e100/0.0.0", "voice", 2, "e100/0"],
      ["e100/0:others", "others", 2, "e100/0"],
    ]);
    expect(shape(open).slice(4)).toEqual([["e100/0.0.1", "voice", 3, "e100/0:others"]]);
  });

  it("draws an event of one sound as one row that does not expand", () => {
    const rows = voiceRows([audioEvent(100, 1)], new Set(["e100"]), ready(play(sound(1))), {
      properties: new Map(),
      editable: true,
    });
    const [row] = rows;

    expect(shape(rows)).toEqual([["e100", "event", 0, null]]);
    expect(row?.expandable).toBe(false);
    expect(row?.kind === "event" && row.inline?.voice.node.id).toBe(1);
  });

  it("draws one row with no voices under an event without a Play action", () => {
    const rows = voiceRows([audioEvent(100, 0)], new Set(["e100"]), ready(STOP), {
      properties: new Map(),
      editable: true,
    });

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100:empty", "empty", 1, "e100"],
    ]);
  });
});

describe("replayOf", () => {
  const options = { properties: new Map(), editable: true };

  it("replays the voice of a voice row", () => {
    const rows = voiceRows(
      [audioEvent(100)],
      new Set(["e100"]),
      ready(play(random(7, [sound(1)]))),
      options,
    );
    const voice = rows.find((row) => row.kind === "voice");

    expect(voice === undefined ? null : replayOf(voice)).toEqual({
      kind: "voice",
      key: "e100/0.0.0",
      media: media(10),
    });
  });

  it("replays the voice of an event drawn as one row", () => {
    const [row] = voiceRows([audioEvent(100, 1)], new Set(), ready(play(sound(1))), options);

    expect(row === undefined ? null : replayOf(row)).toEqual({
      kind: "voice",
      key: "e100",
      media: media(10),
    });
  });

  it("replays the event of a container's field row", () => {
    const rows = voiceRows(
      [audioEvent(100)],
      new Set(["e100", "e100/0#7"]),
      ready(play(random(7, [sound(1)]))),
      { properties: new Map([props(7, [{ property: "volume", value: 0 }])]), editable: true },
    );
    const field = rows.find((row) => row.kind === "field");

    expect(field === undefined ? null : replayOf(field)).toEqual({
      kind: "event",
      key: "e100",
      event: 100,
    });
  });

  it("replays nothing for a voice without media", () => {
    const rows = voiceRows(
      [audioEvent(100)],
      new Set(["e100"]),
      ready(play(random(7, [sound(1, false)]))),
      options,
    );
    const voice = rows.find((row) => row.kind === "voice");

    expect(voice === undefined ? undefined : replayOf(voice)).toBeNull();
  });
});
