import type { MaterialPreview, VfxSystem, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import {
  COLOR_LOOKUP,
  COLORBLIND_VISIBILITY,
  DRAG_MOTION,
  DRAWING_LAYER,
  IMPORTANCE,
  LINGER_TYPE,
  RENDER_PHASE,
  SPECTATOR_POLICY,
  STENCIL_MODE,
  SYSTEM_FLAG,
} from "../model/enums";
import type {
  ChildSetModel,
  EmissionMeshModel,
  EmitterCull,
  EmitterModel,
  SystemModel,
  UvLayer,
} from "../model/model";
import { curveMaximum, emissionPeriod, emptySystem } from "../model/systemModel";
import { readEmissionSurface } from "./readEmissionSurface";
import {
  readBeam,
  readFields,
  readLegacySimple,
  readLinger,
  readProjection,
  readShape,
  readTrail,
} from "./readMotion";
import {
  LAYER,
  MULT_TEXTURE,
  readDistortion,
  readErosion,
  readLayer,
  readMesh,
  readPalette,
  readReflection,
  readSoft,
} from "./readSurface";
import {
  ALPHA_REF_SCALE,
  blendMode,
  channelsOr,
  constant,
  curve,
  DEFAULT,
  DEFAULT_ALPHA_REF,
  enumByte,
  field,
  flag,
  flagOr,
  lingerType,
  matrix,
  namedAsset,
  number,
  pair,
  pairOr,
  quadType,
  stencilMode,
  text,
  texts,
  triple,
  tripleOr,
  uvMode,
} from "./readValue";

/** The system's own fields. */
const SYSTEM = {
  transform: nameHash("transform"),
  flags: nameHash("flags"),
  buildUpTime: nameHash("buildUpTime"),
  drawingLayer: nameHash("drawingLayer"),
} as const;

/** `directionVelocityMinScale`'s schema default, which a bin writing `0` departs from. */
const DIRECTION_MIN_SCALE_DEFAULT = 1;

/** `flags`' schema default, which leaves `UseCalculusForPhysics` off. */
const FLAGS_DEFAULT = 0xd4;

/** `importance`'s schema default. */
const IMPORTANCE_DEFAULT = 1;

/** `MaximumRateByVelocity` where the emitter leaves it unset. */
const MAXIMUM_RATE_BY_VELOCITY = 300;

/** `VfxEmitterFiltering.spectatorPolicy`, the one field of `Filtering` the preview gates on. */
const SPECTATOR_POLICY_FIELD = nameHash("spectatorPolicy");

/** The unnamed flag that reverses which winding is the front face. */
const FLIP_WINDING = "0xd1ee8634";

/** The two lists a system contains its emitters in, in the order the strip reads them. */
const EMITTER_LISTS = [
  { hash: nameHash("complexEmitterDefinitionData"), simple: false },
  { hash: nameHash("simpleEmitterDefinitionData"), simple: true },
] as const;

/** The emitter fields the renderer reads, tier by tier of docs/plans/vfx-particle-renderer.md. */
const FIELD = {
  name: nameHash("emitterName"),
  disabled: nameHash("disabled"),
  importance: nameHash("importance"),
  colorblindVisibility: nameHash("colorblindVisibility"),
  chanceToNotExist: nameHash("ChanceToNotExist"),
  filtering: nameHash("Filtering"),
  rate: nameHash("rate"),
  flexRate: nameHash("flexRate"),
  rateByVelocity: nameHash("rateByVelocityFunction"),
  maximumRateByVelocity: nameHash("MaximumRateByVelocity"),
  hasVariableStartTime: nameHash("HasVariableStartTime"),
  materialOverrides: nameHash("materialOverrideDefinitions"),
  particleLifetime: nameHash("particleLifetime"),
  lifetime: nameHash("lifetime"),
  timeBeforeFirstEmission: nameHash("timeBeforeFirstEmission"),
  period: nameHash("period"),
  timeActiveDuringPeriod: nameHash("timeActiveDuringPeriod"),
  singleParticle: nameHash("isSingleParticle"),
  sharedRandom: nameHash("ParticlesShareRandomValue"),
  birthVelocity: nameHash("birthVelocity"),
  birthAcceleration: nameHash("birthAcceleration"),
  acceleration: nameHash("acceleration"),
  drag: nameHash("drag"),
  birthDrag: nameHash("birthDrag"),
  velocity: nameHash("velocity"),
  worldAcceleration: nameHash("worldAcceleration"),
  bindWeight: nameHash("bindWeight"),
  particleLinger: nameHash("particleLinger"),
  emitterLinger: nameHash("emitterLinger"),
  lingerType: nameHash("particleLingerType"),
  linger: nameHash("Linger"),
  palette: nameHash("paletteDefinition"),
  erosion: nameHash("alphaErosionDefinition"),
  distortion: nameHash("distortionDefinition"),
  reflection: nameHash("reflectionDefinition"),
  soft: nameHash("softParticleParams"),
  lookupX: nameHash("colorLookUpTypeX"),
  lookupY: nameHash("colorLookUpTypeY"),
  lookupOffsets: nameHash("colorLookUpOffsets"),
  lookupScales: nameHash("colorLookUpScales"),
  colorTexture: nameHash("particleColorTexture"),
  emitterPosition: nameHash("EmitterPosition"),
  emitterSpace: nameHash("IsEmitterSpace"),
  spawnShape: nameHash("SpawnShape"),
  emissionMesh: nameHash("emissionMeshName"),
  emissionMeshScale: nameHash("emissionMeshScale"),
  emissionMeshNormal: nameHash("useEmissionMeshNormalForBirth"),
  offsetLifetimeScaling: nameHash("offsetLifetimeScaling"),
  offsetLifeSymmetry: nameHash("offsetLifeScalingSymmetryMode"),
  rotationOverride: nameHash("rotationOverride"),
  scaleOverride: nameHash("scaleOverride"),
  translationOverride: nameHash("translationOverride"),
  localOrientation: nameHash("isLocalOrientation"),
  particleLocalOrientation: nameHash("particleIsLocalOrientation"),
  uniformScale: nameHash("isUniformScale"),
  hasPostRotate: nameHash("hasPostRotateOrientation"),
  postRotate: nameHash("postRotateOrientationAxis"),
  rotation0: nameHash("rotation0"),
  birthOrbitalVelocity: nameHash("birthOrbitalVelocity"),
  birthRotation0: nameHash("birthRotation0"),
  birthRotationalVelocity0: nameHash("birthRotationalVelocity0"),
  birthRotationalAcceleration: nameHash("birthRotationalAcceleration"),
  rotationEnabled: nameHash("isRotationEnabled"),
  directionOriented: nameHash("isDirectionOriented"),
  directionVelocityScale: nameHash("directionVelocityScale"),
  directionVelocityMinScale: nameHash("directionVelocityMinScale"),
  scale0: nameHash("scale0"),
  birthScale0: nameHash("birthScale0"),
  color: nameHash("Color"),
  birthColor: nameHash("birthColor"),
  modulation: nameHash("modulationFactor"),
  texture: nameHash("texture"),
  blendMode: nameHash("blendMode"),
  primitive: nameHash("primitive"),
  depthBias: nameHash("depthBiasFactors"),
  depthPushPull: nameHash("DepthPushPull"),
  disableBackfaceCull: nameHash("disableBackfaceCull"),
  uvMode: nameHash("uvMode"),
  textureMult: nameHash("textureMult"),
  pass: nameHash("pass"),
  miscRenderFlags: nameHash("miscRenderFlags"),
  renderPhaseOverride: nameHash("renderPhaseOverride"),
  groundLayer: nameHash("isGroundLayer"),
  alphaRef: nameHash("alphaRef"),
  stencilMode: nameHash("stencilMode"),
  stencilRef: nameHash("stencilRef"),
  legacySimple: nameHash("LegacySimple"),
  childSet: nameHash("childParticleSetDefinition"),
  fields: nameHash("fieldCollectionDefinition"),
} as const;

/** `VfxChildParticleSetDefinitionData`'s own fields. */
const CHILD_SET = {
  children: nameHash("childrenIdentifiers"),
  bones: nameHash("boneToSpawnAt"),
  probability: nameHash("childrenProbability"),
  onDeath: nameHash("childEmitOnDeath"),
  inheritance: nameHash("ParentInheritanceDefinition"),
} as const;

/**
 * `VfxChildIdentifier.effect` then `effectKey`, which the resolver inlines where this
 * document holds the system, the link directly and the key through its `ResourceResolver`.
 *
 * The order reads a definition first and a key after.
 */
const CHILD_NAMES = [nameHash("effect"), nameHash("effectKey")] as const;

/** `VfxParentInheritanceParams`'s own fields. */
const INHERITANCE = { mode: nameHash("Mode"), offset: nameHash("RelativeOffset") } as const;

/**
 * One system's emitters, out of the tree `read_vfx_system` resolved.
 *
 * Decision 2.1 of docs/plans/vfx-particle-renderer.md puts the mapping here, on the same
 * `nameHash` the editor's rows are keyed on. A field the object does not write takes the
 * schema's default rather than dropping the emitter.
 */
export function readVfxSystem(system: VfxSystem): SystemModel {
  const materials = new Map(system.materials.map((material) => [material.hash, material]));

  return readSystem(system.root, system.entry, system.name, materials);
}

/** One `VfxSystemDefinitionData` struct, which is a read's root or a child set inlined. */
function readSystem(
  root: VfxValue,
  entry: string | null,
  name: string | null,
  materials: ReadonlyMap<string, MaterialPreview>,
): SystemModel {
  if (root.type !== "struct") return emptySystem(entry);

  const hudLayer = number(field(root, SYSTEM.drawingLayer)) === DRAWING_LAYER.hud;
  const emitters: EmitterModel[] = [];
  for (const list of EMITTER_LISTS) {
    const held = field(root, list.hash);
    if (held?.type !== "container") continue;
    /* The strip keys a card on its place in its own list, so the two indices are kept
       apart: one addresses the pool, and one joins a card to the emitter it drew. */
    held.items.forEach((item, listIndex) => {
      if (item.type !== "struct") return;
      emitters.push(
        readEmitter(item, emitters.length, list.simple, listIndex, materials, hudLayer),
      );
    });
  }

  const flags = number(field(root, SYSTEM.flags)) ?? FLAGS_DEFAULT;
  return {
    entry,
    name,
    emitters,
    transform: matrix(field(root, SYSTEM.transform)),
    hudLayer,
    dragMotion:
      (flags & SYSTEM_FLAG.useCalculusForPhysics) !== 0
        ? DRAG_MOTION.analytic
        : DRAG_MOTION.stepped,
    buildUpTime: Math.max(number(field(root, SYSTEM.buildUpTime)) ?? 0, 0),
  };
}

function readEmitter(
  node: VfxValue & { type: "struct" },
  index: number,
  simple: boolean,
  listIndex: number,
  materials: ReadonlyMap<string, MaterialPreview>,
  hudLayer: boolean,
): EmitterModel {
  const custom = field(node, nameHash("CustomMaterial"));
  const material = field(custom, nameHash("Material"));
  let materialHash: string | undefined;
  if (material?.type === "struct") {
    materialHash = material.object?.entry;
  } else if (material?.type === "link") {
    materialHash = material.hash;
  }

  const customMaterial = materials.get(materialHash ?? "") ?? null;

  const primitive = field(node, FIELD.primitive);
  const texture = field(node, FIELD.texture);
  const colorTexture = field(node, FIELD.colorTexture);
  const read = readLayer(node, LAYER.base, null);
  const mult = field(node, FIELD.textureMult);
  const multTexture = mult?.type === "struct" ? field(mult, MULT_TEXTURE) : null;
  const legacySimple = simple ? readLegacySimple(field(node, FIELD.legacySimple)) : null;
  const stencil = stencilMode(field(node, FIELD.stencilMode));
  /* `disabled` is the engine's first test, so no later gate is named for such an emitter. */
  const off = flag(field(node, FIELD.disabled));
  const culled = off ? null : cullOf(node, simple, hudLayer);
  const byVelocity = pair(field(field(node, FIELD.rateByVelocity), CONSTANT));
  const overrides = field(node, FIELD.materialOverrides);
  const phase = number(field(node, FIELD.renderPhaseOverride)) ?? RENDER_PHASE.automatic;

  /* What the legacy block says about the whole emitter lowers onto the fields it
     stands in for, so the draw reads one place for either kind of emitter. Its scroll
     runs on each particle's own age and wraps, which is the birth ramp. */
  const scrolls =
    legacySimple !== null &&
    (legacySimple.uvScrollRate[0] !== 0 || legacySimple.uvScrollRate[1] !== 0);
  const uv: UvLayer = scrolls
    ? { ...read, birthScrollRate: constant(legacySimple.uvScrollRate), scrollClamp: false }
    : read;
  const multLayer = mult?.type === "struct" ? readLayer(mult, LAYER.mult, uv.book) : null;

  return {
    customMaterial,
    index,
    simple,
    hudLayer,
    listIndex,
    name: text(field(node, FIELD.name)) ?? "",
    disabled: off || culled !== null,
    culled,
    chanceToNotExist: simple ? 0 : (number(field(node, FIELD.chanceToNotExist)) ?? 0),

    rate: curve(field(node, FIELD.rate), DEFAULT.rate),
    rateByVelocity: simple || (byVelocity[0] === 0 && byVelocity[1] === 0) ? null : byVelocity,
    maximumRateByVelocity:
      number(field(node, FIELD.maximumRateByVelocity)) ?? MAXIMUM_RATE_BY_VELOCITY,
    particleLifetime: curve(field(node, FIELD.particleLifetime), DEFAULT.particleLifetime),
    lifetime: number(field(node, FIELD.lifetime)),
    timeBeforeFirstEmission: number(field(node, FIELD.timeBeforeFirstEmission)) ?? 0,
    period: emissionPeriod(
      number(field(node, FIELD.period)),
      number(field(node, FIELD.timeActiveDuringPeriod)),
    ),
    singleParticle: flag(field(node, FIELD.singleParticle)),
    hasVariableStartTime: !simple && flag(field(node, FIELD.hasVariableStartTime)),
    overridesMaterials: overrides?.type === "container" && overrides.items.length > 0,
    sharedRandom: flag(field(node, FIELD.sharedRandom)),

    /* A simple emitter moves its particles in a straight line off `birthVelocity` and
       reads none of the over-life motion, the emitter's own frame or the emission mesh. */
    birthVelocity: curve(field(node, FIELD.birthVelocity), DEFAULT.zero3),
    birthAcceleration: complex(simple, field(node, FIELD.birthAcceleration)),
    acceleration: complex(simple, field(node, FIELD.acceleration)),
    drag: complex(simple, field(node, FIELD.drag)),
    birthDrag: complex(simple, field(node, FIELD.birthDrag)),
    velocity: complex(simple, field(node, FIELD.velocity)),
    worldAcceleration: complex(simple, field(node, FIELD.worldAcceleration)),
    bindWeight: simple ? DEFAULT.zero : curve(field(node, FIELD.bindWeight), DEFAULT.zero),
    emitterPosition: curve(field(node, FIELD.emitterPosition), DEFAULT.zero3),
    emitterSpace: !simple && flag(field(node, FIELD.emitterSpace)),
    shape: readShape(field(node, FIELD.spawnShape)),
    emissionMesh: simple ? null : readEmissionMesh(node),
    offsetLifetimeScaling: simple ? [0, 0, 0] : triple(field(node, FIELD.offsetLifetimeScaling)),
    offsetLifeSymmetry: number(field(node, FIELD.offsetLifeSymmetry)) ?? 0,
    emissionSurface: simple
      ? null
      : readEmissionSurface(field(node, nameHash("emissionSurfaceDefinition"))),
    rotationOverride: simple ? [0, 0, 0] : triple(field(node, FIELD.rotationOverride)),
    scaleOverride: simple ? [1, 1, 1] : tripleOr(field(node, FIELD.scaleOverride), [1, 1, 1]),
    translationOverride: simple ? [0, 0, 0] : triple(field(node, FIELD.translationOverride)),
    localOrientation: flagOr(field(node, FIELD.localOrientation), true),
    particleLocalOrientation: flag(field(node, FIELD.particleLocalOrientation)),
    uniformScale: flag(field(node, FIELD.uniformScale)),
    postRotate:
      !simple && flag(field(node, FIELD.hasPostRotate))
        ? triple(field(node, FIELD.postRotate))
        : null,

    particleLinger: number(field(node, FIELD.particleLinger)) ?? 0,
    emitterLinger: number(field(node, FIELD.emitterLinger)) ?? 0,
    /* A simple emitter reads neither: its linger is the max kind, with no replacement. */
    lingerType: simple
      ? LINGER_TYPE.maxLifetimeAfterEmitterDies
      : lingerType(field(node, FIELD.lingerType)),
    linger: simple ? null : readLinger(field(node, FIELD.linger)),

    palette: readPalette(field(node, FIELD.palette)),
    erosion: readErosion(field(node, FIELD.erosion)),
    distortion: readDistortion(field(node, FIELD.distortion)),
    reflection: readReflection(field(node, FIELD.reflection)),
    soft: readSoft(field(node, FIELD.soft)),
    lookupX: enumByte(field(node, FIELD.lookupX), COLOR_LOOKUP, COLOR_LOOKUP.lifetime),
    lookupY: enumByte(field(node, FIELD.lookupY), COLOR_LOOKUP, COLOR_LOOKUP.constant),
    lookupOffsets: pairOr(field(node, FIELD.lookupOffsets), [0, 0]),
    lookupScales: pairOr(field(node, FIELD.lookupScales), [1, 1]),
    colorTexture: namedAsset(colorTexture),

    rotation0: curve(field(node, FIELD.rotation0), DEFAULT.zero3),
    birthOrbitalVelocity: curve(field(node, FIELD.birthOrbitalVelocity), DEFAULT.zero3),
    birthRotation0: curve(field(node, FIELD.birthRotation0), DEFAULT.zero3),
    birthRotationalVelocity0: curve(field(node, FIELD.birthRotationalVelocity0), DEFAULT.zero3),
    birthRotationalAcceleration: curve(
      field(node, FIELD.birthRotationalAcceleration),
      DEFAULT.zero3,
    ),
    legacySimple,
    pivotUp: legacySimple?.scaleUpFromOrigin === true,
    rotationEnabled: flag(field(node, FIELD.rotationEnabled)),
    directionOriented: flag(field(node, FIELD.directionOriented)),
    directionVelocityScale: number(field(node, FIELD.directionVelocityScale)) ?? 0,
    directionVelocityMinScale:
      number(field(node, FIELD.directionVelocityMinScale)) ?? DIRECTION_MIN_SCALE_DEFAULT,

    scale0: curve(field(node, FIELD.scale0), DEFAULT.one3),
    birthScale0: curve(field(node, FIELD.birthScale0), DEFAULT.one3),
    color: curve(field(node, FIELD.color), DEFAULT.white),
    birthColor: curve(field(node, FIELD.birthColor), DEFAULT.white),
    modulation: channelsOr(field(node, FIELD.modulation), [1, 1, 1, 1]),

    texture:
      customMaterial !== null && !customMaterial.missing
        ? (customMaterial.base?.texture ?? null)
        : namedAsset(texture),
    uv,
    uvMode: uvMode(field(node, FIELD.uvMode)),
    multTexture: namedAsset(multTexture),
    /* `emitterUvScrollRateMult` has no reader, and the base layer's rate moves both. */
    multUv: multLayer === null ? null : { ...multLayer, emitterScrollRate: uv.emitterScrollRate },
    blendMode: blendMode(field(node, FIELD.blendMode)),
    pass: number(field(node, FIELD.pass)) ?? 0,
    miscRenderFlags: number(field(node, FIELD.miscRenderFlags)) ?? 0,
    renderPhaseOverride: phase,
    groundLayer:
      phase === RENDER_PHASE.automatic
        ? !hudLayer && flag(field(node, FIELD.groundLayer))
        : phase === RENDER_PHASE.groundLayer,
    alphaRef: (number(field(node, FIELD.alphaRef)) ?? DEFAULT_ALPHA_REF) / ALPHA_REF_SCALE,
    stencilMode: stencil,
    /* Read off a mode alone. */
    stencilRef:
      stencil === STENCIL_MODE.disabled ? 0 : (number(field(node, FIELD.stencilRef)) ?? 0),
    quadType: quadType(primitive),
    primitiveClass: primitive?.type === "struct" ? primitive.classHash : null,
    primitiveName: primitive?.type === "struct" ? primitive.class : null,
    mesh: readMesh(primitive),
    trail: readTrail(primitive),
    beam: readBeam(primitive),
    projection: readProjection(primitive),
    childSet: readChildSet(field(node, FIELD.childSet), materials),
    fields: readFields(field(node, FIELD.fields)),

    depthBias: pair(field(node, FIELD.depthBias)),
    depthPushPull: number(field(node, FIELD.depthPushPull)) ?? 0,
    backfaceCull: !flag(field(node, FIELD.disableBackfaceCull)),
    flipWinding: flag(field(node, FLIP_WINDING)),
  };
}

/**
 * The emitter can never emit: a `rate` of zero, on an emitter that is no single burst and
 * writes neither a `flexRate` nor a material override.
 */
function neverEmits(node: VfxValue & { type: "struct" }): boolean {
  if (flag(field(node, FIELD.singleParticle))) return false;
  if (field(node, FIELD.flexRate)?.type === "struct") return false;

  const overrides = field(node, FIELD.materialOverrides);
  if (overrides?.type === "container" && overrides.items.length > 0) return false;
  return curveMaximum(curve(field(node, FIELD.rate), DEFAULT.rate)) === 0;
}

/** `constantValue`, which the velocity rate is read off. */
const CONSTANT = nameHash("constantValue");

/** A three-channel value a complex emitter reads, and zeroes for a simple one, which reads none. */
function complex(simple: boolean, node: VfxValue | null) {
  return simple ? DEFAULT.zero3 : curve(node, DEFAULT.zero3);
}

/** The static emission mesh an emitter names, and null for one naming none. */
function readEmissionMesh(node: VfxValue & { type: "struct" }): EmissionMeshModel | null {
  const mesh = namedAsset(field(node, FIELD.emissionMesh));
  if (mesh === null) return null;

  return {
    mesh,
    scale: number(field(node, FIELD.emissionMeshScale)) ?? 1,
    useNormal: flagOr(field(node, FIELD.emissionMeshNormal), true),
  };
}

/**
 * The systems a particle spawns, and null for an emitter naming no child set.
 *
 * A child the resolver could not reach reads as no system rather than dropping out, which
 * keeps its place so `childrenProbability` still indexes the list as authored.
 */
function readChildSet(
  node: VfxValue | null,
  materials: ReadonlyMap<string, MaterialPreview>,
): ChildSetModel | null {
  if (node?.type !== "struct") return null;
  const listed = field(node, CHILD_SET.children);
  const inheritance = field(node, CHILD_SET.inheritance);

  return {
    children:
      listed?.type === "container" ? listed.items.map((child) => readChild(child, materials)) : [],
    bones: texts(field(node, CHILD_SET.bones)),
    probability: curve(field(node, CHILD_SET.probability), DEFAULT.zero),
    onDeath: flag(field(node, CHILD_SET.onDeath)),
    inheritance:
      inheritance?.type === "struct"
        ? {
            mode: number(field(inheritance, INHERITANCE.mode)) ?? 0,
            offset: curve(field(inheritance, INHERITANCE.offset), DEFAULT.zero3),
          }
        : null,
  };
}

/** The system one `VfxChildIdentifier` names, where the resolver inlined it. */
function readChild(
  identifier: VfxValue,
  materials: ReadonlyMap<string, MaterialPreview>,
): SystemModel | null {
  for (const hash of CHILD_NAMES) {
    const held = field(identifier, hash);
    if (held?.type === "struct") {
      return readSystem(held, held.object?.entry ?? null, held.object?.name ?? null, materials);
    }
  }
  return null;
}

/**
 * The gate that keeps the emitter from being instantiated in the preview, and null for none.
 *
 * The preview draws at Very High effects quality on the default palette, and is no
 * spectator. A simple emitter skips the palette gate, and a HUD-layer system drops it.
 * An emitter that can never emit is dropped as its definition is prepared. The keywords of
 * `Filtering` are left ungated, since what supplies an instance's keywords is not
 * established.
 */
function cullOf(
  node: VfxValue & { type: "struct" },
  simple: boolean,
  hudLayer: boolean,
): EmitterCull | null {
  const policy = number(field(field(node, FIELD.filtering), SPECTATOR_POLICY_FIELD)) ?? 0;
  if (
    policy !== SPECTATOR_POLICY.enableAlways &&
    policy !== SPECTATOR_POLICY.disableWhenSpectating
  ) {
    return "spectator";
  }
  if (simple && hudLayer) return "hudLayer";
  if (neverEmits(node)) return "noRate";

  const importance = number(field(node, FIELD.importance)) ?? IMPORTANCE_DEFAULT;
  /* The preview draws at Very High, which culls the low-spec tier alone. */
  if (importance === IMPORTANCE.lowSpecOnly) return "importance";
  if (simple) return null;

  const palette = number(field(node, FIELD.colorblindVisibility)) ?? 0;
  if (palette === COLORBLIND_VISIBILITY.colorblindOnly) return "colorblind";
  if (palette > COLORBLIND_VISIBILITY.colorblindOnly) return "never";

  return null;
}
