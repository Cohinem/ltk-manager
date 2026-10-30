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
  foldKey,
  type GroupItem,
  inlineVoice,
  movedCell,
  playDelay,
  replayOf,
  type Voice,
  voiceColumns,
  voiceFields,
  voiceGroups,
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
    nodes: [],
  };
}

function ready(...actions: EventAction[]) {
  return new Map([[100, { kind: "ready" as const, tree: tree(...actions) }]]);
}

function shape(rows: readonly VoiceRow[]) {
  return rows.map((row) => [row.key, row.kind, row.depth, row.parent]);
}

/** Returns the voices of `items` at every depth, in the order that the rows draw them. */
function voicesOf(items: readonly GroupItem[]): Voice[] {
  return items.flatMap((item) =>
    item.kind === "voice" ? [item.voice] : voicesOf(item.group.items),
  );
}

const SWITCH: EventNode = {
  kind: "switch",
  id: 3,
  children: [sound(1), sound(2)],
  group: 11,
  defaultSwitch: 12,
  pick: { kind: "firstChild" },
};

describe("inlineVoice", () => {
  it("returns the voice of an event that plays one sound without a container", () => {
    const inline = inlineVoice(voiceGroups(tree(play(sound(1)), STOP), "e100"));

    expect(inline?.node.id).toBe(1);
  });

  it("returns null for one sound in a container", () => {
    expect(inlineVoice(voiceGroups(tree(play(random(7, [sound(1)]))), "e100"))).toBeNull();
  });

  it("returns null for two Play actions of one sound each", () => {
    expect(inlineVoice(voiceGroups(tree(play(sound(1)), play(sound(2))), "e100"))).toBeNull();
  });
});

describe("playDelay", () => {
  it("returns the delay of the one Play action", () => {
    expect(playDelay(tree(STOP, play(sound(1), 250)))).toBe(250);
  });

  it("returns null for a delay of 0 and for two Play actions", () => {
    expect(playDelay(tree(play(sound(1))))).toBeNull();
    expect(playDelay(tree(play(sound(1), 250), play(sound(2), 250)))).toBeNull();
  });
});

describe("voiceFields", () => {
  const [voice] = voicesOf(voiceGroups(tree(play(random(7, [sound(1), sound(2)]))), "e100"));

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
    const missing: Voice = {
      key: "e100/0.0",
      node: { kind: "missing", id: 6 },
      path: [],
      play: play(null),
    };

    expect(voiceFields(missing, new Map())).toEqual({ source: null, cells: {} });
  });
});

describe("voiceColumns", () => {
  it("takes every cell that a voice of the list shows, in the row's order", () => {
    const voices = voicesOf(voiceGroups(tree(play(random(7, [sound(1), sound(2)]))), "e100"));
    const properties = new Map([
      props(1, [{ property: "hpf", value: 20 }]),
      props(2, [
        { property: "volume", value: -6 },
        { property: "delay", value: 0.1 },
      ]),
    ]);

    expect(voiceColumns(voices.map((voice) => voiceFields(voice, properties)))).toEqual([
      "media",
      "volume",
      "delay",
      "hpf",
    ]);
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

  it("draws the header, its voices and the add rows under an expanded event", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100"]), ready(play(RANDOM)), {
      properties: new Map([WEIGHTED]),
      editable: true,
    });

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100/0.0", "group", 1, "e100"],
      ["e100/0.0.0", "voice", 2, "e100/0.0"],
      ["e100/0.0.1", "voice", 2, "e100/0.0"],
      ["e100/0.0:add", "add", 2, "e100/0.0"],
      ["e100:add", "add", 1, "e100"],
    ]);
  });

  it("draws no add row while the bank takes no edit", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100"]), ready(play(RANDOM)), {
      properties: new Map([WEIGHTED]),
      editable: false,
    });

    expect(rows.map((row) => row.kind)).not.toContain("add");
  });

  it("lines up the cells of the header and the voices of one event", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100"]), ready(play(RANDOM)), {
      properties: new Map([
        props(7, [{ property: "lpf", value: 40 }]),
        props(1, [{ property: "volume", value: -3 }]),
      ]),
      editable: false,
    });
    const columns = rows.flatMap((row) => {
      if (row.kind === "group") return [row.cells.columns];
      if (row.kind === "voice") return [row.line.columns];
      return [];
    });

    expect(columns).toEqual([
      ["media", "volume", "lpf"],
      ["media", "volume", "lpf"],
      ["media", "volume", "lpf"],
    ]);
  });

  it("folds a header by its closed key, and opens another switch state by its own key", () => {
    const options = { properties: new Map(), editable: false };
    const shut = voiceRows(
      [audioEvent(100)],
      new Set(["e100", foldKey({ key: "e100/0.0~default", defaultOpen: true })]),
      ready(play(SWITCH)),
      options,
    );
    const other = voiceRows(
      [audioEvent(100)],
      new Set(["e100", "e100/0.0~1"]),
      ready(play(SWITCH)),
      options,
    );

    expect(shape(shut)).toEqual([
      ["e100", "event", 0, null],
      ["e100/0.0~default", "group", 1, "e100"],
      ["e100/0.0~1", "group", 1, "e100"],
    ]);
    expect(shape(other).slice(1)).toEqual([
      ["e100/0.0~default", "group", 1, "e100"],
      ["e100/0.0.0", "voice", 2, "e100/0.0~default"],
      ["e100/0.0~1", "group", 1, "e100"],
      ["e100/0.0.1", "voice", 2, "e100/0.0~1"],
    ]);
  });

  it("draws an event of one sound as one row that does not expand", () => {
    const rows = voiceRows([audioEvent(100, 1)], new Set(["e100"]), ready(play(sound(1), 250)), {
      properties: new Map(),
      editable: true,
    });
    const [row] = rows;

    expect(shape(rows)).toEqual([["e100", "event", 0, null]]);
    expect(row?.expandable).toBe(false);
    expect(row?.kind === "event" && [row.inline?.voice.node.id, row.delay]).toEqual([1, 250]);
  });

  it("draws one row with no voices under an event without a Play action", () => {
    const rows = voiceRows([audioEvent(100, 0)], new Set(["e100"]), ready(STOP), {
      properties: new Map(),
      editable: true,
    });

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100:empty", "empty", 1, "e100"],
      ["e100:add", "add", 1, "e100"],
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

  it("replays the event of a header row", () => {
    const rows = voiceRows(
      [audioEvent(100)],
      new Set(["e100"]),
      ready(play(random(7, [sound(1)]))),
      options,
    );
    const header = rows.find((row) => row.kind === "group");

    expect(header === undefined ? null : replayOf(header)).toEqual({
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
