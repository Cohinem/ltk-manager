import { describe, expect, it } from "vitest";

import type { EventAction, EventNode, EventTree, MediaLocation } from "@/lib/tauri";

import { type GroupItem, voiceGroups } from "../voices";

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

function tree(...actions: EventAction[]): EventTree {
  return { event: 100, name: "Play_sfx_Rumble_BasicAttack_OnHit", actions };
}

/** Returns each item of `items` and below as its key, its kind, its object and its count. */
function outline(items: readonly GroupItem[]): unknown[] {
  return items.map((item) => {
    if (item.kind === "voice") return [item.voice.key, item.voice.node.id];

    const { group } = item;
    return [group.key, group.container?.id ?? null, group.count, outline(group.items)];
  });
}

describe("voiceGroups", () => {
  it("gives a random container one header over its sounds in playlist order", () => {
    const items = voiceGroups(tree(play(5, random(7, [sound(1), sound(2)], [1, 0]))), "e100");

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

  it("gives a switch one header per state, the default state first and open", () => {
    const node: EventNode = {
      kind: "switch",
      id: 3,
      children: [random(8, [sound(1), sound(2)]), random(9, [sound(4)]), sound(6)],
      group: 11,
      defaultSwitch: 12,
      pick: { kind: "default", nodes: [1] },
    };
    const items = voiceGroups(tree(play(5, node)), "e100");
    const groups = items.flatMap((item) => (item.kind === "group" ? [item.group] : []));

    expect(outline(items)).toEqual([
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
      ["e100/0.0~2", 3, 1, [["e100/0.0.2", 6]]],
    ]);
    expect(groups.map((group) => [group.state?.state, group.defaultOpen])).toEqual([
      [{ kind: "default" }, true],
      [{ kind: "other", child: 0 }, false],
      [{ kind: "other", child: 2 }, false],
    ]);
  });

  it("names a container that holds one container on the header below it", () => {
    const mixer: EventNode = { kind: "mixer", id: 2, children: [random(7, [sound(1)])] };
    const [item] = voiceGroups(tree(play(5, mixer)), "e100");
    const group = item?.kind === "group" ? item.group : null;

    expect(group?.container?.id).toBe(7);
    expect(group?.wrappers.map((wrapper) => wrapper.id)).toEqual([2]);
    expect(group?.key).toBe("e100/0.0.0");
  });

  it("gives each Play action of an event with several one header, named by its target", () => {
    const stop: EventAction = {
      id: 6,
      class: 0x0100,
      label: "Stop",
      target: 9,
      node: null,
      delay: 0,
    };
    const items = voiceGroups(
      tree(play(4, random(7, [sound(1)]), 250), stop, play(5, sound(2))),
      "e100",
    );
    const groups = items.flatMap((item) => (item.kind === "group" ? [item.group] : []));

    expect(outline(items)).toEqual([
      ["e100/0.0", 7, 1, [["e100/0.0.0", 1]]],
      ["e100/2", null, 1, [["e100/2.0", 2]]],
    ]);
    expect(groups.map((group) => [group.play.id, group.play.delay, group.actionHeader])).toEqual([
      [4, 250, true],
      [5, 0, true],
    ]);
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

    expect(outline(voiceGroups(tree(play(5, node)), "e100"))).toEqual([
      ["e100/0.0~default", 3, 1, [["e100/0.0.0", 1]]],
      ["e100/0.0~1", 3, 1, [["e100/0.0.1", 2]]],
    ]);
  });

  it("lists a missing object and a sound without media as voices", () => {
    const missing: EventNode = { kind: "missing", id: 6 };
    const silent: EventNode = { ...sound(1), media: null } as EventNode;

    expect(outline(voiceGroups(tree(play(5, random(7, [silent, missing]))), "e100"))).toEqual([
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

  it("lists the sound of an event's one Play action without a header", () => {
    expect(outline(voiceGroups(tree(play(5, sound(1))), "e100"))).toEqual([["e100/0.0", 1]]);
  });
});
