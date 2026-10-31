import { describe, expect, it } from "vitest";

import type { AudioEvent, EventNode, EventSwitchPick, EventTree, MediaLocation } from "@/lib/tauri";

import {
  eventSounds,
  eventVoices,
  filterEvents,
  nodeVoices,
  pickSounds,
  shownChildOrder,
  sortEvents,
} from "../eventTree";

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
  return {
    id,
    name,
    actionCount: 1,
    mediaCount: 2,
    status: { kind: "resolved" },
    contexts: [],
    listed: null,
    nodes: [],
  };
}

const RANDOM: EventNode = {
  kind: "random",
  id: 7,
  children: [sound(1, 11), sound(2, 12)],
  mode: "random",
  playlist: [
    { child: 0, weight: 1 },
    { child: 1, weight: 1 },
  ],
};

function switchOf(pick: EventSwitchPick): EventNode {
  return {
    kind: "switch",
    id: 3,
    children: [sound(1, 11), sound(2, 12)],
    group: 7,
    defaultSwitch: 5,
    pick,
  };
}

const TREE: EventTree = {
  event: 100,
  name: "Play_sfx_Ahri_AhriQ_OnCast",
  actions: [
    { id: 5, class: 0x0400, label: "Play", target: 7, node: RANDOM, delay: 250 },
    { id: 6, class: 0x0100, label: "Stop", target: 9, node: null, delay: 0 },
  ],
};

describe("shownChildOrder", () => {
  it("draws a random container's children in playlist order, then the unlisted ones", () => {
    const node: EventNode = {
      ...RANDOM,
      children: [sound(1, 11), sound(2, 12), sound(3, 13)],
      playlist: [
        { child: 2, weight: 1 },
        { child: 0, weight: 1 },
      ],
    };

    expect(shownChildOrder(node)).toEqual([2, 0, 1]);
  });

  it("draws the children of a switch container in file order", () => {
    expect(shownChildOrder(switchOf({ kind: "firstChild" }))).toEqual([0, 1]);
  });
});

describe("pickSounds", () => {
  it("plays the playlist item of a random container that the random source picks", () => {
    expect(pickSounds(RANDOM, () => 0).map((pick) => pick.source)).toEqual([11]);
    expect(pickSounds(RANDOM, () => 0.99).map((pick) => pick.source)).toEqual([12]);
  });

  it("picks a random container's playlist items by weight, in playlist order", () => {
    const weighted: EventNode = {
      ...RANDOM,
      playlist: [
        { child: 1, weight: 3 },
        { child: 0, weight: 1 },
      ],
    };

    expect(pickSounds(weighted, () => 0).map((pick) => pick.source)).toEqual([12]);
    expect(pickSounds(weighted, () => 0.7).map((pick) => pick.source)).toEqual([12]);
    expect(pickSounds(weighted, () => 0.8).map((pick) => pick.source)).toEqual([11]);
  });

  it("plays the first playlist item of a sequence container", () => {
    const sequence: EventNode = {
      ...RANDOM,
      mode: "sequence",
      playlist: [
        { child: 1, weight: 1 },
        { child: 0, weight: 1 },
      ],
    };

    expect(pickSounds(sequence, () => 0).map((pick) => pick.source)).toEqual([12]);
  });

  it("plays nothing for a random container with an empty playlist", () => {
    expect(pickSounds({ ...RANDOM, playlist: [] }, () => 0)).toEqual([]);
  });

  it("plays the nodes of a switch container's default switch", () => {
    expect(pickSounds(switchOf({ kind: "default", nodes: [1] }), () => 0)).toEqual([media(12)]);
  });

  it("plays the first child of a switch container without a default switch", () => {
    expect(pickSounds(switchOf({ kind: "firstChild" }), () => 0.99)).toEqual([media(11)]);
  });

  it("plays every child of a layer", () => {
    const children = [sound(1, 11), sound(2, 12)];

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

describe("eventVoices", () => {
  it("gives each pick the path from its sound up to its Play action and the action's delay", () => {
    expect(eventVoices(TREE, () => 0.6)).toEqual([
      { media: media(12), path: { nodes: [2, 7], action: { id: 5, delay: 0.25 } } },
    ]);
  });

  it("names every container between a sound and its action, the innermost first", () => {
    const layered: EventTree = {
      ...TREE,
      actions: [
        {
          id: 5,
          class: 0x0400,
          label: "Play",
          target: 4,
          node: { kind: "layer", id: 4, children: [RANDOM, sound(3, 13)] },
          delay: 0,
        },
      ],
    };

    expect(eventVoices(layered, () => 0).map((voice) => voice.path.nodes)).toEqual([
      [1, 7, 4],
      [3, 4],
    ]);
  });
});

describe("nodeVoices", () => {
  it("adds the containers above the pressed node to each path, without an action", () => {
    expect(nodeVoices(RANDOM, () => 0, [4, 8])).toEqual([
      { media: media(11), path: { nodes: [1, 7, 4, 8], action: null } },
    ]);
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
