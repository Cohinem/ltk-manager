import { describe, expect, it } from "vitest";

import type { ClipEvent, EventKind, GraphClip } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import {
  frameSeconds,
  hiddenAt,
  particleCues,
  snapCues,
  soundCues,
  timedSteps,
  visibilityTimeline,
} from "../clipEvents";

function ref(name: string) {
  return { name, hash: nameHash(name) };
}

function event(
  name: string,
  kind: EventKind,
  startFrame: number,
  endFrame: number | null = null,
): ClipEvent {
  return { name, hash: nameHash(name), class: "", startFrame, endFrame, kind };
}

/* A tick of a half keeps every frame an exact float, so the times compare whole. */
function clip(name: string, events: ClipEvent[], tickDuration: number | null = 0.5): GraphClip {
  return {
    name,
    hash: nameHash(name),
    class: "AtomicClipData",
    animation: { path: `${name}.anm`, asset: null },
    track: null,
    mask: null,
    syncGroup: null,
    tickDuration,
    events,
    children: [],
    parameters: [],
    interruptionGroups: [],
    flags: 0,
    ownEvents: false,
  };
}

const SHOW_NOODLES: EventKind = {
  kind: "submeshVisibility",
  show: [ref("Noodles")],
  hide: [ref("Chopsticks")],
};

const FLASH: EventKind = {
  kind: "particle",
  effectKey: "0x01",
  effectName: "Flash",
  spawns: [{ bone: ref("Head"), targetBone: null }],
  isLoop: false,
  isKill: false,
  scale: 1,
};

describe("frameSeconds", () => {
  it("takes the clip's own tick, else the file's rate, else thirty a second", () => {
    expect(frameSeconds(clip("a", [], 0.05), 60)).toBe(0.05);
    expect(frameSeconds(clip("a", [], null), 60)).toBeCloseTo(1 / 60);
    expect(frameSeconds(clip("a", [], 0), null)).toBeCloseTo(1 / 30);
  });
});

describe("timedSteps", () => {
  it("starts each step where the ones before it end", () => {
    const steps = timedSteps(
      [clip("a", []), clip("b", []), clip("c", [])],
      [1, 2, 3],
      [30, 30, 30],
    );

    expect(steps.map((step) => step.start)).toEqual([0, 1, 3]);
    expect(steps[1].frame).toBe(0.5);
  });

  it("places the events of a clip that plays the playlist over the whole pass", () => {
    const owner = { ...clip("Spell", [event("Aim", SHOW_NOODLES, 0, 4)]), ownEvents: true };
    const playlist = [clip("a", []), clip("b", [])];

    const steps = timedSteps(playlist, [1, 2], [30, 30], owner);

    /* Three seconds over the six frames its clips hold. */
    expect(steps.at(-1)).toEqual({ clip: owner, start: 0, frame: 0.5 });
    expect(timedSteps(playlist, [1, 2], [30, 30], { ...owner, ownEvents: false })).toHaveLength(2);
    expect(timedSteps([owner], [1], [30], owner)).toHaveLength(1);
  });
});

describe("particleCues", () => {
  const systems = [{ key: "0x01", system: "0xaa", name: null }];

  it("places a particle event on the pass, one cue per pair, with the end frame as its stop", () => {
    const start = clip("Attack", [event("Hit", FLASH, 12, 40)]);
    const steps = timedSteps([clip("Run", []), start], [2, 3], [30, 30]);

    expect(particleCues(steps, systems)).toEqual([
      {
        key: `1:${nameHash("Hit")}:0`,
        system: "0xaa",
        at: 2 + 6,
        until: 2 + 20,
        bone: ref("Head"),
        target: null,
      },
    ]);
  });

  it("passes over a kill event, an unmapped key, and an end frame before the start", () => {
    const kill = event("Kill", { ...FLASH, isKill: true }, 0);
    const unmapped = event("Lost", { ...FLASH, effectKey: "0x02" }, 0);
    const backwards = event("Back", FLASH, 10, 5);
    const steps = timedSteps([clip("a", [kill, unmapped, backwards])], [1], [30]);

    const cues = particleCues(steps, systems);

    expect(cues.map((cue) => [cue.key, cue.until])).toEqual([[`0:${nameHash("Back")}:0`, null]]);
  });

  it("spawns an event naming no pair on the skeleton's origin", () => {
    const bare = event("Bare", { ...FLASH, spawns: [] }, 0);
    const steps = timedSteps([clip("a", [bare])], [1], [30]);

    expect(particleCues(steps, systems)[0]).toMatchObject({ bone: null, target: null });
  });
});

describe("soundCues", () => {
  const STEP: EventKind = {
    kind: "sound",
    name: "Play_sfx_Ahri_Step",
    isLoop: true,
    isKill: true,
    skipIfPastEnd: false,
    conditionTransition: 1,
  };

  it("places a sound event on the pass in seconds, with its flags", () => {
    const walk = clip("Walk", [event("Step", STEP, 12, 40)]);
    const steps = timedSteps([clip("Run", []), walk], [2, 3], [30, 30]);

    expect(soundCues(steps)).toEqual([
      {
        key: `1:${nameHash("Step")}`,
        name: "Play_sfx_Ahri_Step",
        at: 2 + 6,
        endAt: 2 + 20,
        kill: true,
        loop: true,
        skipIfPastEnd: false,
      },
    ]);
  });

  it("carries a one-time event, a lasting event and a skip past the end frame", () => {
    const once = event("Once", { ...STEP, isLoop: false }, 0);
    const lasting = event("Lasting", { ...STEP, isKill: false }, 2);
    const skipped = event("Skipped", { ...STEP, skipIfPastEnd: true }, 4, 8);
    const steps = timedSteps([clip("a", [once, lasting, skipped])], [10], [30]);

    const cues = soundCues(steps);

    expect(cues.map((cue) => [cue.at, cue.loop, cue.kill, cue.skipIfPastEnd, cue.endAt])).toEqual([
      [0, false, true, false, null],
      [1, true, false, false, null],
      [2, true, true, true, 4],
    ]);
  });

  it("places a sequencer's own events over the whole pass and skips an event naming no sound", () => {
    const owner = {
      ...clip("Combo", [event("Hit", STEP, 4), event("Silent", { ...STEP, name: "" }, 0)]),
      ownEvents: true,
    };
    const steps = timedSteps([clip("a", []), clip("b", [])], [1, 2], [30, 30], owner);

    expect(soundCues(steps).map((cue) => [cue.key, cue.at])).toEqual([[`2:${nameHash("Hit")}`, 2]]);
  });

  it("orders the cues by time across steps", () => {
    const steps = timedSteps(
      [clip("a", [event("Late", STEP, 6)]), clip("b", [event("Early", STEP, 0)])],
      [1, 1],
      [30, 30],
    );

    expect(soundCues(steps).map((cue) => cue.at)).toEqual([1, 3]);
  });
});

describe("snapCues", () => {
  const grip: EventKind = {
    kind: "jointSnap",
    joint: ref("Buffbone_Weapon"),
    snapTo: ref("R_Hand"),
    offset: [1, 2, 3],
  };

  it("places each snap on the pass and passes over one naming no joint", () => {
    const steps = timedSteps(
      [
        clip("Run", []),
        clip("Recall", [
          event("Late", grip, 20, 10),
          event("Grip", grip, 4, 10),
          event("Bare", { ...grip, snapTo: null }, 0),
        ]),
      ],
      [2, 3],
      [30, 30],
    );

    expect(snapCues(steps)).toEqual([
      { joint: ref("Buffbone_Weapon"), snapTo: ref("R_Hand"), offset: [1, 2, 3], at: 4, until: 7 },
      {
        joint: ref("Buffbone_Weapon"),
        snapTo: ref("R_Hand"),
        offset: [1, 2, 3],
        at: 12,
        until: null,
      },
    ]);
  });
});

describe("visibilityTimeline", () => {
  const submeshes = ["Body", "ramen_noodles", "Chopsticks"];

  it("opens on the skin's own hidden set and changes where each event falls", () => {
    const steps = timedSteps([clip("Joke", [event("Noodle", SHOW_NOODLES, 36)])], [10], [30]);

    const timeline = visibilityTimeline(["Chopsticks"], submeshes, steps);

    expect(timeline).toEqual([
      { at: 0, hidden: ["Chopsticks"] },
      { at: 18, hidden: ["Chopsticks"] },
    ]);
  });

  it("spells a submesh as the mesh does, matched by hash, and puts an event back at its end frame", () => {
    const noodles: EventKind = {
      kind: "submeshVisibility",
      show: [ref("Ramen_Noodles")],
      hide: [],
    };
    const steps = timedSteps([clip("Joke", [event("Noodle", noodles, 36, 134)])], [10], [30]);

    const timeline = visibilityTimeline(["ramen_noodles", "Hat"], submeshes, steps);

    expect(timeline.map((entry) => [entry.at, [...entry.hidden]])).toEqual([
      [0, ["ramen_noodles", "Hat"]],
      [18, ["Hat"]],
      [67, ["Hat", "ramen_noodles"]],
    ]);
  });

  it("keeps a name the mesh does not spell, and hides a submesh once however many events hide it", () => {
    const hide = (name: string): EventKind => ({
      kind: "submeshVisibility",
      show: [],
      hide: [ref(name)],
    });
    const steps = timedSteps(
      [clip("a", [event("One", hide("kunai"), 0), event("Two", hide("Kunai"), 1)])],
      [1],
      [30],
    );

    const timeline = visibilityTimeline([], submeshes, steps);

    expect(timeline).toEqual([
      { at: 0, hidden: ["kunai"] },
      { at: 0.5, hidden: ["kunai"] },
    ]);
  });

  it("places a later step's events after the steps before it", () => {
    const steps = timedSteps(
      [clip("Run", []), clip("Joke", [event("Noodle", SHOW_NOODLES, 0)])],
      [2, 3],
      [30, 30],
    );

    expect(visibilityTimeline([], submeshes, steps).map((entry) => entry.at)).toEqual([0, 2]);
  });
});

describe("hiddenAt", () => {
  const timeline = [
    { at: 0, hidden: ["a"] },
    { at: 1, hidden: ["b"] },
    { at: 2, hidden: ["c"] },
  ];

  it("answers the last entry the time has reached, the first before any", () => {
    expect(hiddenAt(timeline, 0.5)).toEqual(["a"]);
    expect(hiddenAt(timeline, 1)).toEqual(["b"]);
    expect(hiddenAt(timeline, 9)).toEqual(["c"]);
    expect(hiddenAt([], 3)).toEqual([]);
  });
});
