import { describe, expect, it } from "vitest";

import type { MapSun } from "@/lib/tauri";

import { DEFAULT_SUN, sunAngles, sunDirection, sunLightOf } from "../sunLight";

/** Summoner's Rift, as `Base_SRX` states it on 16.18. */
const RIFT: MapSun = {
  direction: [-0.25, 0.75, -0.05],
  color: [1, 1, 1, 1],
  intensity: 1,
  skyColor: [1, 1, 1, 1],
  groundColor: [1, 1, 1, 1],
  skyScale: 1,
};

describe("sunLightOf", () => {
  it("splits the light between sun and sky so the shares add up to one", () => {
    const light = sunLightOf({ ...RIFT, intensity: 1, skyScale: 1.5 });

    expect(light.strength).toBeCloseTo(0.4);
    expect(light.ambient).toBeCloseTo(0.6);
  });

  it("points the sun at unit length whatever length the map writes", () => {
    const [x, y, z] = sunLightOf({ ...RIFT, direction: [-1.5, 1, 0.9] }).direction;

    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
  });

  it("splits evenly for a map that scales both sun and sky to zero", () => {
    const light = sunLightOf({ ...RIFT, intensity: 0, skyScale: 0 });

    expect(light.strength).toBe(0.5);
    expect(light.ambient).toBe(0.5);
  });

  it("keeps the sky and ground colours the map writes and drops their alpha", () => {
    const light = sunLightOf({
      ...RIFT,
      skyColor: [0.2, 0.4, 0.6, 1],
      groundColor: [0.1, 0, 0, 1],
    });

    expect(light.sky).toEqual([0.2, 0.4, 0.6]);
    expect(light.ground).toEqual([0.1, 0, 0]);
  });

  it("points the rift's sun the same way as the default", () => {
    expect(sunLightOf(RIFT).direction).toEqual(DEFAULT_SUN.direction);
  });
});

describe("sunAngles", () => {
  it("round-trips a direction through its bearing and height", () => {
    const direction = DEFAULT_SUN.direction;
    const [x, y, z] = sunDirection(sunAngles(direction));

    expect(x).toBeCloseTo(direction[0]);
    expect(y).toBeCloseTo(direction[1]);
    expect(z).toBeCloseTo(direction[2]);
  });

  it("reads straight along +Z as bearing zero on the horizon", () => {
    expect(sunAngles([0, 0, 1])).toEqual({ azimuth: 0, elevation: 0 });
  });
});
