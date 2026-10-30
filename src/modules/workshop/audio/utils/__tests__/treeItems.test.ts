import { describe, expect, it } from "vitest";

import type { EventAction, EventNode, EventTree, MediaLocation } from "@/lib/tauri";

import { type TreeItem, treeItems, type VoiceGroup } from "../voices";

function media(source: number): MediaLocation {
  return {
    asset: { kind: "file", path: "C:/mods/rumble_base_sfx_audio.bnk" },
    path: "assets/sounds/rumble_base_sfx_audio.bnk",
    source,
    container: "bank",
  };
}

function sound(id: number): EventNode {
  return { kind: "sound", id, source: id * 10, stream: "dataBank", media: media(id * 10) };
}

function random(id: number, children: EventNode[], order = children.map((_, at) => at)): EventNode {
  return {
    kind: "random",
    id,
    children,
    mode: "random",
    playlist: order.map((child) => ({ child, weight: 50000 })),
  };
}

function play(id: number, node: EventNode | null, delay = 0): EventAction {
  return { id, class: 0x0400, label: "Play", target: node?.id ?? null, node, delay };
}

const STOP: EventAction = { id: 6, class: 0x0100, label: "Stop", target: 9, node: null, delay: 0 };

function tree(...actions: EventAction[]): EventTree {
  return { event: 100, name: "Play_sfx_Rumble_BasicAttack_OnHit", actions };
}

/** Returns each item of `items` and below as its key and its object, and a header's count. */
function outline(items: readonly TreeItem[]): unknown[] {
  return items.map((item) => {
    if (item.kind === "voice") return [item.voice.key, item.voice.node.id];
    if (item.kind === "action") return [item.key, "action", item.action.id];

    const { group } = item;
    return [group.key, group.container?.id ?? null, group.count, outline(group.items)];
  });
}

/** Returns the headers of `items` at every depth, in draw order. */
function headers(items: readonly TreeItem[]): VoiceGroup[] {
  return items.flatMap((item) =>
    item.kind === "group" ? [item.group, ...headers(item.group.items)] : [],
  );
}

describe("treeItems", () => {
  it("gives a random container one header over its sounds in playlist order", () => {
    const items = treeItems(tree(play(5, random(7, [sound(1), sound(2)], [1, 0]))), "e100");

    expect(outline(items)).toEqual([
      [
        "e100/0.0",
        7,
        2,
        [
          ["e100/0.0.1", 2],
          ["e100/0.0.0", 1],
        ],
      ],
    ]);
  });

  it("nests a switch header over one header per state, the default state first and open", () => {
    const node: EventNode = {
      kind: "switch",
      id: 3,
      children: [random(8, [sound(1), sound(2)]), random(9, [sound(4)]), sound(6)],
      group: 11,
      defaultSwitch: 12,
      pick: { kind: "default", nodes: [1] },
    };
    const items = treeItems(tree(play(5, node)), "e100");

    expect(outline(items)).toEqual([
      [
        "e100/0.0",
        3,
        4,
        [
          ["e100/0.0~default", 9, 1, [["e100/0.0.1.0", 4]]],
          [
            "e100/0.0~0",
            8,
            2,
            [
              ["e100/0.0.0.0", 1],
              ["e100/0.0.0.1", 2],
            ],
          ],
          ["e100/0.0~2", null, 1, [["e100/0.0.2", 6]]],
        ],
      ],
    ]);
    expect(headers(items).map((group) => [group.state?.state ?? null, group.defaultOpen])).toEqual([
      [null, true],
      [{ kind: "default" }, true],
      [{ kind: "other", child: 0 }, false],
      [{ kind: "other", child: 2 }, false],
    ]);
  });

  it("gives a container that holds one container a compact header of its own", () => {
    const mixer: EventNode = { kind: "mixer", id: 2, children: [random(7, [sound(1)])] };
    const items = treeItems(tree(play(5, mixer)), "e100");

    expect(outline(items)).toEqual([
      ["e100/0.0", 2, 1, [["e100/0.0.0", 7, 1, [["e100/0.0.0.0", 1]]]]],
    ]);
    expect(headers(items).map((group) => group.compact)).toEqual([true, false]);
  });

  it("gives each Play action of an event with several an action header", () => {
    const items = treeItems(
      tree(play(4, random(7, [sound(1)]), 250), STOP, play(5, sound(2))),
      "e100",
    );

    expect(outline(items)).toEqual([
      ["e100/0", null, 1, [["e100/0.0", 7, 1, [["e100/0.0.0", 1]]]]],
      ["e100/1", "action", 6],
      ["e100/2", null, 1, [["e100/2.0", 2]]],
    ]);
    expect(headers(items).map((group) => [group.play.id, group.actionHeader])).toEqual([
      [4, true],
      [4, false],
      [5, true],
    ]);
  });

  it("lists the node of an event's one Play action under the event, then its other actions", () => {
    const items = treeItems(tree(play(5, random(7, [sound(1)])), STOP), "e100");

    expect(outline(items)).toEqual([
      ["e100/0.0", 7, 1, [["e100/0.0.0", 1]]],
      ["e100/1", "action", 6],
    ]);
  });

  it("lists the sound of an event's one Play action as a voice under the event", () => {
    expect(outline(treeItems(tree(play(5, sound(1))), "e100"))).toEqual([["e100/0.0", 1]]);
  });

  it("lists only action rows for an event without a Play action", () => {
    expect(outline(treeItems(tree(STOP), "e100"))).toEqual([["e100/0", "action", 6]]);
  });

  it("takes the first child of a switch without a default switch as its default state", () => {
    const node: EventNode = {
      kind: "switch",
      id: 3,
      children: [sound(1), sound(2)],
      group: 11,
      defaultSwitch: 12,
      pick: { kind: "firstChild" },
    };

    expect(outline(treeItems(tree(play(5, node)), "e100"))).toEqual([
      [
        "e100/0.0",
        3,
        2,
        [
          ["e100/0.0~default", null, 1, [["e100/0.0.0", 1]]],
          ["e100/0.0~1", null, 1, [["e100/0.0.1", 2]]],
        ],
      ],
    ]);
  });

  it("lists a missing object and a sound without media as voices", () => {
    const missing: EventNode = { kind: "missing", id: 6 };
    const silent: EventNode = { ...sound(1), media: null } as EventNode;

    expect(outline(treeItems(tree(play(5, random(7, [silent, missing]))), "e100"))).toEqual([
      [
        "e100/0.0",
        7,
        2,
        [
          ["e100/0.0.0", 1],
          ["e100/0.0.1", 6],
        ],
      ],
    ]);
  });
});
