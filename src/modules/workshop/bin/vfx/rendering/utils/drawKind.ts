import {
  BLEND_MODE,
  type BlendMode,
  DISTORTION_MODE,
  QUAD_TYPE,
  RENDER_PHASE,
  UV_MODE,
} from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";

/**
 * The emitters in the order the engine draws them, as a rank per emitter index.
 *
 * The engine's draw order inside one render phase: `pass` ascending, a complex emitter
 * before a simple one of the same `pass`, then the blend mode's rank, then
 * `miscRenderFlags` as a byte, then the emitter's own place. A position comparison sits
 * between the blend rank and the byte and compares the system's position, which every
 * emitter of one system shares.
 *
 * The ground layer's phase draws before the default one. The default phase holds the
 * negative passes and the post-distortion phase the rest, so `pass` ascending is their
 * order across the two as well.
 */
export function drawRanks(emitters: readonly EmitterModel[]): ReadonlyMap<number, number> {
  const order = [...emitters].sort(compareDrawOrder);
  return new Map(order.map((emitter, rank) => [emitter.index, rank]));
}

/**
 * The draw order a ground-layer emitter's rank counts up from, under everything else.
 *
 * The engine draws its ground display list before a character, and ThreeJS draws every
 * transparent object after every opaque one, so a ground-layer emitter draws as an opaque
 * object at this order, over the stage's `STAGE_ORDER` and under the character at zero.
 */
export const GROUND_ORDER = -1_000_000;

/** Negative where `left` draws before `right`, per the engine's comparator. */
export function compareDrawOrder(left: EmitterModel, right: EmitterModel): number {
  return (
    Number(right.groundLayer) - Number(left.groundLayer) ||
    left.pass - right.pass ||
    Number(left.simple) - Number(right.simple) ||
    blendRank(left.blendMode) - blendRank(right.blendMode) ||
    left.miscRenderFlags - right.miscRenderFlags ||
    left.index - right.index
  );
}

/** The comparator's remap of each blend mode, in enum order. */
const BLEND_RANK = [1, 2, 1, 0, 2, 2, 2, 2, 3] as const;

function blendRank(mode: BlendMode): number {
  return BLEND_RANK[mode] ?? BLEND_RANK[BLEND_MODE.add];
}

/** Where in a frame an emitter draws: one colour phase, or the distortion phases. */
export interface DrawPhases {
  /**
   * The colour phase: `under` draws before the late distortion, the engine's default and
   * ground-layer phases, and `over` after it, its post-distortion and HUD phases.
   */
  readonly colour: "under" | "over" | null;
  /** The emitter warps the frame before any particle draws, the no-character phase. */
  readonly warpsEarly: boolean;
  /** The emitter warps the frame between the two colour phases. */
  readonly warpsLate: boolean;
}

const NO_PHASE: DrawPhases = { colour: null, warpsEarly: false, warpsLate: false };
const UNDER: DrawPhases = { colour: "under", warpsEarly: false, warpsLate: false };
const OVER: DrawPhases = { colour: "over", warpsEarly: false, warpsLate: false };

/**
 * The render phases `emitter` draws in.
 *
 * `renderPhaseOverride` forces one phase and drops every other rule, and a value naming
 * no phase draws nowhere. Left automatic, a HUD-layer emitter draws in the HUD's phase
 * alone, a ground-layer one in the ground's, and one with an active distortion block in
 * the distortion phases alone. Every other emitter draws by the sign of its `pass`:
 * negative before the late distortion, and zero or more after it. The shadow phase is
 * not drawn, so an emitter forced into it draws nothing.
 */
export function drawPhases(emitter: EmitterModel): DrawPhases {
  const custom = emitter.customMaterial != null && !emitter.customMaterial.missing;
  const warps = emitter.distortion !== null && !custom;

  switch (emitter.renderPhaseOverride) {
    case RENDER_PHASE.automatic:
      break;
    case RENDER_PHASE.default:
    case RENDER_PHASE.groundLayer:
      return UNDER;
    case RENDER_PHASE.postDistortion:
      return OVER;
    case RENDER_PHASE.hudLayer:
      return emitter.hudLayer ? OVER : NO_PHASE;
    case RENDER_PHASE.distortionNoCharacter:
      return warps ? { colour: null, warpsEarly: true, warpsLate: false } : NO_PHASE;
    case RENDER_PHASE.distortionAll:
      return warps ? { colour: null, warpsEarly: false, warpsLate: true } : NO_PHASE;
    default:
      return NO_PHASE;
  }

  if (emitter.hudLayer) return OVER;
  if (emitter.groundLayer) return UNDER;

  const mode = emitter.distortion?.mode ?? 0;
  if (warps && mode !== 0) {
    return {
      colour: null,
      warpsEarly: (mode & DISTORTION_MODE.noCharacter) !== 0,
      warpsLate: (mode & DISTORTION_MODE.all) !== 0,
    };
  }
  return emitter.pass < 0 ? UNDER : OVER;
}

/** The primitive kinds a simple emitter draws. It simulates the rest and draws nothing. */
const SIMPLE_DRAWN: ReadonlySet<number | null> = new Set([
  QUAD_TYPE.cameraQuad,
  QUAD_TYPE.arbitraryQuad,
  QUAD_TYPE.mesh,
  QUAD_TYPE.planarProjection,
  QUAD_TYPE.attachedMesh,
]);

/** The emitter's list draws its primitive kind, and the emitter is in some render phase. */
function reachesAPhase(emitter: EmitterModel): boolean {
  if (emitter.simple && !SIMPLE_DRAWN.has(emitter.quadType)) return false;

  const phases = drawPhases(emitter);
  return phases.colour !== null || phases.warpsEarly || phases.warpsLate;
}

/**
 * The emitter draws as a quad.
 *
 * A camera quad faces the eye, an arbitrary quad stands in the world, and a ray is a quad
 * laid along the particle's own `+Z` that turns to face the eye about that axis. An
 * emitter naming no primitive draws as a camera quad, because that is the kind the enum
 * defaults to.
 */
export function drawsAsQuad(emitter: EmitterModel): boolean {
  return (
    reachesAPhase(emitter) &&
    (emitter.quadType === QUAD_TYPE.cameraQuad ||
      emitter.quadType === QUAD_TYPE.cameraUnitQuad ||
      emitter.quadType === QUAD_TYPE.arbitraryQuad ||
      emitter.quadType === QUAD_TYPE.ray)
  );
}

/**
 * The emitter warps the screen behind it instead of drawing into a colour phase.
 *
 * Its geometry is whichever kind it already is, so it draws through the same path with
 * the distortion material and on the distortion layers. A block whose `distortionMode` is
 * zero warps nothing, and its emitter draws as any other. Decision 2.25 of
 * docs/plans/vfx-particle-renderer.md.
 */
export function distorts(emitter: EmitterModel): boolean {
  const phases = drawPhases(emitter);
  return phases.warpsEarly || phases.warpsLate;
}

/** The quad faces the eye rather than standing on its own orientation. */
export function facesTheCamera(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.cameraQuad || emitter.quadType === QUAD_TYPE.cameraUnitQuad;
}

/**
 * The quad spans half what every other kind spans, which is what makes it the unit.
 *
 * One builder serves both camera kinds and differs in one factor, `0.5` for
 * `CAMERA_UNIT_QUAD` against `1.0` for the rest, so a camera quad measures `2 * scale0`
 * across and this one measures `scale0`.
 */
export function isUnitQuad(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.cameraUnitQuad;
}

/**
 * The quad is a ray: its length lies along the particle's own `+Z`, never its travel.
 *
 * The kind is also excluded from `isDirectionOriented`, so a ray authored with no
 * rotation points along the emitter's `+Z` for good.
 */
export function isRay(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.ray;
}

/**
 * The emitter draws through `quad_ps_fixedalphauv`: a quad or a ribbon under `LOCK_ALPHA`.
 *
 * That bundle compiles no soft fade and no alpha erosion. Decisions 2.43 and 2.50 of
 * docs/plans/vfx-particle-renderer.md.
 */
export function drawsFixedAlphaUv(emitter: EmitterModel): boolean {
  return (
    emitter.uvMode === UV_MODE.lockAlpha &&
    emitter.quadType !== QUAD_TYPE.mesh &&
    emitter.quadType !== QUAD_TYPE.attachedMesh
  );
}

/** The emitter draws one ribbon through its live particles. */
export function drawsAsTrail(emitter: EmitterModel): boolean {
  return emitter.trail !== null && reachesAPhase(emitter);
}

/** The trail expands across the view rather than along each particle's own `+X`. */
export function trailFacesTheCamera(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.cameraTrail;
}

/**
 * The emitter draws a quad per particle from the system to its target.
 *
 * A beam that names a mesh has its ribbon suppressed and reaches no mesh draw, so it
 * draws nothing here either.
 */
export function drawsAsBeam(emitter: EmitterModel): boolean {
  return emitter.beam !== null && emitter.mesh === null && reachesAPhase(emitter);
}

/**
 * The emitter draws a mesh, which needs geometry before it draws anything.
 *
 * The plain kind alone draws what its definition names. The attached kind draws the
 * owner's own skinned mesh instead and never reads the three name fields, which is
 * [`drawsTheAttachment`].
 */
export function drawsAsMesh(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.mesh && emitter.mesh !== null && reachesAPhase(emitter);
}

/**
 * The emitter draws the character it is attached to, which a viewport has none of.
 *
 * The draw enumerates the owner's live skin render instances and copies each bone
 * palette per particle, so a name the definition carries is dead data.
 */
export function drawsTheAttachment(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.attachedMesh && reachesAPhase(emitter);
}

/**
 * The emitter lays each particle on the ground as a decal, `VfxPrimitivePlanarProjection`.
 *
 * A projection never distorts: the engine gives kind 7 its own decal shaders on every pass.
 */
export function drawsAsProjection(emitter: EmitterModel): boolean {
  return emitter.quadType === QUAD_TYPE.planarProjection && reachesAPhase(emitter);
}

/**
 * The emitter names a primitive this build has no renderer for.
 *
 * A null `quadType` reaches here too, because a class with no kind matches none of the
 * predicates above. An emitter the engine itself draws nowhere, by its render phase or as
 * a simple emitter of a kind that list does not draw, is not one of them.
 */
export function isUndrawn(emitter: EmitterModel): boolean {
  return (
    reachesAPhase(emitter) &&
    !drawsAsQuad(emitter) &&
    !drawsAsMesh(emitter) &&
    !drawsAsTrail(emitter) &&
    !drawsTheAttachment(emitter) &&
    !drawsAsProjection(emitter) &&
    emitter.beam === null
  );
}
