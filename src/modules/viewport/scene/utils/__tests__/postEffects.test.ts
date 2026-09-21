import { describe, expect, it } from "vitest";

import type { MapPostEffects } from "@/lib/tauri";

import { drawsPostEffects, NO_POST_EFFECTS, postEffectsOf } from "../postEffects";

/** A map stating a blue depth fog and nothing else, as `read_map` hands it over. */
const FOGGED: MapPostEffects = {
  depthFog: { enabled: true, color: [0.2, 0.3, 0.9, 1], start: 1000, end: 4000, maxIntensity: 0.5 },
  heightFog: { enabled: false, color: [0, 0, 0, 1], start: 300, end: -100, maxIntensity: 1 },
  depthOfField: { enabled: false, focalDistance: 2000, inFocusWidth: 800, coc: 10 },
};

describe("postEffectsOf", () => {
  it("carries each fog's colour without its alpha", () => {
    const effects = postEffectsOf(FOGGED);

    expect(effects.depthFog).toEqual({
      enabled: true,
      color: [0.2, 0.3, 0.9],
      start: 1000,
      end: 4000,
      maxIntensity: 0.5,
    });
  });

  it("reads a field the IPC types as null at the class default", () => {
    const effects = postEffectsOf({
      ...FOGGED,
      heightFog: { ...FOGGED.heightFog, start: null, color: [null, 0.5, null, 1] },
      depthOfField: { ...FOGGED.depthOfField, coc: null },
    });

    expect(effects.heightFog.start).toBe(NO_POST_EFFECTS.heightFog.start);
    expect(effects.heightFog.color).toEqual([0, 0.5, 0]);
    expect(effects.depthOfField.coc).toBe(NO_POST_EFFECTS.depthOfField.coc);
  });
});

describe("drawsPostEffects", () => {
  it("draws nothing at the class defaults", () => {
    expect(drawsPostEffects(NO_POST_EFFECTS)).toBe(false);
  });

  it("draws once any one effect is on", () => {
    expect(drawsPostEffects(postEffectsOf(FOGGED))).toBe(true);
    expect(
      drawsPostEffects({
        ...NO_POST_EFFECTS,
        depthOfField: { ...NO_POST_EFFECTS.depthOfField, enabled: true },
      }),
    ).toBe(true);
  });
});
