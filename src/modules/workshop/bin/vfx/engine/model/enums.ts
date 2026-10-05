/** `ParticleSystem::BLEND_MODE`. */
export const BLEND_MODE = {
  add: 0,
  alpha: 1,
  subtract: 2,
  none: 3,
  alphaAdd: 4,
  premultipliedAlpha: 5,
  min: 6,
  max: 7,
  targetAlpha: 8,
} as const;

export type BlendMode = (typeof BLEND_MODE)[keyof typeof BLEND_MODE];

/** `ParticleSystem::QUAD_TYPE`, the primitive kind of the draw. */
export const QUAD_TYPE = {
  cameraQuad: 0,
  arbitraryQuad: 1,
  ray: 2,
  mesh: 3,
  cameraTrail: 4,
  arbitraryTrail: 5,
  beam: 6,
  planarProjection: 7,
  cameraUnitQuad: 8,
  cameraSegmentBeam: 9,
  attachedMesh: 11,
} as const;

export type QuadType = (typeof QUAD_TYPE)[keyof typeof QUAD_TYPE];

/** `ParticleSystem::StencilMode`. */
export const STENCIL_MODE = {
  disabled: 0,
  writeMask: 1,
  testEqual: 2,
  testNotEqual: 3,
  writeMaskIfTestNotEqual: 4,
} as const;

export type StencilMode = (typeof STENCIL_MODE)[keyof typeof STENCIL_MODE];

/** `ParticleSystem::TEXTUREADDRESS`, how a sample outside its cell is fetched. */
export const ADDRESS_MODE = { wrap: 0, mirror: 1, clamp: 2, border: 3 } as const;

export type AddressMode = (typeof ADDRESS_MODE)[keyof typeof ADDRESS_MODE];

/** `ParticleSystem::UV_MODE`, where a layer's coordinates come from. */
export const UV_MODE = {
  default: 0,
  screenSpace: 1,
  lockAlpha: 2,
  localSpace: 3,
  localSpaceMult: 4,
  localSpaceBoth: 5,
} as const;

export type UvMode = (typeof UV_MODE)[keyof typeof UV_MODE];

/**
 * `ParticleSystem::MISC_RENDER_FLAG`, the three bits `miscRenderFlags` carries.
 *
 * The shipped data never sets a higher bit, and the whole byte is also a draw-order key.
 */
export const MISC_RENDER_FLAG = { disableZBuffer: 0x1, projected: 0x2, disableFow: 0x4 } as const;

/**
 * `ParticleSystem::TRAIL_MODE`: what a trail's `u` runs on.
 *
 * `WAKE` pins the texture to the path by taking the emitter's odometer at each particle's
 * birth, and `DEFAULT` re-measures the ribbon every frame. Shipped data authors `WAKE`
 * alone.
 */
export const TRAIL_MODE = { default: 0, wake: 1 } as const;

export type TrailMode = (typeof TRAIL_MODE)[keyof typeof TRAIL_MODE];

/**
 * `ParticleSystem::TrailSmoothingMode`, which names the walk's direction.
 *
 * `backToFront` walks oldest to newest and the other two newest to oldest, which is which
 * end `u` opens at and `mCutoff` truncates. Either on mode box-filters the points and
 * miters the joints.
 */
export const TRAIL_SMOOTHING = { off: 0, frontToBack: 1, backToFront: 2 } as const;

export type TrailSmoothing = (typeof TRAIL_SMOOTHING)[keyof typeof TRAIL_SMOOTHING];

/**
 * `ParticleSystem::BEAM_MODE`: which way a beam's width lies.
 *
 * `default` faces the eye and `arbitrary` lies across the world's up, run through the
 * particle's own matrix. Shipped data authors `arbitrary` alone.
 */
export const BEAM_MODE = { default: 0, arbitrary: 1 } as const;

export type BeamMode = (typeof BEAM_MODE)[keyof typeof BEAM_MODE];

/** `ParticleSystem::COLOR_LOOKUP_TYPE`, what drives one axis of the colour ramp's lookup. */
export const COLOR_LOOKUP = { constant: 0, lifetime: 1, velocity: 2, birthRandom: 3 } as const;

export type ColorLookup = (typeof COLOR_LOOKUP)[keyof typeof COLOR_LOOKUP];

/**
 * `ParticleSystem::IMPORTANCE`, the tier the effects quality culls an emitter by.
 *
 * The reflected enum names the first three. The rest are named for what the cull mask does
 * with them, since the mask keys six tiers (`VfxEmitter_Evaluation.md` section 9.1).
 */
export const IMPORTANCE = {
  low: 0,
  medium: 1,
  high: 2,
  always: 3,
  lowSpecOnly: 4,
  highSpecOnly: 5,
} as const;

export type Importance = (typeof IMPORTANCE)[keyof typeof IMPORTANCE];

/**
 * `VfxEmitterDefinitionData::ParticleLingerType`, what a finished emitter does with its particles.
 *
 * The client names the first three. Every higher value changes no lifetime, which `none`
 * stands for.
 */
export const LINGER_TYPE = {
  maxLifetimeAfterEmitterDies: 0,
  fixedLifetimeAfterEmitterDies: 1,
  fixedLifetimeAfterEmitterStops: 2,
  none: 3,
} as const;

export type LingerType = (typeof LINGER_TYPE)[keyof typeof LINGER_TYPE];

/** `ParticleSystem::FIXED_ORBIT_TYPE`, the world axis a fixed orbit turns about. */
export const FIXED_ORBIT = {
  worldX: 0,
  worldY: 1,
  worldZ: 2,
  worldNegX: 3,
  worldNegY: 4,
  worldNegZ: 5,
} as const;

export type FixedOrbit = (typeof FIXED_ORBIT)[keyof typeof FIXED_ORBIT];

/**
 * `ParticleSystem::ORIENTATION`, the plane a simple emitter's quads lie in.
 *
 * `CAMERA` is the screen plane, and each world value a fixed plane whatever the camera
 * does, `WORLD_Y` flat on the ground. The particle's rotation spins the quad in that
 * plane, about its normal.
 */
export const SIMPLE_ORIENTATION = { camera: 0, worldX: 1, worldY: 2, worldZ: 3 } as const;

export type SimpleOrientation = (typeof SIMPLE_ORIENTATION)[keyof typeof SIMPLE_ORIENTATION];

/**
 * `VfxParentInheritanceParams::Mode`, what each bit drops of the parent.
 *
 * `0x10` is attested and unnamed. It multiplies the system's own scale into the parent
 * scale the other bits read.
 */
export const INHERIT = {
  ignoreLocalOnOffset: 0x1,
  ignoreLocalOnChild: 0x2,
  ignoreScaleOnOffset: 0x4,
  ignoreScaleOnChild: 0x8,
  systemScale: 0x10,
} as const;

/** How a system's particles take their drag, which `kAnalyticDragMotion` switches. */
export const DRAG_MOTION = { stepped: 0, analytic: 1 } as const;

export type DragMotion = (typeof DRAG_MOTION)[keyof typeof DRAG_MOTION];

/**
 * `VfxSystemDefinitionData.flags`, by bit.
 *
 * The names of `0x1` to `0x100` are the client's own. The last three describe what the bit
 * does, since the client's names for them are not known.
 */
export const SYSTEM_FLAG = {
  simulateWhileOffScreen: 0x1,
  persistThruDeath: 0x2,
  persistThruRevive: 0x4,
  simulateOncePerFrame: 0x8,
  soundsEndOnEmitterEnd: 0x10,
  soundsPlayWhileOffScreen: 0x20,
  simulateEveryFrame: 0x40,
  keepOrientationAfterSpellCast: 0x80,
  useCalculusForPhysics: 0x100,
  hudLayerSizeFromUiElement: 0x200,
  alphaFromAttachment: 0x400,
  aggressiveImportanceCulling: 0x800,
} as const;

/** `VfxSystemDefinitionData.drawingLayer`. */
export const DRAWING_LAYER = { world: 0, hud: 1 } as const;

/**
 * `renderPhaseOverride`, the phase an emitter is forced into, in the client's numbering.
 *
 * A frame draws `distortionNoCharacter`, `groundLayer`, `default`, `distortionAll`,
 * `postDistortion` and `hudLayer` in that order. `automatic` leaves the choice to the
 * emitter's other fields, and a value past it matches no phase.
 */
export const RENDER_PHASE = {
  default: 0,
  shadow: 1,
  distortionNoCharacter: 2,
  distortionAll: 3,
  postDistortion: 4,
  groundLayer: 5,
  hudLayer: 6,
  automatic: 7,
} as const;

export type RenderPhase = (typeof RENDER_PHASE)[keyof typeof RENDER_PHASE];

/** `distortionMode`, the distortion phases an emitter draws in, by bit. */
export const DISTORTION_MODE = { all: 0x1, noCharacter: 0x2 } as const;

/** `VfxSoftParticleDefinitionData`'s unnamed byte `0x3bf176bc`, what the soft fade reaches. */
export const SOFT_TARGET = { both: 0, colour: 1, alpha: 2 } as const;

export type SoftTarget = (typeof SOFT_TARGET)[keyof typeof SOFT_TARGET];

/** `colorblindVisibility`, the palette an emitter is instantiated under. A higher value never is. */
export const COLORBLIND_VISIBILITY = { always: 0, normalOnly: 1, colorblindOnly: 2 } as const;

/** `VfxEmitterFiltering.spectatorPolicy`. */
export const SPECTATOR_POLICY = {
  enableAlways: 0,
  disableWhenSpectating: 1,
  enableWhenSpectating: 2,
} as const;

/** `offsetLifeScalingSymmetryMode`, the axes `offsetLifetimeScaling` reads unsigned, by bit. */
export const OFFSET_SYMMETRY = { x: 0x1, y: 0x2, z: 0x4 } as const;
