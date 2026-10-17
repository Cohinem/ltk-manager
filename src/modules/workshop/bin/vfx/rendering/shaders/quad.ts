import { SHEEN } from "../utils/uniforms";

/**
 * An arbitrary quad's uv off its corner, each row the weights of `(corner.x, corner.y, 1)`.
 *
 * The attested pair, `u = y + 0.5` and `v = 0.5 - x` over the engine's corner, whose `x`
 * runs the other way here because the corner rides the mirrored basis. Decision 2.41 of
 * docs/plans/vfx-particle-renderer.md.
 */
export const ARBITRARY_UV: readonly [Weights, Weights] = [
  [0, 1, 0.5],
  [1, 0, 0.5],
];

type Weights = readonly [number, number, number];

/**
 * Where one quad corner lands in the world, and its uv before either layer's transform.
 *
 * Reads the instanced attributes of `quadBuffers`, `reach` and `pivot`, and three's
 * `modelMatrix`, `viewMatrix` and `cameraPosition`, which the stage including it declares.
 * The hand-written quad and the Hexshade quad prelude share it, so both place a corner alike.
 *
 * Under `SHADOW` the corner faces the scene's eye, `eyeView` and `eyePosition`, rather than
 * the sun's camera that draws it, because the client builds a quad's corners once for the
 * scene camera and draws the shadow pass from the same vertices.
 */
export const QUAD_CORNER = /* glsl */ `
#ifdef SHADOW
uniform mat4 eyeView;
uniform vec3 eyePosition;
#define EYE_VIEW eyeView
#define EYE_POSITION eyePosition
#else
#define EYE_VIEW viewMatrix
#define EYE_POSITION cameraPosition
#endif

const vec3 ARBITRARY_U = vec3(${ARBITRARY_UV[0].join(", ")});
const vec3 ARBITRARY_V = vec3(${ARBITRARY_UV[1].join(", ")});

vec2 cornerUv() {
#if PLANE >= 1 || defined(BILLBOARD) || defined(RAY)
  // The texture's first row is v = 0, so v runs down the quad.
  return vec2(corner.x + 0.5, 0.5 - corner.y);
#else
  return vec2(dot(ARBITRARY_U, vec3(corner, 1.0)), dot(ARBITRARY_V, vec3(corner, 1.0)));
#endif
}

vec4 cornerWorld() {
  // The corner, lifted so the quad grows from its base where the emitter asks, and
  // reaching to the whole of scale0, which is a half-extent.
  vec2 at = vec2(corner.x, corner.y + pivot) * reach;

  // A simple emitter's world plane: the table's U and V in the engine's space, spun
  // about their normal, then mirrored.
#if PLANE >= 1
  {
#if PLANE == 2
    vec3 u = vec3(1.0, 0.0, 0.0);
#else
    vec3 u = vec3(0.0, 1.0, 0.0);
#endif
#if PLANE == 3
    vec3 v = vec3(1.0, 0.0, 0.0);
#else
    vec3 v = vec3(0.0, 0.0, -1.0);
#endif
    vec3 w = cross(v, u);
    // The roll arrives mirrored for the view axis, so it is put back first.
    float turn = -roll;
    float c = cos(turn);
    float s = sin(turn);
    vec3 spunU = u * c + cross(w, u) * s;
    vec3 spunV = v * c + cross(w, v) * s;
    vec3 offset = spunU * (at.y * size.y) + spunV * (at.x * size.x);
    offset.x = -offset.x;
    return modelMatrix * vec4(center + offset, 1.0);
  }
#endif

  // A camera quad spans the view's right and up vectors and faces the eye. Only the roll of
  // its rotation reaches it, because the other two turn it out of that plane.
#ifdef BILLBOARD
  {
#ifdef DIRECTED
    // The travel as the eye sees it is the quad's up, and the roll is ignored. Decision
    // 2.51 of docs/plans/vfx-particle-renderer.md.
    vec2 up = (mat3(EYE_VIEW) * basisY).xy;
    up = dot(up, up) > 0.0 ? normalize(up) : vec2(0.0, 1.0);
    vec2 offset = vec2(up.y, -up.x) * (at.x * size.x) + up * (at.y * size.y);
#else
    // The engine scales the corner before it rolls it, so a turned non-square quad keeps its shape.
    vec2 sized = at * size.xy;
    vec2 offset = vec2(
      sized.x * cos(roll) - sized.y * sin(roll),
      sized.x * sin(roll) + sized.y * cos(roll)
    );
#endif
    vec3 eyeRight = vec3(EYE_VIEW[0][0], EYE_VIEW[1][0], EYE_VIEW[2][0]);
    vec3 eyeUp = vec3(EYE_VIEW[0][1], EYE_VIEW[1][1], EYE_VIEW[2][1]);
    vec4 origin = modelMatrix * vec4(center, 1.0);
    return vec4(origin.xyz + eyeRight * offset.x + eyeUp * offset.y, 1.0);
  }
#endif

  // The basis the particle stands on, built on the CPU, as the viewport sees it.
  mat3 basis = mat3(basisX, basisY, basisZ);

#ifdef RAY
  {
    // A ray lies along the particle's own +Z and rolls about it to face the eye: scale.x
    // across, scale.y along, and scale.z where its near edge starts along the axis. The
    // mirrored space flips a cross product, so the engine's across is the negation of
    // this one.
    vec3 axis = basis[2];
    vec3 aside = cross(axis, EYE_POSITION - center);
    vec3 across = dot(aside, aside) > 0.0 ? -normalize(aside) : basis[0];
    vec3 world = center
      + axis * (size.z + (corner.y + 0.5) * size.y)
      + across * (corner.x * size.x);
    return modelMatrix * vec4(world, 1.0);
  }
#endif

  vec3 world = center + basis[0] * (at.x * size.x) + basis[1] * (at.y * size.y);
  return modelMatrix * vec4(world, 1.0);
}
`;

export const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec3 center;
attribute vec3 size;
attribute vec4 color;
attribute float roll;
attribute vec3 basisX;
attribute vec3 basisY;
attribute vec3 basisZ;
attribute vec3 uvTurn;
attribute vec4 uvShift;
attribute vec3 uvTurnMult;
attribute vec4 uvShiftMult;
attribute vec3 lookup;

uniform float pushPull;
uniform float reach;
uniform float pivot;

varying vec2 vUv;
varying vec4 vColor;
varying vec3 vTurn;
varying vec4 vShift;
varying vec3 vTurnMult;
varying vec4 vShiftMult;
varying vec2 vLookup;
varying float vErode;

// quad_vs's PARTICLE_DEPTH_PUSH_PULL. Decision 2.47 of docs/plans/vfx-particle-renderer.md.
// An orthographic view has no ray from the eye, so the push runs along the view axis.
vec4 pushed(vec4 view) {
  vec3 ray = isOrthographic ? vec3(0.0, 0.0, -1.0) : normalize(view.xyz);
  view.xyz += ray * pushPull;
  return view;
}

${QUAD_CORNER}

void main() {
  vUv = cornerUv();
  vColor = color;
  vTurn = uvTurn;
  vShift = uvShift;
  vTurnMult = uvTurnMult;
  vShiftMult = uvShiftMult;
  vLookup = lookup.xy;
  vErode = lookup.z;

  gl_Position = projectionMatrix * pushed(viewMatrix * cornerWorld());
}
`;

/*
 * The texel at a coordinate, fetched the way the layer's \`TEXTUREADDRESS\` says.
 *
 * The coordinate is brought inside one cell here rather than by the sampler, because
 * the cell is a sub-rectangle of the texture and the sampler's own mode would wrap
 * across the whole atlas. Wrap and mirror fold the coordinate, clamp holds it at the
 * edge, and border is a clamp whose outside reads as nothing.
 */
export const FETCH = /* glsl */ `
vec4 fetch(sampler2D tex, vec2 placed, vec4 shift, vec2 size, int mode) {
  vec2 held;
  if (mode >= 2) {
    held = clamp(placed, 0.0, 1.0);
  } else if (mode == 1) {
    vec2 folded = mod(placed, 2.0);
    held = 1.0 - abs(folded - 1.0);
  } else {
    held = fract(placed);
  }

  vec4 texel = texture2D(tex, shift.zw + held * size);
  bool outside = any(lessThan(placed, vec2(0.0))) || any(greaterThan(placed, vec2(1.0)));
  return mode == 3 && outside ? vec4(0.0) : texel;
}
`;

/*
 * The share of a texel the erosion keeps.
 *
 * The map's value under the mixer is kept where it lies in the band from the drive up by
 * the slice width, ramped in over \`erosionFeatherOut\` below the drive and out over
 * \`erosionFeatherIn\` inside the far edge, each ramp linear at the rate the CPU inverts
 * the feather to. At the drive itself the alpha is already whole.
 */
export const ERODE = /* glsl */ `
#ifdef EROSION
uniform sampler2D mapErosion;
uniform int addressErosion;
uniform vec4 erosionMix;
uniform vec4 erosionDefault;
uniform vec2 featherRate;
uniform float sliceWidth;

varying float vErode;

float kept(float value, float drive) {
  float upper = clamp((drive - value + sliceWidth) * featherRate.x, 0.0, 1.0);
  float lower = clamp((drive - value) * featherRate.y, 0.0, 1.0);
  return upper - lower;
}

/* What the erosion reads at \`at\`, where the base layer's texture samples with its cell:
   its map there, or what the engine leaves in the slot for an emitter that binds none.
   Decision 2.50 of docs/plans/vfx-particle-renderer.md. */
float eroding(vec2 at) {
  vec4 read =
#ifdef HAS_MAP_EROSION
    fetch(mapErosion, at, vec4(0.0), vec2(1.0), addressErosion);
#else
    erosionDefault;
#endif
  return kept(clamp(dot(read, erosionMix), 0.0, 1.0), vErode);
}
#else
float eroding(vec2 at) { return 1.0; }
#endif
`;

/**
 * What a distorting fragment covers, taken from where its offset carries it.
 *
 * The map's `xy` is the direction, flat at `0.5`, and its **alpha** is the mask: it is
 * what shapes the warp and how much of it the fragment carries. `distortion` is how far,
 * in screen widths, with the horizontal half scaled by the aspect so a round warp stays
 * round, and the screen's edge pulls in the edge itself. A map the install does not ship
 * warps nothing rather than the whole quad. The map samples under the base layer's address
 * mode, which is the mode the engine binds `NORMAL_MAP` with. Decision 2.25 of
 * docs/plans/vfx-particle-renderer.md.
 *
 * `onScreen` places the fragment on the target from `viewportOrigin`, which a draw into only
 * part of its canvas, a graph node's preview, moves off zero.
 */
export const WARP = /* glsl */ `
uniform vec2 viewport;
uniform vec2 viewportOrigin;

vec2 onScreen() {
  return (gl_FragCoord.xy - viewportOrigin) / viewport;
}

#ifdef DISTORTS
uniform sampler2D mapNormal;
uniform float warp;
uniform sampler2D frame;

vec4 warped(vec2 at, float mask) {
  vec4 held =
#ifdef HAS_NORMAL
    fetch(mapNormal, at, vec4(0.0), vec2(1.0), address);
#else
    vec4(0.5, 0.5, 1.0, 0.0);
#endif
  float shown = mask * held.a;
  vec2 push = (held.xy * 2.0 - 1.0) * warp * shown * vec2(viewport.y / viewport.x, 1.0);
  vec2 taken = clamp(onScreen() + push, 0.0, 1.0);
  return vec4(texture2D(frame, taken).rgb, shown);
}
#endif
`;

/*
 * The palette and then the colour ramp.
 *
 * The palette replaces the colour and keeps the alpha: \`u\` is the texel under the mix
 * weights and \`v\` the row, each moved by its animation curve. The ramp is multiplied in
 * after it, at the particle's own lookup, or at the mult layer's uv where \`rampAtMult\`
 * says the lane carries that instead.
 */
export const COLOR = /* glsl */ `
uniform sampler2D mapRamp;
uniform sampler2D mapPalette;
uniform int addressPalette;
uniform vec4 paletteMix;
uniform float paletteRow;
uniform vec2 paletteScroll;

#ifdef SLICE
uniform float sliceRange;

/*
 * QUAD_PS_Slice and MESH_PS_Slice: the texel's red is a threshold that the ramp's alpha
 * keeps a band of \`sliceRange\` around, and the texel's alpha scales the band. The quad's
 * colour also takes the texel's green. Neither reads the vertex alpha.
 */
vec4 sliced(vec4 texel, vec2 lookup, vec4 color) {
#ifdef SLICE_RAMP
  vec4 ramp = texture2D(mapRamp, lookup);
#else
  vec4 ramp = vec4(1.0);
#endif
  float gap = (ramp.a - texel.r) / sliceRange;
  vec3 rgb = ramp.rgb * color.rgb;
#if SLICE == 1
  rgb *= texel.g;
#endif
  return vec4(rgb, clamp((1.0 - gap * gap) * texel.a, 0.0, 1.0));
}
#endif

vec4 colored(vec4 texel, vec2 lookup) {
#ifdef HAS_PALETTE
  vec2 at = vec2(clamp(dot(texel, paletteMix), 0.0, 1.0), paletteRow) + paletteScroll;
  texel.rgb = fetch(mapPalette, at, vec4(0.0), vec2(1.0), addressPalette).rgb;
#endif
#ifdef HAS_RAMP
  texel *= texture2D(mapRamp, lookup);
#endif
  return texel;
}
`;

/**
 * The rim and the reflection added over the colour, as `mesh_ps` and `particle_ps` add them.
 *
 * `SHEEN` names the alpha that carries them, as `SHEEN` in uniforms.ts states it.
 * `saturated` clamps the colour after the soft fade, where both shaders clamp it.
 */
const SHEEN_FRAGMENT = /* glsl */ `
#if SHEEN == ${SHEEN.none}
vec4 shone(vec4 lit, float texelAlpha, float drawnAlpha) {
  return lit;
}

vec4 saturated(vec4 lit) {
  return lit;
}
#else
uniform samplerCube mapReflection;
uniform vec3 reflectionTint;

varying vec3 vRim;
varying vec4 vReflect;

vec4 shone(vec4 lit, float texelAlpha, float drawnAlpha) {
  float carrier = SHEEN == ${SHEEN.texel} ? texelAlpha : drawnAlpha;
  vec3 mirrored = vec3(0.0);
#ifdef REFLECTS
  mirrored = textureCube(mapReflection, vReflect.xyz).rgb * vReflect.w
    * mix(vec3(1.0), reflectionTint, vReflect.w);
  if (SHEEN == ${SHEEN.texel}) mirrored *= texelAlpha;
#endif
  lit.rgb += mirrored + vRim * carrier;
  return lit;
}

vec4 saturated(vec4 lit) {
  lit.rgb = clamp(lit.rgb, 0.0, 1.0);
  return lit;
}
#endif
`;

/**
 * The soft fade over the gap from the fragment back to the scene.
 *
 * `quad_ps` and `mesh_ps`'s own fade, reading `viewport` off `WARP`. Decision 2.43 of
 * docs/plans/vfx-particle-renderer.md.
 */
export const SOFT = /* glsl */ `
#include <packing>

#ifdef SOFT
uniform vec4 softParams;
uniform vec4 softControl;
uniform sampler2D sceneDepth;
uniform vec2 depthRange;

// An orthographic camera stores depth linearly, a perspective one as its reciprocal.
float viewZOf(float depth) {
  return isOrthographic
    ? orthographicDepthToViewZ(depth, depthRange.x, depthRange.y)
    : perspectiveDepthToViewZ(depth, depthRange.x, depthRange.y);
}

vec4 softened(vec4 lit) {
  float stored = texture2D(sceneDepth, onScreen()).r;
  float scene = viewZOf(stored);
  float here = viewZOf(gl_FragCoord.z);
  vec2 through = clamp((here - scene - softParams.xy) * softParams.zw, 0.0, 1.0);
  vec2 eased = through * through * (3.0 - 2.0 * through);
  float fade = eased.x - eased.y;
  lit.rgb *= softControl.x + fade * softControl.y;
  lit.a *= softControl.z + fade * softControl.w;
  return lit;
}
#else
vec4 softened(vec4 lit) { return lit; }
#endif
`;

/** The flat colour `wireMaterial` draws its edges in, declared only where it asks for them. */
export const WIRE = /* glsl */ `
#ifdef WIREFRAME
uniform vec4 wireColor;
#endif
`;

/** The least coverage the shadow pass keeps, the constant of `SHADOW_QUAD_PS` and its twins. */
export const SHADOW_ALPHA = 0.025;

/**
 * The shadow pass's fragment, which `SHADOW_QUAD_PS`, `SHADOW_MESH_PS` and
 * `PARTICLE_SHADOW_PS` share: the texel's alpha, the vertex alpha, the ramp's alpha and the
 * erosion multiply, a fragment under `SHADOW_ALPHA` is discarded and the rest write depth.
 * Neither `alphaRef` nor the blend mode applies.
 */
export const CAST = /* glsl */ `
#ifdef SHADOW
const float SHADOW_ALPHA = ${SHADOW_ALPHA.toFixed(3)};

void cast(float texelAlpha, float vertexAlpha, vec2 lookup, float erosion) {
  float covered = texelAlpha * vertexAlpha * erosion;
#ifdef HAS_RAMP
  covered *= texture2D(mapRamp, lookup).a;
#endif
  if (covered < SHADOW_ALPHA) discard;
  gl_FragColor = vec4(1.0);
}
#endif
`;

/** The least base texel alpha a pick counts as drawn. A clear corner of a quad picks nothing. */
export const PICK_ALPHA = 0.05;

/** The id `pickMaterial` writes in place of a colour, declared only where it asks for one. */
export const PICK = /* glsl */ `
#ifdef PICK
uniform vec4 pickId;
const float PICK_ALPHA = ${PICK_ALPHA.toFixed(2)};
#endif
`;

/**
 * One layer's coordinate, in cells: the 2x3 matrix.
 *
 * The scale and the rotation act about `uvTransformCenter` and the scroll translates
 * after them. A flip mirrors the result within the cell, a post-multiply, so a flipped
 * layer's scroll runs the other way. The fragment pass and the Hexshade quad prelude share
 * it.
 */
export const LAYER_UV = /* glsl */ `
vec2 layerUv(vec2 uv, vec3 turn, vec4 shift, vec2 about, vec2 mirrored) {
  vec2 placed = (uv - about) * turn.yz;
  float c = cos(turn.x);
  float s = sin(turn.x);
  placed = vec2(placed.x * c - placed.y * s, placed.x * s + placed.y * c);
  placed += about + shift.xy;
  return mix(placed, 1.0 - placed, mirrored);
}
`;

/*
 * The fragment pass a quad and a mesh share, each with its own vertex shader in front.
 *
 * A quad with no texture falls off from its centre rather than drawing a flat white
 * square, because an untextured particle is one whose texture has not arrived or that
 * the install does not ship, and a square of full white reads as a bug. A mesh draws
 * flat instead, having a silhouette of its own, which \`falloff\` switches.
 */
export const FRAGMENT = /* glsl */ `
${WIRE}
${PICK}
uniform sampler2D map;
uniform float alphaRef;
uniform vec2 cell;
uniform vec2 center;
uniform vec2 flip;
uniform int address;

uniform sampler2D mapMult;
uniform vec2 cellMult;
uniform vec2 centerMult;
uniform vec2 flipMult;
uniform int addressMult;

varying vec2 vUv;
varying vec4 vColor;
varying vec3 vTurn;
varying vec4 vShift;
varying vec3 vTurnMult;
varying vec4 vShiftMult;
varying vec2 vLookup;

${LAYER_UV}

${FETCH}
${COLOR}
${ERODE}
${CAST}
${WARP}
${SHEEN_FRAGMENT}
${SOFT}

void main() {
#ifdef WIREFRAME
  gl_FragColor = wireColor;
  return;
#endif
  vec4 texel = vec4(1.0);
  vec2 placed = layerUv(vUv, vTurn, vShift, center, flip);
#ifdef HAS_MAP
  texel = fetch(map, placed, vShift, cell, address);
  /* LOCK_ALPHA: a quad's alpha samples the whole texture at its own corner, and a mesh's
     at its uv turned and scaled without the translation that carries the scroll and the
     cell. */
#if LOCK_ALPHA == 1
  texel.a = texture2D(map, vUv).a;
#elif LOCK_ALPHA == 2
  vec2 held = vUv * vTurn.yz;
  float c = cos(vTurn.x);
  float s = sin(vTurn.x);
  held = vec2(held.x * c - held.y * s, held.x * s + held.y * c);
  texel.a = fetch(map, mix(held, 1.0 - held, flip), vec4(0.0), vec2(1.0), address).a;
#endif
#elif defined(FALLOFF)
  texel.a = 1.0 - smoothstep(0.0, 0.5, length(vUv - 0.5));
#endif
#ifdef PICK
  if (texel.a < PICK_ALPHA) discard;
  gl_FragColor = pickId;
  return;
#endif
#ifdef SHADOW
  cast(texel.a, vColor.a, vLookup, eroding(vShift.zw + placed * cell));
  return;
#endif
#ifdef SLICE
  vec4 slice = sliced(texel, vLookup, vColor);
  if (slice.a < alphaRef) discard;
  gl_FragColor = slice;
  return;
#endif
  float share = eroding(vShift.zw + placed * cell);

  /* quad_vs routes the mult layer's uv down the lane the ramp's lookup rides, in texture
     space and unfolded, so the ramp reads there too under a mult layer. */
  vec2 atMult = layerUv(vUv, vTurnMult, vShiftMult, centerMult, flipMult);
#ifdef RAMP_AT_MULT
  texel = colored(texel, vShiftMult.zw + atMult * cellMult);
#else
  texel = colored(texel, vLookup);
#endif
#ifdef HAS_MAP_MULT
  texel *= fetch(mapMult, atMult, vShiftMult, cellMult, addressMult);
#endif
  float uneroded = texel.a;
  texel.a *= share;

  vec4 lit = texel * vColor;
  lit = saturated(softened(shone(lit, uneroded, uneroded * vColor.a)));
  if (lit.a < alphaRef) discard;

#ifdef DISTORTS
  gl_FragColor = warped(placed, lit.a);
#else
  gl_FragColor = lit;
#endif
}
`;
