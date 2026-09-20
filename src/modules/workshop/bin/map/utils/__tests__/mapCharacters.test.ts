import type { GraphClip, MapCharacter } from "@/lib/tauri";

import {
  charactersByAnimation,
  charactersBySkin,
  idleClip,
  sceneMatrix,
  skinFile,
  stoodCharacters,
} from "../mapCharacters";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function character(overrides: Partial<MapCharacter>): MapCharacter {
  return {
    chunk: "0x0000000c",
    key: "0x00000001",
    name: "0x00000001",
    skin: "Characters/Turret/Skins/Skin0",
    transform: IDENTITY as MapCharacter["transform"],
    visibility: 255,
    controller: null,
    team: null,
    animation: null,
    ...overrides,
  };
}

describe("stoodCharacters", () => {
  it("stands a team's structures and the props that state no team", () => {
    const order = character({ name: "Order" });
    const chaos = character({ name: "Chaos", team: 200 });

    expect(stoodCharacters([order, chaos], 0)).toEqual([order, chaos]);
  });

  it("leaves out a camp's monsters, another layer's and what a controller turns on", () => {
    const left = [
      character({ name: "Dragon", team: 300 }),
      character({ name: "Mountain", visibility: 4 }),
      character({ name: "Banner", controller: "0x76c50391" }),
    ];

    expect(stoodCharacters(left, 0)).toEqual([]);
  });
});

describe("charactersBySkin", () => {
  it("gathers every place a map stands one skin", () => {
    const first = character({ name: "A" });
    const other = character({ name: "B", skin: "Characters/Nexus/Skins/Skin0" });
    const second = character({ name: "C" });

    expect([...charactersBySkin([first, other, second])]).toEqual([
      ["Characters/Turret/Skins/Skin0", [first, second]],
      ["Characters/Nexus/Skins/Skin0", [other]],
    ]);
  });
});

function clip(name: string, hash: string): GraphClip {
  return {
    name,
    hash,
    class: "AtomicClipData",
    animation: { path: `${name}.anm`, asset: null },
    track: null,
    mask: null,
    syncGroup: null,
    tickDuration: null,
    events: [],
    children: [],
    parameters: [],
    interruptionGroups: [],
    flags: 0,
  };
}

describe("charactersByAnimation", () => {
  it("poses the placements naming one clip together, whatever its case", () => {
    const idle = character({ name: "A" });
    const flap = character({ name: "B", animation: "Flap" });
    const other = character({ name: "C", animation: "flap" });

    expect([...charactersByAnimation([idle, flap, other])]).toEqual([
      [null, [idle]],
      ["flap", [flap, other]],
    ]);
  });
});

describe("idleClip", () => {
  const clips = [clip("Run", "0x1"), clip("Idle1", "0x2"), clip("Flap", "0x3")];

  it("stands in the clip the map names, without regard to case", () => {
    expect(idleClip(clips, "flap")?.hash).toBe("0x3");
  });

  it("idles where the map names none, and where it names one the graph lacks", () => {
    expect(idleClip(clips, null)?.hash).toBe("0x2");
    expect(idleClip(clips, "Dance")?.hash).toBe("0x2");
  });

  it("stands in the bind pose where the graph holds no idle", () => {
    expect(idleClip([clip("Run", "0x1")], null)).toBeNull();
  });
});

describe("skinFile", () => {
  it("spells the bin a skin's entry path lives in", () => {
    expect(skinFile("Characters/Srx_Banner_VerticalThin/Skins/Skin0")).toBe(
      "data/characters/srx_banner_verticalthin/skins/skin0.bin",
    );
  });
});

describe("sceneMatrix", () => {
  it("mirrors where the placeable stands and leaves an upright one upright", () => {
    const transform = [...IDENTITY];
    transform[12] = 1748;
    transform[13] = 95;
    transform[14] = 2270;

    const matrix = sceneMatrix(transform);

    expect(matrix.slice(12, 15)).toEqual([-1748, 95, 2270]);
    expect(matrix.slice(0, 12).map((value) => value + 0)).toEqual(IDENTITY.slice(0, 12));
  });

  it("turns a yaw the other way round, as a mirror does", () => {
    /* A quarter turn about Y: local +X lands on -Z. */
    const turned = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];

    expect(sceneMatrix(turned).map((value) => value + 0)).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });
});
