import type { MapSsao } from "@/lib/tauri";

/** A scene's screen-space ambient occlusion, which darkens a pixel by how much scene closes over it. */
export interface AmbientOcclusion {
  readonly enabled: boolean;
  /** 0 for four samples a pixel and 1 for eight, as `SampleQuality` counts them. */
  readonly sampleQuality: number;
  /** How far from a pixel its samples reach, in world units. */
  readonly sampleRadius: number;
  /** How far in front of a sample the scene must be to occlude it, in world units. */
  readonly bias: number;
  /** The exponent the unoccluded share of a pixel is raised to. */
  readonly power: number;
  /** How much of the occlusion reaches the frame, 0 to 1. */
  readonly intensity: number;
  /** The occlusion's resolution as a share of the frame's. */
  readonly bufferScale: number;
  /** The blur keeps a nearer surface's occlusion off the one behind it. */
  readonly edgeAwareBlur: boolean;
}

/** The class defaults of `MapSSAOSettings`, off as on a map with no `MapSSAO`. */
export const NO_AMBIENT_OCCLUSION: AmbientOcclusion = {
  enabled: false,
  sampleQuality: 0,
  sampleRadius: 25,
  bias: 3,
  power: 1,
  intensity: 1,
  bufferScale: 0.5,
  edgeAwareBlur: true,
};

/** The occlusion a map's own `MapSSAO` states, on, with any unread field at its default. */
export function ambientOcclusionOf(ssao: MapSsao): AmbientOcclusion {
  const stated = NO_AMBIENT_OCCLUSION;
  return {
    enabled: true,
    sampleQuality: ssao.sampleQuality,
    sampleRadius: ssao.sampleRadius ?? stated.sampleRadius,
    bias: ssao.bias ?? stated.bias,
    power: ssao.power ?? stated.power,
    intensity: ssao.intensity ?? stated.intensity,
    bufferScale: ssao.bufferScale ?? stated.bufferScale,
    edgeAwareBlur: ssao.edgeAwareBlur,
  };
}

/** How many samples each pixel gathers, 4 or 8 as the game's two shader permutations do. */
export function occlusionSamples(occlusion: AmbientOcclusion): 4 | 8 {
  return occlusion.sampleQuality === 0 ? 4 : 8;
}

/** Whether `occlusion` darkens anything a frame has to be drawn again for. */
export function drawsAmbientOcclusion(occlusion: AmbientOcclusion): boolean {
  return occlusion.enabled && occlusion.intensity > 0 && occlusion.sampleRadius > 0;
}
