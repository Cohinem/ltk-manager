import type { MapController, MapParticle } from "@/lib/tauri";
import { layerVisibility, mapVisibility } from "@/modules/viewport";

import { particleAnchor, particlesBySystem, particleSeed, playedParticles } from "../mapParticles";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function particle(
  overrides: Partial<MapParticle> & { at?: [number, number, number] },
): MapParticle {
  const { at = [0, 0, 0], ...rest } = overrides;
  const transform = [...IDENTITY];
  transform[12] = at[0];
  transform[13] = at[1];
  transform[14] = at[2];
  return {
    chunk: "0x0000000c",
    key: "0x00000001",
    name: "Brazier1",
    system: "0x00000001",
    transform: transform as MapParticle["transform"],
    visibility: 255,
    controller: null,
    transitional: false,
    startDisabled: false,
    ...rest,
  };
}

describe("playedParticles", () => {
  it("plays what stands under the flags, wherever on the map it stands", () => {
    const near = particle({ name: "Near", at: [7000, 50, 7000] });
    const far = particle({ name: "Far", at: [14000, 50, 900] });
    const mountain = particle({ name: "Mountain", at: [7000, 50, 7000], visibility: 4 });

    expect(playedParticles([near, far, mountain], layerVisibility(1))).toEqual([near, far]);
  });

  it("plays another layer's particle once its flag is on", () => {
    const near = particle({ name: "Near" });
    const mountain = particle({ name: "Mountain", visibility: 4 });

    expect(playedParticles([near, mountain], layerVisibility(0b0000_0101))).toEqual([
      near,
      mountain,
    ]);
  });

  it("leaves out what an event the backdrop is not in turns on", () => {
    const events = [
      particle({ name: "Transition", transitional: true }),
      particle({ name: "Scripted", startDisabled: true }),
      particle({ name: "Trophy", controller: "0x8f1ab207" }),
    ];

    expect(playedParticles(events, layerVisibility(1))).toEqual([]);
  });

  it("plays a particle whose controller is visible and ignores its mask", () => {
    const controllers: MapController[] = [
      {
        hash: "0x3c5b24f7",
        name: null,
        rule: { kind: "named", defaultVisible: false, terrain: 8, stage: 0 },
      },
      {
        hash: "0x5e652742",
        name: null,
        rule: { kind: "child", parents: ["0x3c5b24f7"], mode: "none" },
      },
      { hash: "0x8f1ab207", name: null, rule: { kind: "mutator", name: "MSITrophy" } },
    ];
    const base = particle({ name: "Base", visibility: 4, controller: "0x5e652742" });
    const ocean = particle({ name: "Ocean", controller: "0x3c5b24f7" });
    const trophy = particle({ name: "Trophy", controller: "0x8f1ab207" });

    expect(playedParticles([base, ocean, trophy], mapVisibility(controllers, 1))).toEqual([base]);
    expect(playedParticles([base, ocean, trophy], mapVisibility(controllers, 8))).toEqual([ocean]);
  });

  it("plays an event the reader picked, whatever turns it on", () => {
    const trophy = particle({ name: "Trophy", key: "0x00000007", controller: "0x8f1ab207" });
    const picked = new Set(["0x0000000c/0x00000007"]);

    expect(playedParticles([trophy], layerVisibility(1), false, picked)).toEqual([trophy]);
  });

  it("plays what a script or a controller turns on once events play, and never a transition", () => {
    const events = [
      particle({ name: "Transition", transitional: true }),
      particle({ name: "Scripted", startDisabled: true }),
      particle({ name: "Trophy", controller: "0x8f1ab207" }),
    ];

    expect(playedParticles(events, layerVisibility(1), true).map((each) => each.name)).toEqual([
      "Scripted",
      "Trophy",
    ]);
  });
});

describe("particlesBySystem", () => {
  it("gathers every place a map stands one system", () => {
    const first = particle({ name: "Brazier1" });
    const other = particle({ name: "Mushroom1", system: "0x00000002" });
    const second = particle({ name: "Brazier2" });

    expect([...particlesBySystem([first, other, second])]).toEqual([
      ["0x00000001", [first, second]],
      ["0x00000002", [other]],
    ]);
  });
});

describe("particleAnchor", () => {
  it("stands where the transform's last column says", () => {
    const anchor = particleAnchor(particle({ at: [10145, -73, 3866] }));

    expect(anchor.originAt(0)).toEqual([10145, -73, 3866]);
    expect(anchor.originAt(12)).toEqual([10145, -73, 3866]);
  });

  it("turns as the transform's columns do, with the scale taken out", () => {
    /* A quarter turn about Y at twice the size: local +X lands on world -Z. */
    const turned = particle({});
    const transform = [0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1];
    const anchor = particleAnchor({
      ...turned,
      transform: transform as MapParticle["transform"],
    });

    const basis = anchor.basisInto(0, new Float32Array(9));

    expect([...basis]).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);
  });

  it("reads a component JSON could not carry as zero", () => {
    const broken = particle({});
    const transform = [...IDENTITY] as MapParticle["transform"];
    transform[12] = null;

    expect(particleAnchor({ ...broken, transform }).originAt(0)).toEqual([0, 0, 0]);
  });
});

describe("particleSeed", () => {
  it("tells two placeables of one system apart and one from itself never", () => {
    expect(particleSeed("Brazier1")).toBe(particleSeed("Brazier1"));
    expect(particleSeed("Brazier1")).not.toBe(particleSeed("Brazier2"));
  });
});
