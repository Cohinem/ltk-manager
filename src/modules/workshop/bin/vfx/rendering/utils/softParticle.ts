import { SOFT_TARGET, type SoftTarget } from "../../engine/model/enums";
import type { EmitterModel, SoftModel } from "../../engine/model/model";
import { drawsFixedAlphaUv, drawsTheAttachment } from "./drawKind";

/** Four lanes of a shader constant, in the order the shader reads them. */
type Lanes = readonly [number, number, number, number];

/** Where a fade out the emitter does not ask for starts, past any gap a scene leaves. */
const NO_FADE_OUT = 1e8;

/** The least width a fade runs over, which keeps its rate finite. */
const LEAST_DELTA = 1e-8;

/**
 * The soft fade an emitter's draw path runs, and null where its shader compiles none.
 *
 * `skinnedmesh/particle_ps` carries no `SOFT_PARTICLES`, and a quad under `LOCK_ALPHA`
 * draws through `quad_ps_fixedalphauv`, which carries none either. A ribbon shares the
 * quad's batch, so it follows the quad. Decision 2.43 of docs/plans/vfx-particle-renderer.md.
 */
export function fadeOf(emitter: EmitterModel): SoftModel | null {
  if (emitter.soft === null || drawsTheAttachment(emitter) || drawsFixedAlphaUv(emitter)) {
    return null;
  }
  return emitter.soft;
}

/** The emitter's draw path runs a soft fade, which needs the scene's depth pass. */
export function fades(emitter: EmitterModel): boolean {
  return fadeOf(emitter) !== null;
}

/**
 * `cSoftParticleParams`: where the fade in and the fade out start, then the rate of each.
 *
 * Both starts are gaps to the scene in their own right, `beginIn` and `beginOut`. A
 * `beginOut` at or under zero asks for no fade out. Decision 2.43 of
 * docs/plans/vfx-particle-renderer.md.
 */
export function softParams(soft: SoftModel): Lanes {
  return [
    soft.beginIn,
    soft.beginOut <= 0 ? NO_FADE_OUT : soft.beginOut,
    1 / Math.max(soft.deltaIn, LEAST_DELTA),
    1 / Math.max(soft.deltaOut, LEAST_DELTA),
  ];
}

/** `cSoftParticleControl`, as `rgb * (x + fade * y)` and `a * (z + fade * w)` read it. */
const FADES = {
  alpha: [1, 0, 0, 1],
  both: [0, 1, 0, 1],
  colour: [0, 1, 1, 0],
} as const satisfies Record<string, Lanes>;

/**
 * `cSoftParticleControl` for `target`: what the block's own byte says the fade reaches,
 * the colour and the alpha unless it names one of them.
 */
export function softControl(target: SoftTarget): Lanes {
  if (target === SOFT_TARGET.alpha) return FADES.alpha;
  if (target === SOFT_TARGET.colour) return FADES.colour;
  return FADES.both;
}
