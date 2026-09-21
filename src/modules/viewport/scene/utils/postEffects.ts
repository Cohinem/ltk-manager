import type { MapFog, MapPostEffects } from "@/lib/tauri";

import type { SunColor } from "./sunLight";

/** One fog of a scene, ramping from nothing at `start` to `maxIntensity` at `end`. */
export interface Fog {
  readonly enabled: boolean;
  readonly color: SunColor;
  /** A distance from the camera for the depth fog, and a height in the world for the height fog. */
  readonly start: number;
  readonly end: number;
  /** The most the fog covers, 0 to 1. */
  readonly maxIntensity: number;
}

/** A scene's blur by distance from the camera. */
export interface DepthOfField {
  readonly enabled: boolean;
  /** The distance from the camera that is sharpest. */
  readonly focalDistance: number;
  /** How deep the sharp band around `focalDistance` is. */
  readonly inFocusWidth: number;
  /** The widest the blur grows, in pixels of a 1080-pixel-tall frame. */
  readonly coc: number;
}

/** The screen effects of a scene, in the viewport's own terms. */
export interface PostEffects {
  readonly depthFog: Fog;
  readonly heightFog: Fog;
  readonly depthOfField: DepthOfField;
}

/** The class defaults of `PostEffectOptions`, which switch every effect off. */
export const NO_POST_EFFECTS: PostEffects = {
  depthFog: { enabled: false, color: [0, 0, 0], start: 5000, end: 8000, maxIntensity: 1 },
  heightFog: { enabled: false, color: [0, 0, 0], start: 300, end: -100, maxIntensity: 1 },
  depthOfField: { enabled: false, focalDistance: 2000, inFocusWidth: 800, coc: 10 },
};

/** The effects a map's own `PostEffectOptions` states, with any unread field at its default. */
export function postEffectsOf(effects: MapPostEffects): PostEffects {
  const focus = NO_POST_EFFECTS.depthOfField;
  return {
    depthFog: fogOf(effects.depthFog, NO_POST_EFFECTS.depthFog),
    heightFog: fogOf(effects.heightFog, NO_POST_EFFECTS.heightFog),
    depthOfField: {
      enabled: effects.depthOfField.enabled,
      focalDistance: effects.depthOfField.focalDistance ?? focus.focalDistance,
      inFocusWidth: effects.depthOfField.inFocusWidth ?? focus.inFocusWidth,
      coc: effects.depthOfField.coc ?? focus.coc,
    },
  };
}

/** Whether `effects` switches on anything a frame has to be drawn again for. */
export function drawsPostEffects(effects: PostEffects): boolean {
  return effects.depthFog.enabled || effects.heightFog.enabled || effects.depthOfField.enabled;
}

function fogOf(fog: MapFog, stated: Fog): Fog {
  const [r, g, b] = fog.color;
  return {
    enabled: fog.enabled,
    color: [r ?? stated.color[0], g ?? stated.color[1], b ?? stated.color[2]],
    start: fog.start ?? stated.start,
    end: fog.end ?? stated.end,
    maxIntensity: fog.maxIntensity ?? stated.maxIntensity,
  };
}
