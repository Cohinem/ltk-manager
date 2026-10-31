import { describe, expect, it } from "vitest";

import type { AudioEvent, EventAction, EventNode, ReachedNode } from "@/lib/tauri";

import { filterEvents } from "../eventTree";
import { actionName, eventStem, nodeName, nodeNames, runStems } from "../nodeNames";

function event(id: number, name: string | null, nodes: readonly ReachedNode[]): AudioEvent {
  return {
    id,
    name,
    actionCount: 1,
    mediaCount: nodes.filter((node) => node.role === "sound").length,
    status: { kind: "resolved" },
    contexts: [],
    listed: null,
    nodes: [...nodes],
  };
}

function random(id: number): ReachedNode {
  return { id, role: "random", source: null };
}

function sound(id: number, source = id + 1000): ReachedNode {
  return { id, role: "sound", source };
}

describe("eventStem", () => {
  it("removes the verb, category and champion segments", () => {
    expect(eventStem("Play_sfx_Rumble_Death3D_cast")).toBe("Death3D_cast");
    expect(eventStem("Play_vo_RumbleSkin02_Attack2DGeneral")).toBe("Attack2DGeneral");
  });
});

describe("nodeNames", () => {
  it("names a container after its event and its role", () => {
    const names = nodeNames([event(1, "Play_sfx_Rumble_Death3D_cast", [random(7)])]);

    expect(names.nodes.get(7)).toBe("Death3D_cast / Random");
  });

  it("names a shared container after the longest common stem of its events", () => {
    const names = nodeNames([
      event(1, "Play_sfx_Rumble_Death3D_cast", [random(7)]),
      event(2, "Play_sfx_Rumble_Death3D_cast_loop", [random(7)]),
      event(3, "Play_sfx_Rumble_Ult_cast", [random(8)]),
      event(4, "Play_sfx_Rumble_Ult_hit", [random(8)]),
      event(5, "Play_sfx_Rumble_BasicAttack1", [random(9)]),
      event(6, "Play_sfx_Rumble_BasicAttack2", [random(9)]),
    ]);

    expect(names.nodes.get(7)).toBe("Death3D_cast / Random");
    expect(names.nodes.get(8)).toBe("Ult / Random");
    expect(names.nodes.get(9)).toBe("BasicAttack / Random");
  });

  it("leaves out a shared container whose events have no common stem", () => {
    const names = nodeNames([
      event(1, "Play_sfx_Rumble_Death3D_cast", [random(7)]),
      event(2, "Play_sfx_Rumble_Q_hit", [random(7)]),
    ]);

    expect(names.nodes.has(7)).toBe(false);
  });

  it("names a sound after its event and its slot among the sounds of the event", () => {
    const names = nodeNames([
      event(1, "Play_sfx_Rumble_Death3D_cast", [random(7), sound(21), sound(22), sound(23)]),
    ]);

    expect(names.nodes.get(21)).toBe("Death3D_cast #1");
    expect(names.nodes.get(23)).toBe("Death3D_cast #3");
  });

  it("takes the slot of a shared sound from the first named event that reaches it", () => {
    const names = nodeNames([
      event(1, null, [sound(30), sound(31)]),
      event(2, "Play_sfx_Rumble_Ult_cast", [sound(40), sound(31)]),
      event(3, "Play_sfx_Rumble_Ult_hit", [sound(31)]),
    ]);

    expect(names.nodes.get(31)).toBe("Ult #2");
    expect(names.nodes.has(30)).toBe(false);
  });

  it("keeps the names of the other nodes when a duplicate joins the event", () => {
    const before = [event(1, "Play_sfx_Rumble_Death3D_cast", [random(7), sound(21), sound(22)])];
    const after = [
      event(1, "Play_sfx_Rumble_Death3D_cast", [random(7), sound(21), sound(22), sound(24)]),
    ];

    const edited = nodeNames(after);
    expect(edited.nodes.get(21)).toBe("Death3D_cast #1");
    expect(edited.nodes.get(22)).toBe("Death3D_cast #2");
    expect(edited.nodes.get(24)).toBe("Death3D_cast #3");
    expect(nodeNames(before).nodes.has(24)).toBe(false);
  });

  it("names a sound and its media after the file that the media was imported from", () => {
    const names = nodeNames(
      [event(1, "Play_sfx_Rumble_Death3D_cast", [random(7), sound(21, 500), sound(22, 600)])],
      [{ source: 500, file: "my_cast.wem" }],
    );

    expect(names.nodes.get(21)).toBe("my_cast");
    expect(names.media.get(500)).toBe("my_cast");
    expect(names.media.get(600)).toBe("Death3D_cast #2");
  });

  it("leaves out a node that only an unnamed event reaches", () => {
    expect(nodeNames([event(1, null, [random(7)])]).nodes.has(7)).toBe(false);
  });
});

describe("nodeName", () => {
  const names = nodeNames([event(1, "Play_sfx_Rumble_Death3D_cast", [random(7)])]);

  it("returns the derived name of a named node", () => {
    const node: EventNode = { kind: "random", id: 7, children: [], mode: "random", playlist: [] };

    expect(nodeName(names, node)).toBe("Death3D_cast / Random");
  });

  it("falls back to the kind of a node without a name", () => {
    const node: EventNode = { kind: "random", id: 8, children: [], mode: "sequence", playlist: [] };

    expect(nodeName(names, node)).toBe("Sequence");
  });
});

describe("actionName", () => {
  const play: EventAction = {
    id: 3,
    class: 0x0400,
    label: "Play",
    target: 7,
    node: null,
    delay: 0,
  };

  it("names a Play action after its event", () => {
    expect(actionName("Play_sfx_Rumble_Death3D_cast", play)).toBe("Death3D_cast / Play");
  });

  it("returns null for an action of another class and for an unnamed event", () => {
    expect(actionName("Play_sfx_Rumble_Death3D_cast", { ...play, class: 0x0100 })).toBeNull();
    expect(actionName(null, play)).toBeNull();
  });
});

describe("runStems", () => {
  it("draws a stem once for a run of containers that share it", () => {
    const names = nodeNames([
      event(1, "Play_sfx_Rumble_Death3D_cast", [random(7), random(8)]),
      event(2, "Play_sfx_Rumble_Ult_cast", [random(9)]),
    ]);

    expect(runStems([null, 7, 8, 9], names)).toEqual([null, "Death3D_cast", null, "Ult_cast"]);
  });
});

describe("filterEvents", () => {
  const events = [
    event(1, "Play_sfx_Rumble_Death3D_cast", [random(7), sound(21)]),
    event(2, "Play_sfx_Rumble_Ult_cast", [sound(40)]),
  ];
  const names = nodeNames(events);

  it("keeps the events that reach a node whose derived name contains the filter", () => {
    expect(filterEvents(events, "death3d_cast / random", names).map((each) => each.id)).toEqual([
      1,
    ]);
  });

  it("keeps the events that reach a node whose ID contains the filter", () => {
    expect(filterEvents(events, "#40", names).map((each) => each.id)).toEqual([2]);
  });
});
