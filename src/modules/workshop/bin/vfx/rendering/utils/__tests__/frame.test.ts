import { Object3D, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";

import { RENDER_PHASE } from "../../../engine/model/enums";
import type { EmitterModel } from "../../../engine/model/model";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import {
  DISTORTION_LAYER,
  drawLayersOf,
  EARLY_DISTORTION_LAYER,
  GLOW_LAYER,
  leaveLayers,
  PARTICLE_LAYER,
  placeOnLayers,
  SCENE_LAYER,
  seeParticles,
  UNDER_LAYER,
  warpsOf,
} from "../frame";

function layersOf(over: Partial<EmitterModel>): readonly number[] {
  return drawLayersOf(emitterOf(0, over));
}

function warp(mode: number): EmitterModel["distortion"] {
  return { strength: 0.1, mode, map: null };
}

describe("drawLayersOf", () => {
  it("sits a colour emitter on the layer of its phase, under or over the late distortion", () => {
    expect(layersOf({ pass: -1 })).toEqual([UNDER_LAYER]);
    expect(layersOf({ groundLayer: true })).toEqual([UNDER_LAYER]);
    expect(layersOf({ pass: 0 })).toEqual([PARTICLE_LAYER]);
    expect(layersOf({ hudLayer: true, pass: -1 })).toEqual([PARTICLE_LAYER]);
  });

  it("sits a warping emitter on the distortion layer of each phase its block names", () => {
    expect(layersOf({ distortion: warp(1) })).toEqual([DISTORTION_LAYER]);
    expect(layersOf({ distortion: warp(2) })).toEqual([EARLY_DISTORTION_LAYER]);
    expect(layersOf({ distortion: warp(3) })).toEqual([EARLY_DISTORTION_LAYER, DISTORTION_LAYER]);
  });

  it("sits a block of mode zero on a colour layer", () => {
    expect(layersOf({ distortion: warp(0) })).toEqual([PARTICLE_LAYER]);
  });

  it("follows a forced phase rather than the pass or the block", () => {
    expect(layersOf({ renderPhaseOverride: RENDER_PHASE.default, pass: 5 })).toEqual([UNDER_LAYER]);
    expect(layersOf({ renderPhaseOverride: RENDER_PHASE.postDistortion, pass: -5 })).toEqual([
      PARTICLE_LAYER,
    ]);
    expect(
      layersOf({ renderPhaseOverride: RENDER_PHASE.distortionNoCharacter, distortion: warp(1) }),
    ).toEqual([EARLY_DISTORTION_LAYER]);
  });

  it("sits an emitter in no phase on no layer", () => {
    expect(layersOf({ renderPhaseOverride: RENDER_PHASE.shadow })).toEqual([]);
    expect(layersOf({ renderPhaseOverride: RENDER_PHASE.hudLayer })).toEqual([]);
  });
});

describe("seeParticles", () => {
  it("shows a camera both colour phases, and neither distortion layer nor the glow", () => {
    const camera = new PerspectiveCamera();
    seeParticles(camera);

    const seen = (layer: number) => camera.layers.isEnabled(layer);
    expect([SCENE_LAYER, PARTICLE_LAYER, UNDER_LAYER].map(seen)).toEqual([true, true, true]);
    expect([DISTORTION_LAYER, EARLY_DISTORTION_LAYER, GLOW_LAYER].map(seen)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("placeOnLayers", () => {
  it("puts an object on its layers alone, and off the scene's", () => {
    const object = new Object3D();
    placeOnLayers(new Scene(), object, [EARLY_DISTORTION_LAYER, DISTORTION_LAYER]);

    const on = (layer: number) => object.layers.isEnabled(layer);
    expect([EARLY_DISTORTION_LAYER, DISTORTION_LAYER].map(on)).toEqual([true, true]);
    expect([SCENE_LAYER, PARTICLE_LAYER, UNDER_LAYER].map(on)).toEqual([false, false, false]);
  });

  it("tells the scene which warp passes it holds an emitter for, until the object leaves", () => {
    const scene = new Scene();
    const early = new Object3D();
    const late = new Object3D();
    expect(warpsOf(scene)).toEqual({ early: false, late: false });

    placeOnLayers(scene, early, [EARLY_DISTORTION_LAYER]);
    expect(warpsOf(scene)).toEqual({ early: true, late: false });

    placeOnLayers(scene, late, [DISTORTION_LAYER]);
    expect(warpsOf(scene)).toEqual({ early: true, late: true });

    placeOnLayers(scene, early, [UNDER_LAYER]);
    expect(warpsOf(scene)).toEqual({ early: false, late: true });

    leaveLayers(scene, late);
    expect(warpsOf(scene)).toEqual({ early: false, late: false });
  });
});
