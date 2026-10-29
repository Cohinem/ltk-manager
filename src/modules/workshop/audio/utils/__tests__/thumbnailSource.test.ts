import { describe, expect, it } from "vitest";

import type { AudioEvent, EventNode, EventTree, MediaLocation } from "@/lib/tauri";

import { eventRows } from "../eventTree";
import { thumbnailSource } from "../thumbnailSource";

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

function event(id: number, mediaCount: number): AudioEvent {
  return { id, name: null, actionCount: 1, mediaCount, status: { kind: "resolved" } };
}

const TREE: EventTree = {
  event: 100,
  name: null,
  actions: [
    {
      id: 5,
      class: 0x0400,
      label: "Play",
      target: 7,
      node: { kind: "random", id: 7, children: [sound(1, 11), sound(2, 12, false)] },
    },
  ],
};

const ROWS = eventRows(
  [event(100, 2), event(200, 0)],
  new Set(["e100", "e100/0", "e100/0.0"]),
  new Map([[100, { kind: "ready", tree: TREE }]]),
);

function rowOf(key: string) {
  const row = ROWS.find((each) => each.key === key);
  if (row === undefined) throw new Error(`No row ${key} in ${ROWS.map((each) => each.key)}`);
  return row;
}

describe("thumbnailSource", () => {
  it("returns the event of an event row that has media, which reads its tree", () => {
    expect(thumbnailSource(rowOf("e100"))).toEqual({ kind: "event", id: 100 });
  });

  it("returns null for an event row without media", () => {
    expect(thumbnailSource(rowOf("e200"))).toBeNull();
  });

  it("returns the first child's media of a random container under an action", () => {
    expect(thumbnailSource(rowOf("e100/0"))).toEqual({ kind: "media", media: media(11) });
  });

  it("returns null for a sound without media", () => {
    const missing = ROWS.find((row) => row.kind === "node" && row.node.id === 2);

    expect(missing && thumbnailSource(missing)).toBeNull();
  });

  it("returns null for a row that is not an object", () => {
    const loading = eventRows([event(300, 1)], new Set(["e300"]), new Map());

    expect(thumbnailSource(loading[1]!)).toBeNull();
  });
});
