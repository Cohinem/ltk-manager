import {
  ClampToEdgeWrapping,
  MirroredRepeatWrapping,
  type Object3D,
  type RawShaderMaterial,
  RepeatWrapping,
  type Side,
  type Texture,
  type Wrapping,
} from "three";

import type { ParticleDefine, ParticleShader, PassParam, PassProgram } from "@/lib/tauri";
import {
  blackCube,
  blackTexel,
  borderProgramTexture,
  createProgramMaterial,
  type EngineEnvironment,
  type ReadyProgram,
  SCREEN_COPY,
  type SubmeshProgram,
  type VertexPrelude,
  whiteTexel,
  writeProgramMember,
} from "@/modules/viewport";

import {
  ADDRESS_MODE,
  type AddressMode,
  SOFT_TARGET,
  UV_MODE,
  type UvMode,
} from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";
import type { EmitterSamplers } from "../hooks/useVfxTextures";
import { drawState, fragmentTests } from "./blend";
import { distorts, drawsAsMesh, drawsTheAttachment } from "./drawKind";
import { FRAME } from "./frame";
import { drawsPalette } from "./palette";
import { fadeOf, softControl, softParams } from "./softParticle";
import {
  colorUniforms,
  type DepthBias,
  erosionUniforms,
  type LayerDraws,
  layersOf,
  polygonOffsetOf,
  type QuadLayers,
  sheenUniforms,
} from "./uniforms";

/** The engine particle shader pair one emitter draws with, and the defines it sets on it. */
export interface ParticlePair {
  readonly shader: ParticleShader;
  readonly defines: readonly ParticleDefine[];
}

/**
 * The pair and define set the engine picks for `emitter`, per "What the data is" in
 * docs/plans/hexshade-vfx.md.
 *
 * A distorting emitter takes the distortion pair of its kind, which reads the alpha test
 * alone. Any other pair follows the mesh the emitter resolves, then a `REFLECTIVE` quad's
 * borrowed mesh pair, then the uv mode. A quad takes a separate file for its uv mode in
 * place of the define.
 */
export function particleShaderOf(emitter: EmitterModel): ParticlePair {
  const shader = pairOf(emitter);
  const defines: ParticleDefine[] = [];
  if (emitter.alphaRef !== 0) defines.push("ALPHA_TEST");
  if (distorts(emitter)) return { shader, defines };

  if (emitter.erosion !== null) defines.push("ALPHA_EROSION");
  if (emitter.multUv !== null) defines.push("MULT_PASS");
  if (drawsPalette(emitter.palette)) defines.push("PALETTIZE_TEXTURES");
  if (emitter.soft !== null) defines.push("SOFT_PARTICLES");
  if (emitter.reflection !== null) defines.push("REFLECTIVE");

  const mesh = shader === "mesh" || shader === "attachedMesh";
  if (mesh && (drawsAsMesh(emitter) || drawsTheAttachment(emitter))) {
    defines.push(...uvModeDefines(emitter.uvMode), "USE_VERTEX_COLORS");
  }
  return { shader, defines };
}

function pairOf(emitter: EmitterModel): ParticleShader {
  if (distorts(emitter)) {
    if (drawsTheAttachment(emitter)) return "distortionAttachedMesh";
    return drawsAsMesh(emitter) ? "distortionMesh" : "distortion";
  }
  if (drawsTheAttachment(emitter)) return "attachedMesh";
  if (drawsAsMesh(emitter) || emitter.reflection !== null) return "mesh";
  if (emitter.uvMode === UV_MODE.screenSpace) return "quadScreenSpaceUv";
  if (emitter.uvMode === UV_MODE.lockAlpha) return "quadFixedAlphaUv";
  return "quad";
}

function uvModeDefines(mode: UvMode): ParticleDefine[] {
  if (mode === UV_MODE.screenSpace) return ["SCREEN_SPACE_UV"];
  if (mode === UV_MODE.lockAlpha) return ["SEPARATE_ALPHA_UV"];
  if (mode === UV_MODE.default) return [];
  return ["LOCAL_SPACE_UV"];
}

/** The component drawing an emitter's particles: quads and ribbons, mesh instances, or a skin. */
export type ParticlePath = "quad" | "mesh" | "attached";

/** The pairs each path's geometry feeds. */
const PATH_PAIRS: Readonly<Record<ParticlePath, readonly ParticleShader[]>> = {
  quad: ["quad", "distortion"],
  mesh: ["mesh", "distortionMesh"],
  attached: ["attachedMesh", "distortionAttachedMesh"],
};

/**
 * The emitter's particles can draw on `path` through the translated `pair`.
 *
 * A custom material draws through the programs it names. A slice draws through the
 * hand-written material, since no slice pair is translated.
 */
export function drawsProgram(
  emitter: EmitterModel,
  pair: ParticlePair,
  path: ParticlePath,
): boolean {
  if (!PATH_PAIRS[path].includes(pair.shader)) return false;
  if (emitter.sliceRange > 0) return false;
  return emitter.customMaterial == null || emitter.customMaterial.missing;
}

/**
 * How one path feeds a translated pair: the prelude over its geometry, what the prelude
 * reads off the emitter, and the faces and the depth offset the path draws with.
 */
export interface ParticleDraw {
  readonly path: ParticlePath;
  readonly prelude: VertexPrelude | null;
  /** The space the prelude states a position in, which the environment's clip transform takes. */
  readonly world: Object3D | null;
  /** The prelude's defines and uniforms for `emitter`. */
  readonly feed: (material: RawShaderMaterial, emitter: EmitterModel) => void;
  readonly side: (emitter: EmitterModel) => Side;
  readonly bias: (emitter: EmitterModel) => DepthBias;
}

/**
 * Each engine texture of `emitter` by the bytecode's name, and null while the base loads.
 *
 * A pair names the ones it samples. An erosion with no map reads white and a named map
 * that is missing reads transparent black, as does a missing normal map, which warps
 * nothing.
 *
 * Each samples at its layer's address mode. The colour ramp is always clamped, and the
 * normal map takes the base layer's mode.
 */
export function particleTextures(
  emitter: EmitterModel,
  samplers: EmitterSamplers,
): ReadonlyMap<string, Texture> | null {
  if (samplers.base === null) return null;
  if (drawsPalette(emitter.palette) && samplers.palette === null) return null;

  const modes = addressModes(emitter);
  const erosion =
    emitter.erosion === null || emitter.erosion.map === null
      ? whiteTexel()
      : (addressed(samplers.erosion, modes.sAlphaErosionTexture) ?? blackTexel());
  const textures: Record<keyof typeof modes, Texture> = {
    TEXTURE: addressed(samplers.base, modes.TEXTURE),
    TEXTUREMULT: addressed(samplers.mult, modes.TEXTUREMULT) ?? whiteTexel(),
    PARTICLE_COLOR_TEXTURE: addressed(samplers.color, modes.PARTICLE_COLOR_TEXTURE) ?? whiteTexel(),
    sPalettesTexture: addressed(samplers.palette, modes.sPalettesTexture) ?? whiteTexel(),
    sAlphaErosionTexture: erosion,
    NORMAL_MAP: addressed(samplers.normal, modes.NORMAL_MAP) ?? blackTexel(),
  };
  return new Map(Object.entries(textures));
}

/** The address mode each engine texture of `emitter` samples at, by the bytecode's name. */
function addressModes(emitter: EmitterModel) {
  const base = emitter.uv.addressMode;
  return {
    TEXTURE: base,
    TEXTUREMULT: emitter.multUv?.addressMode ?? ADDRESS_MODE.wrap,
    PARTICLE_COLOR_TEXTURE: ADDRESS_MODE.clamp,
    sPalettesTexture: emitter.palette?.addressMode ?? ADDRESS_MODE.mirror,
    sAlphaErosionTexture: emitter.erosion?.addressMode ?? ADDRESS_MODE.clamp,
    NORMAL_MAP: base,
  } satisfies Record<string, AddressMode>;
}

/** The engine textures `emitter` samples under a border address mode, by the bytecode's name. */
export function borderedTextures(emitter: EmitterModel): string[] {
  return Object.entries(addressModes(emitter))
    .filter(([, mode]) => mode === ADDRESS_MODE.border)
    .map(([name]) => name);
}

/** The copies of a cached texture, one per wrap other than the texture's own. */
const ADDRESSED = new WeakMap<Texture, Map<Wrapping, Texture>>();

/**
 * `texture` sampled at `mode`, which the engine sets on the sampler and the hand-written
 * quad folds into the coordinate itself.
 *
 * The texture cache shares one texture across every emitter and slot naming its file, so a
 * mode other than the texture's own samples a copy that shares its image. The copy is
 * disposed when the cached texture is disposed. Only the address changes, since a filter
 * asking for mipmaps would leave a texture loaded without them incomplete.
 *
 * Border has no GL mode. It clamps to the edge here, and `borderProgramTexture` makes the
 * pixel stage read transparent black outside the texture.
 */
function addressed(texture: Texture, mode: AddressMode): Texture;
function addressed(texture: Texture | null, mode: AddressMode): Texture | null;
function addressed(texture: Texture | null, mode: AddressMode): Texture | null {
  const wrap = WRAPPING[mode];
  if (texture === null || (texture.wrapS === wrap && texture.wrapT === wrap)) return texture;

  const copies = ADDRESSED.get(texture) ?? new Map<Wrapping, Texture>();
  if (!ADDRESSED.has(texture)) {
    ADDRESSED.set(texture, copies);
    texture.addEventListener("dispose", () => {
      for (const copy of copies.values()) copy.dispose();
      copies.clear();
    });
  }

  const held = copies.get(wrap);
  if (held !== undefined) return held;

  /* shortcut: the image uploads once more per wrap where the hand-written material also drew
     the cached texture, key the texture cache by wrap when that memory matters. */
  const copy = texture.clone();
  copy.wrapS = wrap;
  copy.wrapT = wrap;
  copy.needsUpdate = true;
  copies.set(wrap, copy);
  return copy;
}

const WRAPPING: Record<AddressMode, Wrapping> = {
  [ADDRESS_MODE.wrap]: RepeatWrapping,
  [ADDRESS_MODE.mirror]: MirroredRepeatWrapping,
  [ADDRESS_MODE.clamp]: ClampToEdgeWrapping,
  [ADDRESS_MODE.border]: ClampToEdgeWrapping,
};

/** Every layer a pair can read, which each pair's members then pick from. */
const EVERY_LAYER: LayerDraws = { ramp: true, sheen: true, fade: true };

/**
 * The `$Globals` members of every particle pair, off the emitter's definition.
 *
 * A pair's blob declares the ones it reads. `TEXTURE_INFO` is the identity, since a prelude
 * places each cell itself. The palette's scroll lands in `cPaletteSelectMain.zw` per frame.
 * The colour, the uv rows, the ramp lookup and the erosion drive of a mesh are the prelude's
 * per instance, and an attached mesh's are written per particle.
 */
export function particleParams(emitter: EmitterModel, layers: QuadLayers): PassParam[] {
  const color = colorUniforms(layers);
  const erosion = erosionUniforms(layers.erosion, layers.erosionTexture);
  const sheen = sheenUniforms(layers.reflection, null);
  const soft = fadeOf(emitter);
  const [featherIn, featherOut] = erosion.featherRate.value;

  const members: Record<string, readonly number[]> = {
    TEXTURE_INFO: IDENTITY_INFO,
    TEXTURE_INFO_2: IDENTITY_INFO,
    PARTICLE_DEPTH_PUSH_PULL: [emitter.depthPushPull],
    AlphaTestReferenceValue: [emitter.alphaRef],
    cAlphaErosionParams: [0, erosion.sliceWidth.value, featherIn ?? 0, featherOut ?? 0],
    cAlphaErosionTextureMixer: erosion.erosionMix.value,
    [PALETTE_SELECT]: [color.paletteRow.value, 0, 0, 0],
    cPaletteSrcMixerMain: color.paletteMix.value,
    cSoftParticleParams: soft === null ? [0, 0, 0, 0] : softParams(soft),
    cSoftParticleControl: softControl(soft?.target ?? SOFT_TARGET.both),
    kColorFactor: [1, 1, 1, 1],
    vFresnel: sheen.fresnel.value,
    vReflection: sheen.reflection.value,
    vReflectionFColor: sheen.reflectionTint.value,
    DistortionPower: [emitter.distortion?.strength ?? 0],
  };
  return asParams(members);
}

/** Each `$Globals` member of `members` as a parameter, padded to four components. */
function asParams(members: Record<string, readonly number[]>): PassParam[] {
  return Object.entries(members).map(([name, value]) => ({
    name,
    value: [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0],
    source: "material",
  }));
}

/** `{cols, 1/cols, 1/rows}` of a book of one cell. */
const IDENTITY_INFO = [1, 1, 1, 0];

/** The `$Globals` member whose `zw` carries the palette's scroll. */
const PALETTE_SELECT = "cPaletteSelectMain";

/** The component of `PALETTE_SELECT` the scroll starts at. */
const PALETTE_SCROLL = 2;

/** The palette's scroll this frame, written into `material`'s `cPaletteSelectMain.zw`. */
export function writePaletteScroll(material: RawShaderMaterial, scroll: readonly number[]): void {
  writeProgramMember(material, PALETTE_SELECT, scroll, PALETTE_SCROLL);
}

/** What one attached particle's slot writes per draw, where `MESH_PRELUDE` writes it per instance. */
export interface SlotMembers {
  readonly color: ArrayLike<number>;
  /** Each layer's rows, as `uvRowsInto` states them. */
  readonly rows: readonly [ArrayLike<number>, ArrayLike<number>];
  readonly lookup: ArrayLike<number>;
  readonly drive: number;
}

const COLOR_FACTOR = "kColorFactor";
const UV_ROWS = ["vParticleUVTransform", "vParticleUVTransformMult"] as const;
const COLOR_LOOKUP = "COLOR_LOOKUP_UV";
const EROSION_PARAMS = "cAlphaErosionParams";
const DRIVE = new Float32Array(1);

/** `members` written into an attached particle's `material`, the drive into `cAlphaErosionParams.x`. */
export function writeSlotMembers(material: RawShaderMaterial, members: SlotMembers): void {
  writeProgramMember(material, COLOR_FACTOR, members.color);
  UV_ROWS.forEach((member, layer) => writeProgramMember(material, member, members.rows[layer]));
  writeProgramMember(material, COLOR_LOOKUP, members.lookup);
  DRIVE[0] = members.drive;
  writeProgramMember(material, EROSION_PARAMS, DRIVE);
}

/** The samplers of the engine textures a program material binds past its texture table. */
const REFLECTION_MAP = "REFLECTION_MAP_TX";
const SCENE_DEPTH_SAMPLER = "sDepthTexture_SharedTexture";

/**
 * The material `emitter` draws with through the translated pair `read`, fed by `draw`, and
 * blending as the hand-written material does.
 *
 * `depth` is the scene's depth a soft fade reads, bound where the pass compiles the fade.
 */
export function particleProgramMaterial(
  read: PassProgram & { readonly program: ReadyProgram },
  emitter: EmitterModel,
  samplers: EmitterSamplers,
  textures: ReadonlyMap<string, Texture>,
  draw: ParticleDraw,
  environment: EngineEnvironment,
  depth: Texture | null,
): RawShaderMaterial {
  const layers = layersOf(emitter, samplers, EVERY_LAYER);
  const pass = { ...read.pass, params: particleParams(emitter, layers) };
  const material = createProgramMaterial(
    { material: "", index: 0, pass, program: read.program, textures },
    environment,
    draw.prelude,
  );
  for (const name of borderedTextures(emitter)) borderProgramTexture(material, name);

  const bound: Record<string, Texture | null> = {
    [SCENE_DEPTH_SAMPLER]: depth,
    [SCREEN_COPY]: FRAME,
    [REFLECTION_MAP]: samplers.reflection ?? blackCube(),
  };
  for (const [name, texture] of Object.entries(bound)) {
    const uniform = material.uniforms[name];
    if (uniform !== undefined && texture !== null) uniform.value = texture;
  }

  const tests = fragmentTests(emitter);
  const state = drawState(emitter.blendMode, distorts(emitter));
  Object.assign(material, {
    side: draw.side(emitter),
    depthTest: tests.depthTest,
    depthWrite: state.depthWrite,
    transparent: state.transparent && !emitter.groundLayer,
    blending: state.blending,
    blendSrc: state.blendSrc,
    blendDst: state.blendDst,
    blendEquation: state.blendEquation,
    blendSrcAlpha: state.blendSrcAlpha,
    blendDstAlpha: state.blendDstAlpha,
    colorWrite: true,
    ...polygonOffsetOf(draw.bias(emitter)),
  });
  draw.feed(material, emitter);
  return material;
}

/**
 * The material one translated pass of `emitter`'s custom material draws with, fed by `draw`.
 *
 * The pass keeps the material's blend and depth state, as the engine draws a material's
 * passes. The vertex stage's engine members the material's parameters leave out are
 * written after them, and each runtime switch reaches its `switch_` float through the pass.
 */
export function customParticleMaterial(
  program: SubmeshProgram,
  emitter: EmitterModel,
  draw: ParticleDraw,
  environment: EngineEnvironment,
): RawShaderMaterial {
  const engine = asParams({
    TEXTURE_INFO: IDENTITY_INFO,
    TEXTURE_INFO_2: IDENTITY_INFO,
    PARTICLE_DEPTH_PUSH_PULL: [emitter.depthPushPull],
  });
  const pass = { ...program.pass, params: [...program.pass.params, ...engine] };
  const material = createProgramMaterial({ ...program, pass }, environment, draw.prelude);

  draw.feed(material, emitter);
  Object.assign(material, polygonOffsetOf(draw.bias(emitter)));
  if (emitter.groundLayer) material.transparent = false;
  return material;
}
