import { describe, expect, it } from "vitest";

import type { EventAction, EventNode, EventTree, MediaLocation } from "@/lib/tauri";

import { voiceChains, voicePrefix } from "../voices";

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

function random(id: number, children: EventNode[], order = children.map((_, at) => at)): EventNode {
  return {
    kind: "random",
    id,
    children,
    mode: "random",
    playlist: order.map((child) => ({ child, weight: 50000 })),
  };
}

function play(node: EventNode | null, delay = 0): EventAction {
  return { id: 5, class: 0x0400, label: "Play", target: node?.id ?? null, node, delay };
}

function tree(...actions: EventAction[]): EventTree {
  return { event: 100, name: "Play_sfx_Ahri_AhriQ_OnCast", actions };
}

function ids(voices: readonly { node: EventNode }[]): number[] {
  return voices.map((voice) => voice.node.id);
}

describe("voiceChains", () => {
  it("lists the sounds of a random container in playlist order", () => {
    const [chain] = voiceChains(
      tree(play(random(7, [sound(1), sound(2), sound(3)], [2, 0, 1]))),
      "e100",
    );

    expect(chain?.run.map((node) => node.id)).toEqual([7]);
    expect(ids(chain?.voices ?? [])).toEqual([3, 1, 2]);
    expect(chain?.voices.map((voice) => voice.key)).toEqual([
      "e100/0.0.2",
      "e100/0.0.0",
      "e100/0.0.1",
    ]);
  });

  it("lists a switch container's default branch in voices and its other branches in others", () => {
    const node: EventNode = {
      kind: "switch",
      id: 3,
      children: [random(8, [sound(1), sound(2)]), random(9, [sound(4)])],
      group: 11,
      defaultSwitch: 12,
      pick: { kind: "default", nodes: [1] },
    };
    const [chain] = voiceChains(tree(play(node)), "e100");

    expect(ids(chain?.voices ?? [])).toEqual([4]);
    expect(ids(chain?.others ?? [])).toEqual([1, 2]);
  });

  it("takes the first child of a switch container without a default switch as its default branch", () => {
    const node: EventNode = {
      kind: "switch",
      id: 3,
      children: [sound(1), sound(2)],
      group: 11,
      defaultSwitch: 12,
      pick: { kind: "firstChild" },
    };
    const [chain] = voiceChains(tree(play(node)), "e100");

    expect(ids(chain?.voices ?? [])).toEqual([1]);
    expect(ids(chain?.others ?? [])).toEqual([2]);
  });

  it("gives one chain per Play action that plays a node, with no run for a sound", () => {
    const stop: EventAction = {
      id: 6,
      class: 0x0100,
      label: "Stop",
      target: 9,
      node: null,
      delay: 0,
    };
    const chains = voiceChains(tree(stop, play(sound(1), 250)), "e100");

    expect(chains.map((chain) => [chain.key, chain.run.length, ids(chain.voices)])).toEqual([
      ["e100/1", 0, [1]],
    ]);
  });

  it("lists a missing object and a sound without media as voices", () => {
    const missing: EventNode = { kind: "missing", id: 6 };
    const [chain] = voiceChains(tree(play(random(7, [sound(1, false), missing]))), "e100");

    expect(ids(chain?.voices ?? [])).toEqual([1, 6]);
  });
});

describe("voicePrefix", () => {
  const node: EventNode = {
    kind: "switch",
    id: 3,
    children: [random(8, [sound(1), sound(2)]), sound(4)],
    group: 11,
    defaultSwitch: 12,
    pick: { kind: "default", nodes: [0, 1] },
  };
  const [chain] = voiceChains(tree(play(node)), "e100");

  it("names the path from the end of the run for a voice in a nested container", () => {
    const voice = chain?.voices[0];
    const prefix = voice === undefined || chain === undefined ? [] : voicePrefix(voice, chain);

    expect(prefix.map((step) => [step.container.id, step.branch])).toEqual([
      [3, "default"],
      [8, null],
    ]);
  });

  it("names nothing for a voice whose parent ends the run", () => {
    const voice = chain?.voices[2];
    const prefix = voice === undefined || chain === undefined ? [] : voicePrefix(voice, chain);

    expect(voice?.node.id).toBe(4);
    expect(prefix).toEqual([]);
  });
});
