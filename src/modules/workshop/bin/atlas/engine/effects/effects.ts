import type { UiShader } from "@/lib/tauri";

import type { DrawnEffect } from "../commands/types";
import type { ViewEffect } from "../model/view";

/**
 * Each effect's passes and constants, per section 6 of docs/plans/atlas-renderer.md, with the
 * constants read off the translated shaders. `live` is the one input the controller drives at
 * run time, a cooldown's progress or a fill's percentage, from 0 to 1.
 */

/** `$Globals` members by name, each up to four floats. */
export type Constants = Readonly<Record<string, readonly number[]>>;

const TAU = Math.PI * 2;

/** The programs an effect draws with, in draw order, and the shape of each pass. */
export interface EffectPass {
  readonly shader: UiShader;
  readonly primitive: "triangles" | "lineStrip";
  /** The quad samples the sprite's UV rather than 0 to 1 over the element. */
  readonly spriteUv: boolean;
}

const quad = (shader: UiShader, spriteUv = true): EffectPass => ({
  shader,
  primitive: "triangles",
  spriteUv,
});

const hand = (shader: UiShader): EffectPass => ({
  shader,
  primitive: "lineStrip",
  spriteUv: false,
});

/**
 * The passes of `effect`. Line, rotating icons and instancing place their geometry by run-time
 * transforms that were not traced, so each draws its sprite as a plain quad.
 */
export function effectPasses(effect: ViewEffect): readonly EffectPass[] {
  switch (effect.effect) {
    case "cooldown":
      return [quad("cooldown", false), hand("cooldownLine")];
    case "ammo":
      return [quad("ammo", false), hand("ammoLine")];
    case "circleMaskCooldown":
      return [quad("circleMaskCooldown", false), hand("cooldownLine")];
    case "cooldownRadial":
      return [quad(effect.fill ? "cooldownRadialFill" : "cooldownRadial")];
    case "arcFill":
      return [quad("arcFill")];
    case "glow":
      return [quad("glow")];
    case "glowConstant":
      return [quad("glowConstant")];
    case "animation":
    case "animatedRotatingIcon":
      return [quad("animation")];
    case "fillPercentage":
      return [quad("fillPercentage")];
    case "desaturate":
      return [quad("desaturate")];
    case "circleMaskDesaturate":
      return [quad("circleMaskDesaturate")];
    case "line":
    case "rotatingIcon":
    case "glowingRotatingIcon":
    case "instanced":
      return [quad("blend")];
    case "customMaterial":
      return [];
  }
}

/** Whether `effect` changes with the clock, which keeps the frame loop running. */
export function isTimed(effect: ViewEffect): boolean {
  switch (effect.effect) {
    case "glow":
      return effect.cycleTime > 0;
    case "animation":
    case "animatedRotatingIcon":
      return effect.fps > 0 && effect.frames > 1;
    default:
      return false;
  }
}

/**
 * The part of the sprite a fill mask quad samples, as a fraction of its UV. A flipbook's sprite
 * is its first frame, which it samples whole.
 */
export function frameFraction(effect: ViewEffect): readonly [number, number] {
  switch (effect.effect) {
    case "fillPercentage":
      return [0.5, 1];
    default:
      return [1, 1];
  }
}

/** The constants `drawn` reads at `time` seconds with the live input at `live`. */
export function effectConstants(drawn: DrawnEffect, time: number, live: number): Constants {
  const { effect, pass } = drawn;
  const angle = live * TAU;

  switch (effect.effect) {
    case "cooldown":
    case "ammo":
    case "circleMaskCooldown": {
      if (pass === 1) {
        return { angleParams: angleParams(angle, effect.effect !== "circleMaskCooldown") };
      }
      return {
        params: [angle, 0, 0, 0],
        color0: unit(effect.color0),
        color1: unit(effect.color1),
      };
    }
    case "cooldownRadial":
      return { params: [angle, effect.fill ? 0 : 0.05, 0, 0], color0: [1, 1, 1, 1] };
    case "arcFill":
      return { params: [0, angle, 0, 1] };
    case "glow": {
      const phase = effect.cycleTime > 0 ? (time % effect.cycleTime) / effect.cycleTime : 0;
      const scale = phase * effect.cycleScale + effect.baseScale;
      const alpha = Math.sin(TAU * phase) * (1 - effect.minimumAlpha) + effect.minimumAlpha;
      return {
        glowVSParams: [drawn.centre[0], drawn.centre[1], scale, 0],
        glowPSParams: [alpha, 0, 0, 0],
      };
    }
    case "glowConstant":
      return { glowPSParams: [lerp(effect.minimum, effect.maximum, live), 0, 0, 0] };
    case "animation":
    case "animatedRotatingIcon": {
      /* A frame and the one texel between frames, per `0x1413BE670`. */
      const stepU = drawn.uvSize[0] + drawn.texel[0];
      const stepV = drawn.uvSize[1] + drawn.texel[1];
      const perRow = Math.max(1, effect.perRow);
      const frames = Math.max(1, effect.frames);
      const frame = Math.floor(time * effect.fps) % frames;
      return {
        animationVSParams: [(frame % perRow) * stepU, Math.floor(frame / perRow) * stepV, 0, 0],
      };
    }
    case "fillPercentage":
      return { fillVSParams: [drawn.uvSize[0] * 0.5, 0, 0, 0], params: [live, 0, 0, 0] };
    case "desaturate":
    case "circleMaskDesaturate":
      return { params: [lerp(effect.minimum, effect.maximum, live), 0, 0, 0] };
    default:
      return {};
  }
}

/**
 * A cooldown hand's direction from the top clockwise by `angle`, and the stretch that takes a
 * unit direction to the edge of the square. The circle mask reaches its circle instead.
 */
function angleParams(angle: number, toSquare: boolean): readonly number[] {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const reach = toSquare ? 1 / Math.max(Math.abs(sin), Math.abs(cos), 1e-6) : 1;
  return [-sin, -cos, reach, 0];
}

function unit(color: readonly number[]): readonly number[] {
  return color.map((channel) => channel / 255);
}

function lerp(from: number, to: number, at: number): number {
  return from + (to - from) * at;
}
