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
  movedCell,
  onlyPlay,
  replayOf,
  type TreeItem,
  treeItems,
  type Voice,
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
function voicesOf(items: readonly TreeItem[]): Voice[] {
  return items.flatMap((item) => {
    if (item.kind === "voice") return [item.voice];

    return item.kind === "group" ? voicesOf(item.group.items) : [];
  });
}

const SWITCH: EventNode = {
  kind: "switch",
  id: 3,
  children: [sound(1), sound(2)],
  group: 11,
  defaultSwitch: 12,
  pick: { kind: "firstChild" },
};

describe("onlyPlay", () => {
  it("returns the one Play action beside the other classes", () => {
    expect(onlyPlay(tree(STOP, play(sound(1), 250)))?.delay).toBe(250);
  });

  it("returns null for two Play actions and for none", () => {
    expect(onlyPlay(tree(play(sound(1)), play(sound(2))))).toBeNull();
    expect(onlyPlay(tree(STOP))).toBeNull();
  });
});

describe("voiceFields", () => {
  const [voice] = voicesOf(treeItems(tree(play(random(7, [sound(1), sound(2)]))), "e100"));

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

    expect(voiceFields(missing, new Map())).toEqual({ source: null, target: null, cells: {} });
  });
});

describe("voiceColumns", () => {
  it("takes every cell that a voice of the list shows, in the row's order", () => {
    const voices = voicesOf(treeItems(tree(play(random(7, [sound(1), sound(2)]))), "e100"));
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
      ["e100/0.0", "group", 1, "e100"],
      ["e100/0.0~default", "group", 2, "e100/0.0"],
      ["e100/0.0~1", "group", 2, "e100/0.0"],
    ]);
    expect(shape(other).slice(1)).toEqual([
      ["e100/0.0", "group", 1, "e100"],
      ["e100/0.0~default", "group", 2, "e100/0.0"],
      ["e100/0.0.0", "voice", 3, "e100/0.0~default"],
      ["e100/0.0~1", "group", 2, "e100/0.0"],
      ["e100/0.0.1", "voice", 3, "e100/0.0~1"],
    ]);
  });

  it("adds to a switch from its default state, and not from the switch header", () => {
    const rows = voiceRows(
      [audioEvent(100)],
      new Set(["e100", "e100/0.0~1"]),
      ready(play(SWITCH)),
      {
        properties: new Map([props(3, [])]),
        editable: true,
      },
    );
    const adds = rows.flatMap((row) => (row.kind === "add" ? [[row.key, row.into]] : []));

    expect(adds).toEqual([
      ["e100/0.0~default:add", { kind: "container", container: 3 }],
      ["e100:add", { kind: "event", event: 100 }],
    ]);
  });

  it("draws the sound of an event's one Play action under the event, which names the Play", () => {
    const rows = voiceRows([audioEvent(100, 1)], new Set(["e100"]), ready(play(sound(1), 250)), {
      properties: new Map(),
      editable: true,
    });
    const [row] = rows;

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100/0.0", "voice", 1, "e100"],
      ["e100:add", "add", 1, "e100"],
    ]);
    expect(row?.kind === "event" && row.play?.delay).toBe(250);
  });

  it("draws an action row for each action that plays no tree", () => {
    const rows = voiceRows([audioEvent(100, 0)], new Set(["e100"]), ready(STOP), {
      properties: new Map(),
      editable: false,
    });
    const action = rows.find((row) => row.kind === "action");

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100/0", "action", 1, "e100"],
    ]);
    expect(action?.kind === "action" && action.cells.fields.target?.value).toBe(9);
  });

  it("draws one empty row under an event without actions", () => {
    const rows = voiceRows([audioEvent(100, 0)], new Set(["e100"]), ready(), {
      properties: new Map(),
      editable: false,
    });

    expect(shape(rows)).toEqual([
      ["e100", "event", 0, null],
      ["e100:empty", "empty", 1, "e100"],
    ]);
  });
});

describe("replayOf", () => {
  const options = { properties: new Map(), editable: true };

  it("replays the voice of a voice row with the containers above it", () => {
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
      object: 1,
      media: media(10),
      path: { nodes: [1, 7], action: null },
    });
  });

  it("replays the event of an action row", () => {
    const rows = voiceRows([audioEvent(100)], new Set(["e100"]), ready(STOP), options);
    const action = rows.find((row) => row.kind === "action");

    expect(action === undefined ? null : replayOf(action)).toEqual({
      kind: "event",
      key: "e100",
      object: 6,
      event: 100,
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
      object: 7,
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
