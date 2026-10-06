import type { AssetRef, MaterialPreview, NamedAsset } from "@/lib/tauri";

import type { CurveKey, ProbabilityTable } from "./curve";
import {
  ADDRESS_MODE,
  type AddressMode,
  type BeamMode,
  type BlendMode,
  type ColorLookup,
  type DragMotion,
  type FixedOrbit,
  type LingerType,
  type QuadType,
  type SimpleOrientation,
  type SoftTarget,
  type StencilMode,
  type TrailMode,
  type TrailSmoothing,
  type UvMode,
} from "./enums";
import type { Point } from "./rig";

/**
 * A value class as the sampler reads one: its constant, and the keys that animate it.
 *
 * A class whose `dynamics` is null carries no keys, and the constant is the whole
 * value. Where keys are present they are the value and the constant is not read, which
 * is what the engine's own evaluator does with the pair.
 */
export interface ValueCurve {
  /** `constantValue`, one component per channel of the family. */
  readonly constant: readonly number[];
  /** The curve's keys, in file order. Empty for a value that does not animate. */
  readonly keys: readonly CurveKey[];
  /**
   * `probabilityTables`, one per channel that carries one, and empty for none.
   *
   * A table is read at a random number and multiplied into its channel, which is how a
   * constant of `1.0` under a table of `1` to `360` is a random angle. Which number is
   * the reader's: a birth vector draws one per channel, and the UV birth values share one.
   */
  readonly tables: readonly ProbabilityTable[];
}

/** How a texture is cut into cells, and which cell a particle draws. */
export interface Flipbook {
  /** `texDiv`, the columns and rows the texture is cut into. */
  readonly divisions: readonly [number, number];
  /** `numFrames`, how many cells one run covers. */
  readonly frames: number;
  /** `startFrame`, the cell a particle opens on. */
  readonly start: number;
  /** `frameRate`, cells a second. */
  readonly rate: number;
  /** `birthFrameRate`, sampled per particle and multiplied into the rate. */
  readonly birthRate: ValueCurve;
  /** `isRandomStartFrame`, so each particle opens on a cell of its own. */
  readonly randomStart: boolean;
}

/**
 * One texture layer's flipbook and the 2x3 transform over it.
 *
 * The base texture and `textureMult` carry the same fields under different names, so one
 * shape reads both and the renderer runs the layers through one path.
 */
export interface UvLayer {
  readonly book: Flipbook;
  /** `uvScale`, sampled against the particle's age. */
  readonly scale: ValueCurve;
  /** `uvRotation`, degrees, sampled against the particle's age. */
  readonly rotation: ValueCurve;
  /** `birthUVOffset`, where a particle's own scroll starts. */
  readonly birthOffset: ValueCurve;
  /** `birthUvScrollRate`, sampled once per particle and scaled by its age in seconds. */
  readonly birthScrollRate: ValueCurve;
  /** `birthUvRotateRate`, degrees a second, the same way. */
  readonly birthRotateRate: ValueCurve;
  /**
   * `particleUVScrollRate`, an integrated value: the scroll is the rate's integral over
   * the particle's age, and one fixed offset for a value writing no `dynamics`.
   */
  readonly scrollRate: ValueCurve;
  /** `particleUVRotateRate`, degrees a second, integrated the same way. */
  readonly rotateRate: ValueCurve;
  /**
   * `emitterUvScrollRate`, which runs on the system's clock rather than a particle's and
   * lands after the flips. The mult layer carries the base layer's, its own having no reader.
   */
  readonly emitterScrollRate: readonly [number, number];
  /** `uvTransformCenter`, what the scale and the rotation turn about. */
  readonly center: readonly [number, number];
  readonly flipU: boolean;
  readonly flipV: boolean;
  /**
   * `uvScrollClamp`: the birth scroll ramp holds at one cell out rather than wrapping.
   *
   * Only the ramp. The integrated scroll is added after the clamp and never clamped.
   */
  readonly scrollClamp: boolean;
  /** `texAddressModeBase`, how a coordinate outside the cell is fetched. */
  readonly addressMode: AddressMode;
}

/** One cell and no transform, which is what an emitter writing no UV field reads as. */
export function plainUvLayer(): UvLayer {
  const flat = (...values: number[]): ValueCurve => ({ constant: values, keys: [], tables: [] });

  return {
    book: {
      divisions: [1, 1],
      frames: 1,
      start: 0,
      rate: 0,
      birthRate: flat(1),
      randomStart: false,
    },
    scale: flat(1, 1),
    rotation: flat(0),
    birthOffset: flat(0, 0),
    birthScrollRate: flat(0, 0),
    birthRotateRate: flat(0),
    scrollRate: flat(0, 0),
    rotateRate: flat(0),
    emitterScrollRate: [0, 0],
    center: [0.5, 0.5],
    flipU: false,
    flipV: false,
    scrollClamp: false,
    addressMode: ADDRESS_MODE.wrap,
  };
}

/**
 * `SpawnShape`: where a newborn lands about its emitter, and the turn its birth vectors take.
 *
 * The five concrete classes are the engine's own. A `volume` shape fills its inside and
 * one that does not emits from its surface, and the turn a shape draws is applied to the
 * offset and the birth velocity alike, which is what sends a sphere's particles outward. A
 * size is a half-extent, except a cylinder's `height`, which runs up from the emitter.
 */
export type SpawnShape =
  | { readonly kind: "point"; readonly offset: Point }
  | {
      readonly kind: "legacy";
      /** `emitOffset`, sampled per particle against the emitter's life. */
      readonly offset: ValueCurve;
      /** `birthTranslation`, which only the pre-split `VfxShape` carries, added to it. */
      readonly translation: ValueCurve;
      /** `emitRotationAngles` in degrees, one turn about each of `emitRotationAxes`. */
      readonly angles: readonly ValueCurve[];
      readonly axes: readonly Point[];
    }
  | { readonly kind: "box"; readonly size: Point; readonly volume: boolean }
  | {
      readonly kind: "cylinder";
      readonly radius: number;
      readonly height: number;
      readonly volume: boolean;
    }
  | { readonly kind: "sphere"; readonly radius: number; readonly volume: boolean };

/** The shape an emitter naming none spawns on, which is its own origin. */
export const POINT_SHAPE: SpawnShape = { kind: "point", offset: [0, 0, 0] };

/** `VfxTrailDefinitionData`: the ribbon an emitter's live particles are strung along. */
export interface TrailModel {
  /** `mMode`, of [`TRAIL_MODE`]. */
  readonly mode: TrailMode;
  /** `mSmoothingMode`, of [`TRAIL_SMOOTHING`]. */
  readonly smoothing: TrailSmoothing;
  /** `mMaxAddedPerFrame`, the most particles one step spawns, and zero for no cap. */
  readonly maxAddedPerFrame: number;
  /**
   * `mBirthTilingSize`, drawn per particle at birth.
   *
   * `x` is the engine units one texture repeat spans along the ribbon, and at or below
   * zero puts `u` at zero everywhere. `y` above zero spans `v` by the width over it, zero
   * spans one repeat across, and below zero spans a literal `-y`.
   */
  readonly tiling: ValueCurve;
  /** `mCutoff`: the walked length past which no point draws, and zero for none. */
  readonly cutoff: number;
}

/**
 * `VfxBeamDefinitionData`: the one quad each particle draws from the system to its target.
 *
 * Both ends are the system's, so every particle of the emitter draws the same segment and
 * differs in colour, width and uv.
 */
/**
 * `VfxProjectionDefinitionData`: how far above or below the ground a projecting particle
 * still draws.
 *
 * The decal is whole while the particle stands within `yRange` of the surface and fades
 * out over the next `fading` units. `colorModulate` is carried by the class and read by no
 * draw.
 */
export interface ProjectionModel {
  /** `mYRange`, the height band the decal draws whole in. */
  readonly yRange: number;
  /** `mFading`, the units past that band it fades out over. */
  readonly fading: number;
}

export interface BeamModel {
  /** `mMode`, of [`BEAM_MODE`]. */
  readonly mode: BeamMode;
  /** `mTrailMode`, of [`TRAIL_MODE`], which nothing in the engine reads. */
  readonly trailMode: TrailMode;
  /** `mSegments`, which only `VfxPrimitiveCameraSegmentBeam` reads, as ribs the particles stand in for. */
  readonly segments: number;
  /** `mBirthTilingSize`: `x` is the units one repeat spans across the width, and `y` along the length. */
  readonly tiling: ValueCurve;
  /** `mAnimatedColorWithDistance`, sampled at the beam's length in engine units. */
  readonly colorByDistance: ValueCurve;
  /** `mIsColorBindedWithDistance`: the length's colour is multiplied into every particle's. */
  readonly colorBoundToDistance: boolean;
  /** `mLocalSpaceSourceOffset`, off the system's position. */
  readonly sourceOffset: Point;
  /** `mLocalSpaceTargetOffset`, off the system's target. */
  readonly targetOffset: Point;
}

/**
 * `VfxLingerDefinitionData`: what replaces the emitter's own curves once it lingers.
 *
 * Each is null where its `Use*` toggle is off, so the reader folds the toggle in. The
 * colour and the scale read against the linger's own progress, and the rotation against
 * the age as `rotation0` does.
 */
export interface LingerModel {
  /** `LingerRotation`, in `rotation0`'s place. */
  readonly rotation: ValueCurve | null;
  /** `LingerScale`, in `scale0`'s place. */
  readonly scale: ValueCurve | null;
  /** `SeparateLingerColor`, in `Color`'s place. */
  readonly color: ValueCurve | null;
  /** `KeyedLingerAcceleration`, `KeyedLingerVelocity` and `KeyedLingerDrag`, in place of each. */
  readonly acceleration: ValueCurve | null;
  readonly velocity: ValueCurve | null;
  readonly drag: ValueCurve | null;
}

/**
 * `VfxPaletteDefinitionData`: a colour the texel's own channels look up on a texture.
 *
 * The texel under the mix weights is `u`, the row is `v`, and the palette's colour
 * replaces the texel's and leaves its alpha. Everything but `u` is a uniform, so a palette
 * is one colour per emitter per frame rather than per particle, and the colour lookup pair
 * is no part of it.
 */
export interface PaletteModel {
  /** Null for one the emitter does not name, and an `asset` of null for one the install does not ship. */
  readonly texture: NamedAsset | null;
  /** `paletteCount`, the rows the texture is cut into, and nothing draws at or below zero. */
  readonly count: number;
  /** `paletteSelector`, sampled at zero, whose first channel is the row. */
  readonly selector: ValueCurve;
  /** `PaletteUAnimationCurve` and `PaletteVAnimationCurve`, added to the lookup at the emitter's phase. */
  readonly scrollU: ValueCurve;
  readonly scrollV: ValueCurve;
  /** `palleteSrcMixColor`, the four weights the texel is dotted with for `u`, uploaded raw. */
  readonly mix: ValueCurve;
  /** `PaletteTextureAddressMode`. */
  readonly addressMode: AddressMode;
}

/**
 * `VfxAlphaErosionDefinitionData`: a band of the erosion map's values that stays drawn.
 *
 * The band runs from the drive up by `sliceWidth`, so a drive keyed from zero to one over
 * the life erodes the particle away where the map is low first. Shipped data keys the
 * drive upward in nearly every block, names a map in most and reads one channel of it.
 */
export interface ErosionModel {
  /**
   * `erosionMapName`, null for one the emitter does not name, and an `asset` of null for
   * one the install does not ship.
   */
  readonly map: NamedAsset | null;
  /** `erosionMapAddressMode`, as the sampler receives it rather than as authored. */
  readonly addressMode: AddressMode;
  /** `erosionMapChannelMixer`, the weights the map's texel is reduced to one value by. */
  readonly mixer: ValueCurve;
  /** `erosionDriveCurve`, sampled against the particle's age. */
  readonly drive: ValueCurve;
  /** `LingerErosionDriveCurve` in the drive's place while lingering, and null where unused. */
  readonly lingerDrive: ValueCurve | null;
  /** `erosionDriveSource`, which reaches no shader and shipped data leaves at its default. */
  readonly driveSource: number;
  /**
   * `erosionFeatherIn`, the map units the band fades out over inside its far edge, and
   * `erosionFeatherOut`, the units it fades in over below the drive. Each reaches the
   * shader as a rate, one over the width.
   */
  readonly featherIn: number;
  readonly featherOut: number;
  /** `erosionSliceWidth`, how far above the drive the band reaches. */
  readonly sliceWidth: number;
}

/**
 * `VfxDistortionDefinitionData`: the emitter warps what it covers rather than colouring it.
 *
 * The engine draws such an emitter in one of the three distortion display lists, never in
 * `Render_Default`, so its texel is a screen offset rather than a colour. Decision 2.25 of
 * docs/plans/vfx-particle-renderer.md, which is the reading this stands on.
 */
export interface DistortionModel {
  /** `distortion`, how far the warp carries, in screen widths. */
  readonly strength: number;
  /** `distortionMode`, the bits of [`DISTORTION_MODE`], and zero turns the block off. */
  readonly mode: number;
  /**
   * `normalMapTexture`, whose `xy` is the direction, null for one the emitter does not
   * name, and an `asset` of null for one the install does not ship.
   */
  readonly map: NamedAsset | null;
}

/**
 * `VfxReflectionDefinitionData`: a rim toward the silhouette, and a cube map over the surface.
 *
 * Only the mesh and the attached mesh shaders read it. Decision 2.42 of
 * docs/plans/vfx-particle-renderer.md.
 */
export interface ReflectionModel {
  /** `fresnel`, the exponent the rim falls off from the silhouette by. */
  readonly fresnel: number;
  /** `fresnelColor`, the rim's colour, whose alpha no shader lane reads. */
  readonly fresnelColor: readonly [number, number, number, number];
  /** `reflectionFresnel`, the exponent the reflection's opacity moves between its two ends by. */
  readonly reflectionFresnel: number;
  /** `reflectionFresnelColor`, which the reflection is tinted toward as its opacity rises. */
  readonly reflectionFresnelColor: readonly [number, number, number, number];
  /** `reflectionOpacityDirect` and `reflectionOpacityGlancing`: facing the eye, and edge on. */
  readonly opacityDirect: number;
  readonly opacityGlancing: number;
  /**
   * `reflectionMapTexture`, a cube map, null for one the emitter does not name, and an
   * `asset` of null for one the install does not ship.
   */
  readonly map: NamedAsset | null;
}

/**
 * `VfxSoftParticleDefinitionData`: a fade over the gap between a particle and the scene behind.
 *
 * Decision 2.43 of docs/plans/vfx-particle-renderer.md.
 */
export interface SoftModel {
  /** `beginIn` and `deltaIn`: the gap the fade in starts at, and the units it runs over. */
  readonly beginIn: number;
  readonly deltaIn: number;
  /** `beginOut` and `deltaOut`, the same for the fade out as the gap grows. */
  readonly beginOut: number;
  readonly deltaOut: number;
  /** The unnamed byte `0x3bf176bc`, of [`SOFT_TARGET`]: what the fade reaches. */
  readonly target: SoftTarget;
}

/**
 * `LegacySimple`: the scalar half a simple emitter carries in place of the vector fields.
 *
 * An emitter of `simpleEmitterDefinitionData` draws one quad whose plane `orientation`
 * fixes, so its only free turn is the spin in that plane and one size covers both
 * extents, `scaleBias` supplying the anisotropy. `hasFixedOrbit`, `lockedToEmitter` and
 * `particleBind` are carried and not drawn: `particleBind` ramps how far a particle's
 * height follows the terrain, which a flat preview ground leaves at nothing, and
 * `lockedToEmitter` turns that ramp off.
 */
export interface LegacySimpleModel {
  /**
   * `birthScale`, the one half-extent a particle is born at, times `scaleBias`: `.x`
   * across the quad and `.y` up it, which for `WORLD_Y` is the world's X.
   */
  readonly birthScale: ValueCurve;
  readonly scaleBias: readonly [number, number];
  /** `scale`, over the particle's life, in `scale0`'s place. */
  readonly scale: ValueCurve;
  /** `birthRotation` and `birthRotationalVelocity`, degrees in the quad's plane, at birth. */
  readonly birthRotation: ValueCurve;
  readonly birthRotationalVelocity: ValueCurve;
  /**
   * `rotation`, degrees in the quad's plane, sampled against the age. Under
   * `isRotationEnabled` it is the particle's whole angle, and otherwise it is not read.
   */
  readonly rotation: ValueCurve;
  /** `lockedToEmitter`: the terrain ramp of `particleBind` is off. */
  readonly lockedToEmitter: boolean;
  readonly hasFixedOrbit: boolean;
  readonly fixedOrbitType: FixedOrbit;
  /** `orientation`, of [`SIMPLE_ORIENTATION`]. */
  readonly orientation: SimpleOrientation;
  readonly particleBind: readonly [number, number];
  /**
   * `uvScrollRate`, a scroll in cells a second of each particle's own age, wrapped,
   * which the reader lowers onto `birthUvScrollRate`.
   */
  readonly uvScrollRate: readonly [number, number];
  /** `scaleUpFromOrigin`: the quad grows from its base rather than about its centre. */
  readonly scaleUpFromOrigin: boolean;
}

/** The mesh a mesh primitive names, and how it is turned. */
export interface MeshModel {
  readonly skeleton: NamedAsset | null;
  readonly animation: NamedAsset | null;
  readonly animationVariants: readonly NamedAsset[];
  /** Where the geometry's bytes live. */
  readonly asset: AssetRef;
  /** The path the emitter named, for a message about a mesh nothing resolves. */
  readonly path: string | null;
  /**
   * `mSubmeshesToDraw`, as the hashes the file holds. Empty draws the whole mesh.
   *
   * A submesh arrives from the geometry buffer under its name, so the filter hashes that
   * name rather than the file carrying one.
   */
  readonly submeshes: readonly string[];
  /** `mSubmeshesToDrawAlways`, drawn on top of whatever `submeshes` leaves. */
  readonly submeshesAlways: readonly string[];
  /** `AlignPitchToCamera` and `AlignYawToCamera`, on `VfxPrimitiveMeshBase`. */
  readonly alignPitch: boolean;
  readonly alignYaw: boolean;
  /**
   * The geometry came out of the `.skn` pair rather than the simple slot.
   *
   * Which look-at the camera alignment takes is the resource kind and nothing else: a
   * `.skn` aims by `Mtx44_LookAtLH` and a `.scb` or `.gmesh` by `Mtx44_LookAtRH`, whose
   * inverse is the other yawed half a turn about the camera's up.
   */
  readonly skinned: boolean;
}

/**
 * A mesh or skeleton sampled at particle birth, in emitter space.
 *
 * The pose comes from the unit the effect is bound to, so the model has no animation field.
 */
export interface EmissionSurfaceModel {
  readonly kind: "mesh" | "skeleton";
  readonly mesh: NamedAsset | null;
  readonly skeleton: NamedAsset | null;
  readonly submeshes: readonly string[];
  readonly joints: readonly string[];
  readonly scale: number;
  /** `maxJointWeights`, from one to four. */
  readonly maxJointWeights: number;
  /** The birth vectors take the sampled normal's direction. Always true for a skeleton. */
  readonly useNormal: boolean;
}

/**
 * `VfxChildParticleSetDefinitionData`: the systems a particle of its emitter spawns.
 *
 * A child is an ordinary system of its own that rides the particle. A set naming bones
 * spawns one child per bone on the emitter's pose, and one naming none spawns a single
 * child that `probability` picks.
 */
export interface ChildSetModel {
  /** `childrenIdentifiers`, each the system the resolver inlined, and null for one it could not reach. */
  readonly children: readonly (SystemModel | null)[];
  /** `boneToSpawnAt`, parallel to the children. */
  readonly bones: readonly string[];
  /** `childrenProbability`, an index into the children rather than a weight. */
  readonly probability: ValueCurve;
  /** `childEmitOnDeath`: the child spawns as the particle dies, in place of at its birth. */
  readonly onDeath: boolean;
  /** `ParentInheritanceDefinition`, and null for a set writing none. */
  readonly inheritance: InheritanceModel | null;
}

/** `VfxParentInheritanceParams`: what a child keeps of the particle it rides. */
export interface InheritanceModel {
  /** `Mode`, the bits of [`INHERIT`]. */
  readonly mode: number;
  /** `RelativeOffset`, in the parent particle's space unless a bit drops that. */
  readonly offset: ValueCurve;
}

/**
 * `VfxFieldCollectionDefinitionData`: the forces an emitter's particles move through.
 *
 * The engine runs the five kinds in this order, after the particle's own drag. Every
 * value is read against the emitter's own life.
 */
export interface FieldsModel {
  readonly acceleration: readonly AccelerationFieldModel[];
  readonly attraction: readonly AttractionFieldModel[];
  readonly noise: readonly NoiseFieldModel[];
  readonly drag: readonly DragFieldModel[];
  readonly orbital: readonly OrbitalFieldModel[];
}

/** `VfxFieldAccelerationDefinitionData`. */
export interface AccelerationFieldModel {
  readonly acceleration: ValueCurve;
  /** `isLocalSpace`: the acceleration is turned by the system's orientation under `isLocalOrientation`. */
  readonly localSpace: boolean;
}

/** `VfxFieldAttractionDefinitionData`: a pull toward `Position`, inside `radius`. */
export interface AttractionFieldModel {
  readonly position: ValueCurve;
  readonly acceleration: ValueCurve;
  readonly radius: ValueCurve;
}

/** `VfxFieldNoiseDefinitionData`: random impulses `frequency` times a second inside `radius` of `Position`. */
export interface NoiseFieldModel {
  readonly position: ValueCurve;
  /** `axisFraction`, what each axis of an impulse is multiplied by, and none of it by default. */
  readonly axisFraction: Point;
  readonly frequency: ValueCurve;
  readonly radius: ValueCurve;
  readonly velocityDelta: ValueCurve;
}

/** `VfxFieldDragDefinitionData`: damping inside `radius` of `Position`. */
export interface DragFieldModel {
  readonly position: ValueCurve;
  readonly radius: ValueCurve;
  readonly strength: ValueCurve;
}

/** `VfxFieldOrbitalDefinitionData`: the motion across `direction` turned about the system's origin. */
export interface OrbitalFieldModel {
  readonly direction: ValueCurve;
  /** `isLocalSpace`: the axis is turned by the system's orientation under `isLocalOrientation`. */
  readonly localSpace: boolean;
}

/**
 * Why the engine would not instantiate an emitter at the preview's settings.
 *
 * Very High effects quality culls the low-spec `importance`. The default palette culls a
 * colourblind-only emitter, and `never` is a `colorblindVisibility` no palette shows. A
 * preview is no spectator, and a HUD-layer system drops its simple emitters. `noRate` is an
 * emitter that can never emit, which the engine drops as it prepares the definition.
 */
export type EmitterCull =
  | "importance"
  | "colorblind"
  | "never"
  | "spectator"
  | "hudLayer"
  | "noRate";

/**
 * `period` and `timeActiveDuringPeriod`, each null where the emitter leaves it unset.
 *
 * Both count from the system's start rather than from `timeBeforeFirstEmission`. An
 * emitter spawns while the system time modulo `length` is below `active`, an unset
 * `length` being one cycle that never repeats and an unset `active` no gate at all.
 */
export interface EmissionPeriod {
  readonly length: number | null;
  readonly active: number | null;
}

/** `emissionMeshName`: a static mesh whose surface every particle is born on. */
export interface EmissionMeshModel {
  readonly mesh: NamedAsset;
  /** `emissionMeshScale`, on the sampled point alone. */
  readonly scale: number;
  /** `useEmissionMeshNormalForBirth`: the birth velocity and acceleration take the face's normal. */
  readonly useNormal: boolean;
}

/** One emitter of a system, as the renderer reads it. */
export interface EmitterModel {
  /** The shared static preview of `CustomMaterial`, and null for the particle shader. */
  readonly customMaterial: MaterialPreview | null;
  readonly emissionSurface: EmissionSurfaceModel | null;
  /** Where the emitter sits across both lists, which is the index the pool holds. */
  readonly index: number;
  /** The emitter came out of `simpleEmitterDefinitionData` rather than the complex list. */
  readonly simple: boolean;
  /** The emitter's system is on the HUD layer, which draws it in the HUD's phase alone. */
  readonly hudLayer: boolean;
  /** Its place in its own list, which is what the strip's own cards are keyed on. */
  readonly listIndex: number;
  readonly name: string;
  /** The emitter is not instantiated: its `disabled` flag is set, or a gate in `culled` removed it. */
  readonly disabled: boolean;
  /** The instantiation gate that removed the emitter from the preview, and null for none. */
  readonly culled: EmitterCull | null;

  /**
   * `ChanceToNotExist`: the share of runs the emitter is left out of, rolled once as the
   * system spawns. Zero for a simple emitter, which skips the roll.
   */
  readonly chanceToNotExist: number;

  /** Particles per second, sampled at the emitter's phase. */
  readonly rate: ValueCurve;
  /**
   * `rateByVelocityFunction`, which replaces `rate` by the system's speed times its first
   * number plus its second, and null where both are zero.
   */
  readonly rateByVelocity: readonly [number, number] | null;
  /** `MaximumRateByVelocity`, the most that function yields, 300 where unset. */
  readonly maximumRateByVelocity: number;
  /** Seconds a particle lives, sampled at birth. */
  readonly particleLifetime: ValueCurve;
  /**
   * `lifetime`, the system time emission ends at, and null for an emitter with no end.
   *
   * An end time rather than a duration: it counts from the system's start, so a delay
   * shortens the emission. [`emissionEnd`] is what the simulation reads.
   */
  readonly lifetime: number | null;
  readonly timeBeforeFirstEmission: number;
  /** `period` and `timeActiveDuringPeriod`, and null for an emitter writing neither. */
  readonly period: EmissionPeriod | null;
  /** `isSingleParticle`: the emitter's whole output is one burst at its start. */
  readonly singleParticle: boolean;
  /** `HasVariableStartTime`: a first emission that counts to zero particles spawns none. */
  readonly hasVariableStartTime: boolean;
  /** The emitter writes `materialOverrideDefinitions`, which exempts it from two load-time rules. */
  readonly overridesMaterials: boolean;
  /**
   * `ParticlesShareRandomValue`: one shared birth number serves the emitter's whole run.
   *
   * It covers the UV birth tables, the random start frame and the birth-random colour
   * lookup, and none of the birth vectors, `birthColor` or `particleLifetime`.
   */
  readonly sharedRandom: boolean;

  /** Sampled once per particle, at birth, in the emitter's own frame. */
  readonly birthVelocity: ValueCurve;
  /** `birthAcceleration`, a constant acceleration each particle keeps from birth. */
  readonly birthAcceleration: ValueCurve;
  /** Sampled per step against the particle's age. */
  readonly acceleration: ValueCurve;
  readonly drag: ValueCurve;
  /**
   * `birthDrag`, sampled once per particle and summed into `drag` per axis.
   *
   * The engine's damping coefficient is the definition's drag plus the particle's own
   * birth drag, so it is one drag pass rather than two.
   */
  readonly birthDrag: ValueCurve;
  /** `velocity`, added to every particle's own each step and never accumulated. */
  readonly velocity: ValueCurve;
  /**
   * `worldAcceleration`, an integrated value the draw applies as a world offset.
   *
   * The curve integrated twice over the particle's age and scaled by its lifetime squared.
   * A value writing no `dynamics` is not integrated, and stands as one fixed offset.
   */
  readonly worldAcceleration: ValueCurve;
  /** How much of the system's movement a particle carries with it, sampled against its age. */
  readonly bindWeight: ValueCurve;
  /** `EmitterPosition`, where births stand in the emitter's own frame, over its life. */
  readonly emitterPosition: ValueCurve;
  /**
   * `IsEmitterSpace`: a particle is born at the frame's origin and takes the current
   * `EmitterPosition` every step, where clear bakes it in at birth.
   */
  readonly emitterSpace: boolean;
  /** Where about the emitter a particle is born, and which way its velocity is turned. */
  readonly shape: SpawnShape;
  /** `emissionMeshName`, and null for an emitter naming none. */
  readonly emissionMesh: EmissionMeshModel | null;
  /**
   * `offsetLifetimeScaling`, seconds a particle's lifetime gains per unit of its raw shape
   * offset, and `offsetLifeScalingSymmetryMode`, the bits of [`OFFSET_SYMMETRY`].
   */
  readonly offsetLifetimeScaling: Point;
  readonly offsetLifeSymmetry: number;
  /**
   * `rotationOverride` in euler degrees, `scaleOverride` and `translationOverride`: the
   * emitter's own frame, scale then rotation then translation.
   *
   * The spawn frame is that frame under the system's orientation, and a particle's world
   * matrix is its own on the frame it was born in.
   */
  readonly rotationOverride: Point;
  readonly scaleOverride: Point;
  readonly translationOverride: Point;
  /** `isLocalOrientation`: the system's orientation is part of the spawn frame. */
  readonly localOrientation: boolean;
  /**
   * `particleIsLocalOrientation`: the particle turns with the system's current orientation,
   * and the frame it was born in gives its translation alone.
   */
  readonly particleLocalOrientation: boolean;
  /**
   * `isUniformScale`: the first component of the scale serves all three.
   *
   * Quads and meshes read it. A ray, a trail and a beam do not.
   */
  readonly uniformScale: boolean;
  /**
   * `postRotateOrientationAxis` under `hasPostRotateOrientation`: euler degrees turned
   * after the particle's own spin, and null where the flag is clear.
   */
  readonly postRotate: Point | null;

  /**
   * `particleLinger`, seconds a finished emitter's particles are given, before the cap
   * [`lingerSeconds`] applies.
   */
  readonly particleLinger: number;
  /**
   * `emitterLinger`, the system age a stopped emitter waits past before it finishes, before
   * the cap [`stopWaitSeconds`] applies.
   */
  readonly emitterLinger: number;
  /** `particleLingerType`, how those seconds are applied and what finishes the emitter. */
  readonly lingerType: LingerType;
  /** `Linger`, what a lingering particle reads in place of its emitter's curves. */
  readonly linger: LingerModel | null;

  /** `paletteDefinition`, and null for an emitter drawing no palette. */
  readonly palette: PaletteModel | null;
  /** `alphaErosionDefinition`, and null for an emitter eroding nothing. */
  readonly erosion: ErosionModel | null;
  /** `distortionDefinition`, and null for an emitter drawing its colour. */
  readonly distortion: DistortionModel | null;
  /** `reflectionDefinition`, and null for an emitter carrying none. */
  readonly reflection: ReflectionModel | null;
  /** `softParticleParams`, and null for an emitter carrying none. */
  readonly soft: SoftModel | null;
  /** `colorLookUpTypeX` and `colorLookUpTypeY`, what drives each axis of the ramp's lookup. */
  readonly lookupX: ColorLookup;
  readonly lookupY: ColorLookup;
  /** `colorLookUpOffsets` and `colorLookUpScales`, over each axis. */
  readonly lookupOffsets: readonly [number, number];
  readonly lookupScales: readonly [number, number];
  /**
   * `particleColorTexture`, the ramp the lookup reads and the texel is multiplied by.
   *
   * Always sampled clamped, and dropped from the colour pass where the emitter carries a
   * mult layer or an erosion. Null for one the emitter does not name, and an `asset` of
   * null for one the install does not ship.
   */
  readonly colorTexture: NamedAsset | null;

  /**
   * `rotation0`, an integrated value: a spin rate in degrees per `1 / 60` second.
   *
   * The angle is the rate's integral over the particle's age times [`ROTATION_RATE`]. A
   * value writing no `dynamics` is one fixed extra angle instead.
   */
  readonly rotation0: ValueCurve;
  /** Sampled once per particle, at birth. Euler degrees. */
  readonly birthRotation0: ValueCurve;
  /** `birthRotationalVelocity0` and `birthRotationalAcceleration`, degrees a second, at birth. */
  readonly birthRotationalVelocity0: ValueCurve;
  readonly birthRotationalAcceleration: ValueCurve;
  /**
   * `birthOrbitalVelocity`, radians a second, at birth, and never a spin.
   *
   * A second rotation channel, folded into the world matrix after its translation row is
   * set, so it turns the particle about the system's origin rather than about the
   * particle. Radians, and the `pi / 180` the spin channel carries never reaches it.
   */
  readonly birthOrbitalVelocity: ValueCurve;
  /**
   * `LegacySimple`, whose scalars stand in for the scale and rotation fields where present.
   *
   * `uvScrollRate` and `scaleUpFromOrigin` are lowered onto the emitter's own fields by
   * the reader, and the rest is read where the vector it replaces would be.
   */
  readonly legacySimple: LegacySimpleModel | null;
  /** The quad grows from its base rather than about its centre. */
  readonly pivotUp: boolean;
  /** `isRotationEnabled`: the particle turns over its life rather than holding its birth angle. */
  readonly rotationEnabled: boolean;
  /**
   * `isDirectionOriented`: a camera quad lays its up along the travel, and an arbitrary
   * quad or a mesh aims its own `+Z` along it.
   */
  readonly directionOriented: boolean;
  /** `directionVelocityScale`: how far one axis of a quad stretches per unit of speed, and zero for none. */
  readonly directionVelocityScale: number;
  /** `directionVelocityMinScale`: the least stretch that axis takes. */
  readonly directionVelocityMinScale: number;

  /** Sampled per frame against the particle's age. */
  readonly scale0: ValueCurve;
  /** Sampled once per particle, at birth. */
  readonly birthScale0: ValueCurve;
  /** `Color`, sampled per frame against the particle's age. Four channels, 0 to 1. */
  readonly color: ValueCurve;
  /** Sampled once per particle, at birth. Four channels, 0 to 1. */
  readonly birthColor: ValueCurve;
  /** `modulationFactor`, multiplied into every particle's colour ahead of the premultiply. */
  readonly modulation: readonly [number, number, number, number];

  /**
   * Where the emitter's texture lives, null for one the emitter does not name, and an
   * `asset` of null for one the install does not ship.
   */
  readonly texture: NamedAsset | null;
  /** The flipbook and the transform over that texture. */
  readonly uv: UvLayer;
  /** `uvMode`, which only `default` is drawn on. */
  readonly uvMode: UvMode;
  /**
   * `textureMult`'s own texture, null for one the emitter does not name, and an `asset`
   * of null for one the install does not ship.
   */
  readonly multTexture: NamedAsset | null;
  /** The second layer's flipbook and transform, and null where there is no second layer. */
  readonly multUv: UvLayer | null;
  readonly blendMode: BlendMode;
  /**
   * `pass`, the first key of the engine's draw order, ascending.
   *
   * A signed 16-bit relative priority rather than a pass index.
   */
  readonly pass: number;
  /** `miscRenderFlags`, the bits of [`MISC_RENDER_FLAG`]. */
  readonly miscRenderFlags: number;
  /** `renderPhaseOverride`, of [`RENDER_PHASE`], which `automatic` leaves to the other fields. */
  readonly renderPhaseOverride: number;
  /**
   * The emitter draws in the ground layer's phase, flat on the ground: `isGroundLayer` on
   * an emitter left to the automatic choice, or `renderPhaseOverride` naming that phase.
   */
  readonly groundLayer: boolean;
  /**
   * `alphaRef`, over 255, and zero for an emitter whose alpha test is compiled out.
   *
   * A fragment whose composited alpha is below it is discarded.
   */
  readonly alphaRef: number;
  /**
   * The primitive's kind, and `cameraQuad` for an emitter that names none.
   *
   * Null for a primitive class section 3.1 of docs/plans/vfx-particle-renderer.md carries no
   * kind for, which is what leaves [`isUndrawn`] true for it rather than drawing it as
   * something it is not.
   */
  readonly quadType: QuadType | null;
  /**
   * `stencilMode`, which the preview reads and does not test against.
   *
   * 82% of the population compares against a stencil buffer, and a preview fills none, so
   * a compare here answers off an all-zero buffer rather than off the engine's: `kEqual`
   * discards the half of them that carry a reference and `kNotEqual` passes the rest for
   * that same reason. Decision 2.27 of docs/plans/vfx-particle-renderer.md.
   */
  readonly stencilMode: StencilMode;
  /** `stencilRef`, and zero for the disabled mode, which is the one that does not read it. */
  readonly stencilRef: number;
  /** The primitive's class hash, for a kind T0 does not draw. */
  readonly primitiveClass: string | null;
  /** That class as the tables name it, which is what a message about it reads. */
  readonly primitiveName: string | null;
  /** The geometry a mesh primitive draws, and null for every other kind. */
  readonly mesh: MeshModel | null;
  /** The ribbon a trail primitive strings its particles along, and null for every other kind. */
  readonly trail: TrailModel | null;
  /** The ribbon a beam primitive reaches the target with, and null for every other kind. */
  readonly beam: BeamModel | null;
  /** The decal a planar projection lays on the ground, and null for every other kind. */
  readonly projection: ProjectionModel | null;
  /** `childParticleSetDefinition`, and null for an emitter spawning no systems. */
  readonly childSet: ChildSetModel | null;
  /** `fieldCollectionDefinition`, and null for an emitter whose particles cross no field. */
  readonly fields: FieldsModel | null;

  /** `depthBiasFactors`, the pair the depth offset scales by. */
  readonly depthBias: readonly [number, number];
  readonly depthPushPull: number;
  /** `disableBackfaceCull`, inverted: a mesh's far faces are dropped unless it asks to keep them. */
  readonly backfaceCull: boolean;
  /** The unnamed flag `0xd1ee8634`: the other winding counts as the front face. */
  readonly flipWinding: boolean;
}

/** One particle system, as the viewport draws one. */
export interface SystemModel {
  /** The object's path hash, `0x` and eight hex digits, and null for a system nothing addresses. */
  readonly entry: string | null;
  readonly name: string | null;
  readonly emitters: readonly EmitterModel[];
  /**
   * `transform`, the definition's own matrix as the file lays it out: sixteen cells
   * row-major, the basis in the first three rows and the translation in the last, and
   * null for none.
   *
   * The last factor of a complex particle's own matrix, inside the frame the particle was
   * born in. A HUD-layer system takes its translation alone.
   */
  readonly transform: readonly number[] | null;
  /** `drawingLayer` is the HUD's, which drops every simple emitter and the `transform`'s turn. */
  readonly hudLayer: boolean;
  /** Whether the particles step through their drag or ease out by `kAnalyticDragMotion`. */
  readonly dragMotion: DragMotion;
  /** `buildUpTime`, the seconds a run simulates before it is first drawn. */
  readonly buildUpTime: number;
}
