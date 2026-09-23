import { describe, expect, it } from "vitest";

import type { MapSsao } from "@/lib/tauri";

import {
  ambientOcclusionOf,
  drawsAmbientOcclusion,
  NO_AMBIENT_OCCLUSION,
  occlusionSamples,
} from "../ambientOcclusion";

/** Map12 Crepe's own settings, as `read_map` hands them over. */
const CREPE: MapSsao = {
  sampleQuality: 1,
  sampleRadius: 75,
  bias: 3,
  power: 20,
  intensity: 1,
  bufferScale: 0.5,
  edgeAwareBlur: true,
};

describe("ambientOcclusionOf", () => {
  it("switches on the occlusion a map states", () => {
    expect(ambientOcclusionOf(CREPE)).toEqual({ ...CREPE, enabled: true });
  });

  it("reads a field the IPC types as null at the class default", () => {
    const occlusion = ambientOcclusionOf({ ...CREPE, sampleRadius: null, power: null });

    expect(occlusion.sampleRadius).toBe(NO_AMBIENT_OCCLUSION.sampleRadius);
    expect(occlusion.power).toBe(NO_AMBIENT_OCCLUSION.power);
  });
});

describe("occlusionSamples", () => {
  it("gathers four samples at quality 0 and eight above it", () => {
    expect(occlusionSamples({ ...NO_AMBIENT_OCCLUSION, sampleQuality: 0 })).toBe(4);
    expect(occlusionSamples({ ...NO_AMBIENT_OCCLUSION, sampleQuality: 1 })).toBe(8);
  });
});

describe("drawsAmbientOcclusion", () => {
  it("draws nothing at the class defaults", () => {
    expect(drawsAmbientOcclusion(NO_AMBIENT_OCCLUSION)).toBe(false);
  });

  it("draws once on, and not at no intensity", () => {
    const on = ambientOcclusionOf(CREPE);

    expect(drawsAmbientOcclusion(on)).toBe(true);
    expect(drawsAmbientOcclusion({ ...on, intensity: 0 })).toBe(false);
  });
});
