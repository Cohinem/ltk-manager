import { describe, expect, it } from "vitest";

import type { AssetRef, VfxSystem, VfxValue } from "@/lib/tauri";

import { hashOf, nameHash } from "../../../../shared/utils/binHash";
import { materialPreview } from "../../../rendering/utils/__tests__/materialFixture";
import {
  drawsAsMesh,
  drawsAsProjection,
  drawsAsQuad,
  drawsTheAttachment,
  facesTheCamera,
  isRay,
  isUndrawn,
  isUnitQuad,
} from "../../../rendering/utils/drawKind";
import {
  ADDRESS_MODE,
  BLEND_MODE,
  COLOR_LOOKUP,
  DRAG_MOTION,
  LINGER_TYPE,
  QUAD_TYPE,
  RENDER_PHASE,
  SOFT_TARGET,
  STENCIL_MODE,
  UV_MODE,
} from "../../model/enums";
import { readVfxSystem } from "../readVfxSystem";

/** A struct of `fields`, each keyed by its name, or by its hash where the key is one. */
function struct(classHash: string, fields: Record<string, VfxValue>): VfxValue {
  return {
    type: "struct",
    classHash,
    class: null,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({
      hash: hashOf(name),
      name,
      value,
    })),
  };
}

function number(value: number): VfxValue {
  return { type: "number", value };
}

function bool(value: boolean): VfxValue {
  return { type: "bool", value };
}

function vector(...values: number[]): VfxValue {
  return { type: "vector", values };
}

function container(...items: VfxValue[]): VfxValue {
  return { type: "container", items };
}

/** A value class holding a constant and no curve, which is what most emitters write. */
function constantOf(value: VfxValue): VfxValue {
  return struct(nameHash("ValueFloat"), { constantValue: value, dynamics: { type: "null" } });
}

/** A value class whose curve is the two lists the sampler reads in step. */
function keyed(times: number[], values: VfxValue[]): VfxValue {
  return struct(nameHash("ValueVector3"), {
    constantValue: vector(1, 1, 1),
    dynamics: struct(nameHash("VfxAnimatedVector3fVariableData"), {
      times: container(...times.map(number)),
      values: container(...values),
    }),
  });
}

function system(
  emitters: VfxValue[],
  simple: VfxValue[] = [],
  own: Record<string, VfxValue> = {},
): VfxSystem {
  return {
    materials: [],
    entry: "0x12345678",
    name: "particles/test",
    classHash: nameHash("VfxSystemDefinitionData"),
    class: "VfxSystemDefinitionData",
    root: struct(nameHash("VfxSystemDefinitionData"), {
      complexEmitterDefinitionData: container(...emitters),
      simpleEmitterDefinitionData: container(...simple),
      ...own,
    }),
  };
}

/** A system on the HUD layer, which is `drawingLayer` 1. */
function hudSystem(emitters: VfxValue[], simple: VfxValue[] = []): VfxSystem {
  return system(emitters, simple, { drawingLayer: number(1) });
}

function emitter(fields: Record<string, VfxValue>): VfxValue {
  return struct(nameHash("VfxEmitterDefinitionData"), fields);
}

describe("readVfxSystem", () => {
  it("selects the custom material's base texture through a resolved material link", () => {
    const preview = materialPreview({
      base: {
        name: "Diffuse_Texture",
        texture: { path: "assets/custom.tex", asset: null },
        rule: "exact",
        wrap: ["repeat", "clamp"],
      },
    });
    const material: VfxValue = {
      type: "struct",
      classHash: nameHash("StaticMaterialDef"),
      class: null,
      fields: [],
      object: { entry: preview.hash, name: preview.name },
    };
    const value = system([
      emitter({
        CustomMaterial: struct(nameHash("VfxMaterialDefinitionData"), { Material: material }),
      }),
    ]);
    value.materials = [preview];

    const [model] = readVfxSystem(value).emitters;

    expect(model.customMaterial).toEqual(preview);
    expect(model.texture).toEqual(preview.base?.texture);
  });

  it("keeps a missing custom material and the authored fallback texture", () => {
    const preview = materialPreview({ missing: true });
    const fallback = { type: "asset", path: "assets/fallback.tex", asset: null } as const;
    const value = system([
      emitter({
        texture: fallback,
        CustomMaterial: struct(nameHash("VfxMaterialDefinitionData"), {
          Material: { type: "link", hash: preview.hash, name: preview.name },
        }),
      }),
    ]);
    value.materials = [preview];

    const [model] = readVfxSystem(value).emitters;

    expect(model.customMaterial?.missing).toBe(true);
    expect(model.texture?.path).toBe(fallback.path);
  });

  it("shares resolved custom materials with nested child systems", () => {
    const preview = materialPreview();
    const child = system([
      emitter({
        CustomMaterial: struct(nameHash("VfxMaterialDefinitionData"), {
          Material: { type: "link", hash: preview.hash, name: preview.name },
        }),
      }),
    ]);
    const value = system([
      emitter({
        childParticleSetDefinition: struct(nameHash("VfxChildParticleSetDefinitionData"), {
          childrenIdentifiers: container(
            struct(nameHash("VfxChildIdentifier"), { effect: child.root }),
          ),
        }),
      }),
    ]);
    value.materials = [preview];

    const [model] = readVfxSystem(value).emitters;

    expect(model.childSet?.children[0]?.emitters[0].customMaterial).toEqual(preview);
  });

  it("reads kAnalyticDragMotion off the system's flags, and off at their default", () => {
    const flagged = (flags: number): VfxSystem => ({
      ...system([]),
      root: struct(nameHash("VfxSystemDefinitionData"), { flags: number(flags) }),
    });

    expect(readVfxSystem(flagged(0x1d4)).dragMotion).toBe(DRAG_MOTION.analytic);
    expect(readVfxSystem(flagged(0x0c4)).dragMotion).toBe(DRAG_MOTION.stepped);
    expect(readVfxSystem(system([])).dragMotion).toBe(DRAG_MOTION.stepped);
  });

  it("reads buildUpTime off the system, and none where it is not written", () => {
    const built: VfxSystem = {
      ...system([]),
      root: struct(nameHash("VfxSystemDefinitionData"), { buildUpTime: number(5) }),
    };

    expect(readVfxSystem(built).buildUpTime).toBe(5);
    expect(readVfxSystem(system([])).buildUpTime).toBe(0);
  });

  it("reads emitterLinger and the direction stretch, at their schema defaults where unwritten", () => {
    const [bare, written] = readVfxSystem(
      system([
        emitter({}),
        emitter({
          emitterLinger: number(3),
          directionVelocityScale: number(0.005),
          directionVelocityMinScale: number(0),
        }),
      ]),
    ).emitters;

    expect([
      bare.emitterLinger,
      bare.directionVelocityScale,
      bare.directionVelocityMinScale,
    ]).toEqual([0, 0, 1]);
    expect([
      written.emitterLinger,
      written.directionVelocityScale,
      written.directionVelocityMinScale,
    ]).toEqual([3, 0.005, 0]);
  });

  it("reads the complex list before the simple one and numbers them across both", () => {
    const model = readVfxSystem(
      system(
        [emitter({ emitterName: { type: "string", value: "smoke" } })],
        [emitter({ emitterName: { type: "string", value: "spark" } })],
      ),
    );

    expect(model.emitters.map((each) => each.name)).toEqual(["smoke", "spark"]);
    expect(model.emitters.map((each) => each.index)).toEqual([0, 1]);
    expect(model.emitters.map((each) => each.simple)).toEqual([false, true]);
    expect(model.emitters.map((each) => each.listIndex)).toEqual([0, 0]);
  });

  it("takes the schema's default for a field the emitter does not write", () => {
    const [only] = readVfxSystem(system([emitter({})])).emitters;

    expect(only.rate.constant).toEqual([0]);
    expect(only.particleLifetime.constant).toEqual([3]);
    expect(only.scale0.constant).toEqual([1, 1, 1]);
    expect(only.birthColor.constant).toEqual([1, 1, 1, 1]);
    expect(only.acceleration.constant).toEqual([0, 0, 0]);
    expect(only.worldAcceleration.constant).toEqual([0, 0, 0]);
    expect(only.birthOrbitalVelocity.constant).toEqual([0, 0, 0]);
    expect(only.birthRotationalAcceleration.constant).toEqual([0, 0, 0]);
    expect(only.lifetime).toBeNull();
    expect(only.timeBeforeFirstEmission).toBe(0);
    expect(only.bindWeight.constant).toEqual([0]);
    expect(only.emitterPosition.constant).toEqual([0, 0, 0]);
    expect(only.emitterSpace).toBe(false);
    expect(only.pass).toBe(0);
    expect(only.miscRenderFlags).toBe(0);
    expect(only.alphaRef).toBeCloseTo(5 / 255, 6);
  });

  it("reads the render-state bytes, the alpha test over its own byte range", () => {
    const [only] = readVfxSystem(
      system([emitter({ pass: number(-100), miscRenderFlags: number(5), alphaRef: number(51) })]),
    ).emitters;

    expect(only.pass).toBe(-100);
    expect(only.miscRenderFlags).toBe(5);
    expect(only.alphaRef).toBeCloseTo(0.2, 6);
  });

  it("reads an alphaRef of zero as no test rather than the default", () => {
    const [only] = readVfxSystem(system([emitter({ alphaRef: number(0) })])).emitters;

    expect(only.alphaRef).toBe(0);
  });

  it("spawns on a point at the origin, with no ribbon, for an emitter naming no primitive", () => {
    const [only] = readVfxSystem(system([emitter({})])).emitters;

    expect(only.shape).toEqual({ kind: "point", offset: [0, 0, 0] });
    expect(only.trail).toBeNull();
    expect(only.beam).toBeNull();
  });

  it("lingers not at all, off no palette, for an emitter writing none of either", () => {
    const [only] = readVfxSystem(system([emitter({})])).emitters;

    expect(only.velocity.constant).toEqual([0, 0, 0]);
    expect(only.particleLinger).toBe(0);
    expect(only.lingerType).toBe(LINGER_TYPE.maxLifetimeAfterEmitterDies);
    expect(only.linger).toBeNull();
    expect(only.palette).toBeNull();
    expect(only.colorTexture).toBeNull();
    expect(only.lookupX).toBe(COLOR_LOOKUP.lifetime);
    expect(only.lookupY).toBe(COLOR_LOOKUP.constant);
    expect(only.lookupOffsets).toEqual([0, 0]);
    expect(only.lookupScales).toEqual([1, 1]);
  });

  it("reads a simple emitter's legacy block and lowers what it says about the emitter", () => {
    const [only] = readVfxSystem(
      system(
        [],
        [
          emitter({
            LegacySimple: struct(nameHash("VfxEmitterLegacySimple"), {
              birthScale: constantOf(number(105)),
              scaleBias: vector(2, 1),
              scale: constantOf(number(3)),
              birthRotation: constantOf(number(1)),
              lockedToEmitter: { type: "bool", value: true },
              uvScrollRate: vector(0.5, 0),
              scaleUpFromOrigin: { type: "bool", value: true },
              particleBind: vector(1, 1),
            }),
          }),
        ],
      ),
    ).emitters;

    expect(only.simple).toBe(true);
    expect(only.legacySimple).toMatchObject({
      birthScale: { constant: [105] },
      scaleBias: [2, 1],
      scale: { constant: [3] },
      birthRotation: { constant: [1] },
      lockedToEmitter: true,
      particleBind: [1, 1],
      fixedOrbitType: 1,
      orientation: 0,
    });
    /* `lockedToEmitter` is carried and binds nothing, and the scroll is each particle's
       own, on its age, wrapped. */
    expect(only.bindWeight.constant).toEqual([0]);
    expect(only.emitterSpace).toBe(false);
    expect(only.uv.birthScrollRate.constant).toEqual([0.5, 0]);
    expect(only.uv.scrollClamp).toBe(false);
    expect(only.uv.emitterScrollRate).toEqual([0, 0]);
    expect(only.pivotUp).toBe(true);
  });

  it("lowers a legacy uvScrollRate over the emitter's own birth scroll and its clamp", () => {
    const scrolling = (legacy: Record<string, VfxValue>) =>
      emitter({
        birthUvScrollRate: constantOf(vector(3, 4)),
        uvScrollClamp: bool(true),
        emitterUvScrollRate: vector(7, 8),
        LegacySimple: struct(nameHash("VfxEmitterLegacySimple"), legacy),
      });
    const [lowered, still] = readVfxSystem(
      system([], [scrolling({ uvScrollRate: vector(0, -2) }), scrolling({})]),
    ).emitters;

    expect(lowered.uv.birthScrollRate).toEqual({ constant: [0, -2], keys: [], tables: [] });
    expect(lowered.uv.scrollClamp).toBe(false);
    expect(lowered.uv.emitterScrollRate).toEqual([7, 8]);
    /* A block writing no scroll leaves the emitter's own fields as they are. */
    expect(still.uv.birthScrollRate.constant).toEqual([3, 4]);
    expect(still.uv.scrollClamp).toBe(true);
  });

  it("reads a legacy block at every default for a simple emitter writing none", () => {
    const [only] = readVfxSystem(system([], [emitter({})])).emitters;

    expect(only.legacySimple).toEqual({
      birthScale: { constant: [1], keys: [], tables: [] },
      scaleBias: [1, 1],
      scale: { constant: [1], keys: [], tables: [] },
      birthRotation: { constant: [0], keys: [], tables: [] },
      birthRotationalVelocity: { constant: [0], keys: [], tables: [] },
      rotation: { constant: [0], keys: [], tables: [] },
      lockedToEmitter: false,
      hasFixedOrbit: false,
      fixedOrbitType: 1,
      orientation: 0,
      particleBind: [0, 0],
      uvScrollRate: [0, 0],
      scaleUpFromOrigin: false,
    });
    expect(only.pivotUp).toBe(false);
  });

  it("carries no legacy block, and no lift, for a complex emitter", () => {
    const [only] = readVfxSystem(system([emitter({})])).emitters;

    expect(only.legacySimple).toBeNull();
    expect(only.pivotUp).toBe(false);
  });

  it("carries none for a complex emitter writing one either, nor anything the block lowers", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          LegacySimple: struct(nameHash("VfxEmitterLegacySimple"), {
            birthScale: constantOf(number(105)),
            uvScrollRate: vector(0.5, 0),
            scaleUpFromOrigin: bool(true),
          }),
        }),
      ]),
    ).emitters;

    expect(only.simple).toBe(false);
    expect(only.legacySimple).toBeNull();
    expect(only.pivotUp).toBe(false);
    expect(only.uv.birthScrollRate.constant).toEqual([0, 0]);
  });

  it("reads none of the complex emitter's motion, frame, emission or linger fields off a simple one", () => {
    const written = {
      birthAcceleration: constantOf(vector(1, 2, 3)),
      acceleration: constantOf(vector(1, 2, 3)),
      drag: constantOf(vector(1, 2, 3)),
      birthDrag: constantOf(vector(1, 2, 3)),
      velocity: constantOf(vector(1, 2, 3)),
      worldAcceleration: constantOf(vector(1, 2, 3)),
      bindWeight: constantOf(number(1)),
      IsEmitterSpace: bool(true),
      rotationOverride: vector(10, 20, 30),
      scaleOverride: vector(2, 2, 2),
      translationOverride: vector(5, 6, 7),
      emissionMeshName: { type: "asset", path: "assets/ring.scb", asset: null },
      emissionSurfaceDefinition: struct(nameHash("VfxEmissionSurfaceData"), {}),
      offsetLifetimeScaling: vector(1, 1, 1),
      hasPostRotateOrientation: bool(true),
      postRotateOrientationAxis: vector(0, 90, 0),
      Linger: struct(nameHash("VfxLingerDefinitionData"), {
        UseLingerScale: bool(true),
      }),
      particleLingerType: number(2),
      ChanceToNotExist: number(0.5),
      HasVariableStartTime: bool(true),
      rateByVelocityFunction: constantOf(vector(2, 5)),
    } satisfies Record<string, VfxValue>;
    const [complex, simple] = readVfxSystem(
      system([emitter(written)], [emitter(written)]),
    ).emitters;

    expect(simple.simple).toBe(true);
    for (const field of [
      "birthAcceleration",
      "acceleration",
      "drag",
      "birthDrag",
      "velocity",
      "worldAcceleration",
    ] as const) {
      expect(complex[field].constant).toEqual([1, 2, 3]);
      expect(simple[field].constant).toEqual([0, 0, 0]);
    }
    expect([complex.bindWeight.constant, simple.bindWeight.constant]).toEqual([[1], [0]]);
    expect([complex.emitterSpace, simple.emitterSpace]).toEqual([true, false]);
    expect([complex.rotationOverride, simple.rotationOverride]).toEqual([
      [10, 20, 30],
      [0, 0, 0],
    ]);
    expect([complex.scaleOverride, simple.scaleOverride]).toEqual([
      [2, 2, 2],
      [1, 1, 1],
    ]);
    expect([complex.translationOverride, simple.translationOverride]).toEqual([
      [5, 6, 7],
      [0, 0, 0],
    ]);
    expect([complex.emissionMesh?.mesh.path, simple.emissionMesh]).toEqual([
      "assets/ring.scb",
      null,
    ]);
    expect([complex.emissionSurface === null, simple.emissionSurface === null]).toEqual([
      false,
      true,
    ]);
    expect([complex.offsetLifetimeScaling, simple.offsetLifetimeScaling]).toEqual([
      [1, 1, 1],
      [0, 0, 0],
    ]);
    expect([complex.postRotate, simple.postRotate]).toEqual([[0, 90, 0], null]);
    expect([complex.linger === null, simple.linger]).toEqual([false, null]);
    expect([complex.lingerType, simple.lingerType]).toEqual([
      LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      LINGER_TYPE.maxLifetimeAfterEmitterDies,
    ]);
    expect([complex.chanceToNotExist, simple.chanceToNotExist]).toEqual([0.5, 0]);
    expect([complex.hasVariableStartTime, simple.hasVariableStartTime]).toEqual([true, false]);
    expect([complex.rateByVelocity, simple.rateByVelocity]).toEqual([[2, 5], null]);
  });

  it("reads the linger block toggle by toggle, a curve only where its toggle is on", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          particleLinger: number(2.5),
          particleLingerType: number(2),
          Linger: struct(nameHash("VfxLingerDefinitionData"), {
            UseLingerScale: { type: "bool", value: true },
            LingerScale: constantOf(vector(2, 2, 2)),
            LingerRotation: constantOf(vector(0, 0, 5)),
            UseSeparateLingerColor: { type: "bool", value: true },
          }),
        }),
      ]),
    ).emitters;

    expect(only.particleLinger).toBe(2.5);
    expect(only.lingerType).toBe(LINGER_TYPE.fixedLifetimeAfterEmitterStops);
    expect(only.linger?.scale?.constant).toEqual([2, 2, 2]);
    /* Authored, but its toggle is off, so it does not replace `rotation0`. */
    expect(only.linger?.rotation).toBeNull();
    /* On, and not authored, so it reads at the schema's white. */
    expect(only.linger?.color?.constant).toEqual([1, 1, 1, 1]);
    expect(only.linger?.velocity).toBeNull();
  });

  it("reads a linger type byte of three or more as the kind that changes no lifetime", () => {
    const typed = (byte: number) => emitter({ particleLingerType: number(byte) });
    const kinds = readVfxSystem(
      system([typed(0), typed(1), typed(2), typed(3), typed(4), typed(200)]),
    ).emitters.map((each) => each.lingerType);

    expect(kinds).toEqual([
      LINGER_TYPE.maxLifetimeAfterEmitterDies,
      LINGER_TYPE.fixedLifetimeAfterEmitterDies,
      LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      LINGER_TYPE.none,
      LINGER_TYPE.none,
      LINGER_TYPE.none,
    ]);
  });

  it("reads the palette, and the colour ramp with its lookups, the palette's address mode defaulting to mirror", () => {
    const held: AssetRef = { kind: "gameChunk", wad: "Smolder.wad.client", pathHash: "0c0c0c0c" };
    const ramp: AssetRef = { kind: "gameChunk", wad: "Smolder.wad.client", pathHash: "0c0c0c0e" };
    const [only] = readVfxSystem(
      system([
        emitter({
          paletteDefinition: struct(nameHash("VfxPaletteDefinitionData"), {
            paletteTexture: { type: "asset", path: "assets/ramp.dds", asset: held },
            paletteCount: number(3),
            paletteSelector: constantOf(vector(1, 0, 0)),
          }),
          particleColorTexture: { type: "asset", path: "assets/life.dds", asset: ramp },
          colorLookUpTypeX: number(3),
          colorLookUpTypeY: number(1),
          colorLookUpScales: vector(2, 0.5),
        }),
      ]),
    ).emitters;

    expect(only.colorTexture).toEqual({ path: "assets/life.dds", asset: ramp });
    expect(only.palette?.texture).toEqual({ path: "assets/ramp.dds", asset: held });
    expect(only.palette?.count).toBe(3);
    expect(only.palette?.selector.constant).toEqual([1, 0, 0]);
    expect(only.palette?.addressMode).toBe(ADDRESS_MODE.mirror);
    expect(only.palette?.mix.constant).toEqual([0.299, 0.587, 0.114, 0]);
    expect(only.lookupX).toBe(COLOR_LOOKUP.birthRandom);
    expect(only.lookupY).toBe(COLOR_LOOKUP.lifetime);
    expect(only.lookupScales).toEqual([2, 0.5]);
  });

  it("reads the erosion, its map sampling as a mirror by default and its mixer as alpha", () => {
    const held: AssetRef = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0d0d0d0d" };
    const [own, mapped, none] = readVfxSystem(
      system([
        emitter({
          alphaErosionDefinition: struct(nameHash("VfxAlphaErosionDefinitionData"), {
            erosionDriveCurve: keyed([0, 0.8], [number(0), number(1)]),
            erosionFeatherOut: number(0.2),
            erosionSliceWidth: number(1.7),
            erosionMapChannelMixer: constantOf(vector(1, 0, 0, 0)),
          }),
        }),
        emitter({
          alphaErosionDefinition: struct(nameHash("VfxAlphaErosionDefinitionData"), {
            erosionMapName: { type: "asset", path: "assets/shards.dds", asset: held },
            erosionMapAddressMode: number(1),
            UseLingerErosionDriveCurve: { type: "bool", value: true },
            LingerErosionDriveCurve: constantOf(number(0.5)),
          }),
        }),
        emitter({}),
      ]),
    ).emitters;

    expect(own.erosion).toMatchObject({
      map: null,
      featherIn: 0.1,
      featherOut: 0.2,
      sliceWidth: 1.7,
      lingerDrive: null,
      addressMode: ADDRESS_MODE.mirror,
    });
    expect(own.erosion?.drive.keys).toEqual([
      { time: 0, values: [0] },
      { time: 0.8, values: [1] },
    ]);
    expect(own.erosion?.mixer.constant).toEqual([1, 0, 0, 0]);

    expect(mapped.erosion?.map).toEqual({ path: "assets/shards.dds", asset: held });
    /* An authored mirror reaches the sampler as its clamp. */
    expect(mapped.erosion?.addressMode).toBe(ADDRESS_MODE.clamp);
    expect(mapped.erosion?.mixer.constant).toEqual([0, 0, 0, 1]);
    expect(mapped.erosion?.drive.constant).toEqual([1]);
    expect(mapped.erosion?.lingerDrive?.constant).toEqual([0.5]);

    expect(none.erosion).toBeNull();
  });

  it("reads the distortion, whose mode defaults to one and whose map is an asset", () => {
    const held: AssetRef = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0e0e0e0e" };
    const [own, bare, none] = readVfxSystem(
      system([
        emitter({
          distortionDefinition: struct(nameHash("VfxDistortionDefinitionData"), {
            distortion: number(0.05),
            distortionMode: number(3),
            normalMapTexture: { type: "asset", path: "assets/warp.dds", asset: held },
          }),
        }),
        emitter({ distortionDefinition: struct(nameHash("VfxDistortionDefinitionData"), {}) }),
        emitter({}),
      ]),
    ).emitters;

    expect(own.distortion).toEqual({
      strength: 0.05,
      mode: 3,
      map: { path: "assets/warp.dds", asset: held },
    });
    expect(bare.distortion).toEqual({ strength: 0, mode: 1, map: null });
    expect(none.distortion).toBeNull();
  });

  it("reads the reflection block, its unwritten fields at the schema's defaults", () => {
    const held: AssetRef = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0c0c0c0c" };
    const [own, bare, none] = readVfxSystem(
      system([
        emitter({
          reflectionDefinition: struct(nameHash("VfxReflectionDefinitionData"), {
            fresnel: number(0.1),
            fresnelColor: vector(0.99, 0.5, 0, 1),
            reflectionFresnel: number(0.6),
            reflectionMapTexture: {
              type: "asset",
              path: "assets/shared/particles/aatrox_cubemap.dds",
              asset: held,
            },
            reflectionOpacityDirect: number(0.3),
            reflectionOpacityGlancing: number(0.2),
          }),
        }),
        emitter({ reflectionDefinition: struct(nameHash("VfxReflectionDefinitionData"), {}) }),
        emitter({}),
      ]),
    ).emitters;

    expect(own.reflection).toEqual({
      fresnel: 0.1,
      fresnelColor: [0.99, 0.5, 0, 1],
      reflectionFresnel: 0.6,
      reflectionFresnelColor: [1, 1, 1, 1],
      opacityDirect: 0.3,
      opacityGlancing: 0.2,
      map: { path: "assets/shared/particles/aatrox_cubemap.dds", asset: held },
    });
    expect(bare.reflection).toEqual({
      fresnel: 1,
      fresnelColor: [0, 0, 0, 0],
      reflectionFresnel: 1,
      reflectionFresnelColor: [1, 1, 1, 1],
      opacityDirect: 0,
      opacityGlancing: 1,
      map: null,
    });
    expect(none.reflection).toBeNull();
  });

  it("reads the soft particle block, every field defaulting to zero and the fade to both", () => {
    const [own, bare, none] = readVfxSystem(
      system([
        emitter({
          softParticleParams: struct(nameHash("VfxSoftParticleDefinitionData"), {
            beginIn: number(20),
            deltaIn: number(10),
            deltaOut: number(30),
          }),
        }),
        emitter({ softParticleParams: struct(nameHash("VfxSoftParticleDefinitionData"), {}) }),
        emitter({}),
      ]),
    ).emitters;

    expect(own.soft).toEqual({
      beginIn: 20,
      deltaIn: 10,
      beginOut: 0,
      deltaOut: 30,
      target: SOFT_TARGET.both,
    });
    expect(bare.soft).toEqual({
      beginIn: 0,
      deltaIn: 0,
      beginOut: 0,
      deltaOut: 0,
      target: SOFT_TARGET.both,
    });
    expect(none.soft).toBeNull();
  });

  it("reads what the soft fade reaches off the unnamed byte 0x3bf176bc", () => {
    const soft = (target: number) =>
      emitter({
        softParticleParams: struct(nameHash("VfxSoftParticleDefinitionData"), {
          "0x3bf176bc": number(target),
        }),
      });
    const targets = readVfxSystem(system([soft(0), soft(1), soft(2), soft(9)])).emitters.map(
      (each) => each.soft?.target,
    );

    expect(targets).toEqual([
      SOFT_TARGET.both,
      SOFT_TARGET.colour,
      SOFT_TARGET.alpha,
      /* A byte outside the three reads as both. */
      SOFT_TARGET.both,
    ]);
  });

  it("reads each spawn shape off the class SpawnShape holds", () => {
    const shapes = readVfxSystem(
      system([
        emitter({
          SpawnShape: struct(nameHash("VfxShapePointDoNotUse"), { emitOffset: vector(0, 10, 0) }),
        }),
        emitter({
          SpawnShape: struct(nameHash("VfxShapeBox"), { Size: vector(1, 2, 3), flags: number(1) }),
        }),
        emitter({
          SpawnShape: struct(nameHash("VfxShapeCylinder"), {
            radius: number(5),
            height: number(7),
          }),
        }),
        emitter({ SpawnShape: struct(nameHash("VfxShapeSphere"), { radius: number(9) }) }),
        emitter({
          SpawnShape: struct(nameHash("VfxShapeLegacy"), {
            emitOffset: constantOf(vector(1, 1, 1)),
            emitRotationAngles: container(constantOf(number(90))),
            emitRotationAxes: container(vector(0, 0, 1)),
          }),
        }),
        emitter({ SpawnShape: struct(nameHash("VfxShapeVolume"), {}) }),
      ]),
    ).emitters.map((each) => each.shape);

    expect(shapes[0]).toEqual({ kind: "point", offset: [0, 10, 0] });
    expect(shapes[1]).toEqual({ kind: "box", size: [1, 2, 3], volume: true });
    expect(shapes[2]).toEqual({ kind: "cylinder", radius: 5, height: 7, volume: false });
    expect(shapes[3]).toEqual({ kind: "sphere", radius: 9, volume: false });
    expect(shapes[4]).toMatchObject({
      kind: "legacy",
      offset: { constant: [1, 1, 1] },
      angles: [{ constant: [90] }],
      axes: [[0, 0, 1]],
    });
    expect(shapes[5]).toEqual({ kind: "point", offset: [0, 0, 0] });
  });

  it("reads the trail a trail primitive carries, at its defaults where it writes none", () => {
    const [camera, arbitrary] = readVfxSystem(
      system([
        emitter({
          primitive: struct(nameHash("VfxPrimitiveCameraTrail"), {
            mTrail: struct(nameHash("VfxTrailDefinitionData"), {
              mCutoff: number(50),
              mBirthTilingSize: constantOf(vector(100, 0, 0)),
              mMode: number(1),
            }),
          }),
        }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveArbitraryTrail"), {}) }),
      ]),
    ).emitters;

    expect(camera.trail).toMatchObject({ cutoff: 50, mode: 1, tiling: { constant: [100, 0, 0] } });
    expect(arbitrary.trail).toEqual({
      mode: 0,
      smoothing: 0,
      maxAddedPerFrame: 0,
      tiling: { constant: [0, 0, 0], keys: [], tables: [] },
      cutoff: 0,
    });
    expect(camera.beam).toBeNull();
  });

  it("reads the beam a beam primitive carries, and a segment beam at every default", () => {
    const [beam, segment] = readVfxSystem(
      system([
        emitter({
          primitive: struct(nameHash("VfxPrimitiveBeam"), {
            mBeam: struct(nameHash("VfxBeamDefinitionData"), {
              mSegments: number(8),
              mMode: number(1),
              mLocalSpaceTargetOffset: vector(0, 50, 0),
              mIsColorBindedWithDistance: { type: "bool", value: true },
            }),
          }),
        }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveCameraSegmentBeam"), {}) }),
      ]),
    ).emitters;

    expect(beam.beam).toMatchObject({
      segments: 8,
      mode: 1,
      targetOffset: [0, 50, 0],
      sourceOffset: [0, 0, 0],
      colorBoundToDistance: true,
    });
    expect(segment.beam).toMatchObject({ segments: 0, mode: 0 });
    expect(segment.trail).toBeNull();
  });

  it("reads the decal a planar projection carries, at the schema's defaults where it writes none", () => {
    const [authored, bare, quad] = readVfxSystem(
      system([
        emitter({
          primitive: struct(nameHash("VfxPrimitivePlanarProjection"), {
            mProjection: struct(nameHash("VfxProjectionDefinitionData"), {
              mYRange: number(20),
              mFading: number(80),
            }),
          }),
        }),
        emitter({ primitive: struct(nameHash("VfxPrimitivePlanarProjection"), {}) }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveCameraQuad"), {}) }),
      ]),
    ).emitters;

    expect(authored.projection).toEqual({ yRange: 20, fading: 80 });
    expect(bare.projection).toEqual({ yRange: 5, fading: 200 });
    expect(quad.projection).toBeNull();
    expect([authored, bare].map(drawsAsProjection)).toEqual([true, true]);
    expect([authored, bare].map(isUndrawn)).toEqual([false, false]);
  });

  it("reads where the emitter stands and whether its particles follow it past their birth", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          EmitterPosition: constantOf(vector(1, 2, 3)),
          IsEmitterSpace: { type: "bool", value: true },
        }),
      ]),
    ).emitters;

    expect(only.emitterPosition.constant).toEqual([1, 2, 3]);
    expect(only.emitterSpace).toBe(true);
  });

  it("reads the birth rotational acceleration, whose name carries no trailing zero", () => {
    const [only] = readVfxSystem(
      system([emitter({ birthRotationalAcceleration: constantOf(vector(0, 0, 40)) })]),
    ).emitters;

    expect(only.birthRotationalAcceleration.constant).toEqual([0, 0, 40]);
  });

  it("reads the orbital velocity a particle turns about the origin at", () => {
    const [only] = readVfxSystem(
      system([emitter({ birthOrbitalVelocity: constantOf(vector(0, 1, 0)) })]),
    ).emitters;

    expect(only.birthOrbitalVelocity.constant).toEqual([0, 1, 0]);
  });

  it("reads the birth drag a particle damps by on top of the emitter's own", () => {
    const [only] = readVfxSystem(
      system([
        emitter({ drag: constantOf(vector(1, 1, 1)), birthDrag: constantOf(vector(5, 0, 5)) }),
      ]),
    ).emitters;

    expect(only.drag.constant).toEqual([1, 1, 1]);
    expect(only.birthDrag.constant).toEqual([5, 0, 5]);
  });

  it("reads the world acceleration the draw offsets a particle by", () => {
    const [only] = readVfxSystem(
      system([emitter({ worldAcceleration: constantOf(vector(0, -1800, 0)) })]),
    ).emitters;

    expect(only.worldAcceleration.constant).toEqual([0, -1800, 0]);
  });

  it("reads the bind weight a rig carries a particle by", () => {
    const [only] = readVfxSystem(system([emitter({ bindWeight: constantOf(number(1)) })])).emitters;

    expect(only.bindWeight.constant).toEqual([1]);
  });

  it("reads a constant off the value class the field holds", () => {
    const [only] = readVfxSystem(
      system([emitter({ rate: constantOf(number(12)), lifetime: number(2.5) })]),
    ).emitters;

    expect(only.rate.constant).toEqual([12]);
    expect(only.rate.keys).toEqual([]);
    expect(only.lifetime).toBe(2.5);
  });

  it("reads a curve's probability tables, one per channel slot and none for a null slot", () => {
    const table = (times: number[], values: number[]) =>
      struct(nameHash("VfxProbabilityTableData"), {
        keyTimes: container(...times.map(number)),
        keyValues: container(...values.map(number)),
      });
    const [only] = readVfxSystem(
      system([
        emitter({
          birthVelocity: struct(nameHash("ValueVector3"), {
            constantValue: vector(-400, 0, 0),
            dynamics: struct(nameHash("VfxAnimatedVector3fVariableData"), {
              probabilityTables: container(
                table([0, 1], [0, 1]),
                { type: "null" },
                table([], []),
                table([0, 0.5, 1], [2, 3]),
              ),
            }),
          }),
          rate: constantOf(number(1)),
        }),
      ]),
    ).emitters;

    expect(only.birthVelocity.tables).toEqual([
      {
        channel: 0,
        single: 1,
        keys: [
          { time: 0, values: [0] },
          { time: 1, values: [1] },
        ],
      },
      { channel: 2, single: 1, keys: [] },
      /* Lists of two lengths are worth nothing. */
      { channel: 3, single: 0, keys: [] },
    ]);
    expect(only.rate.tables).toEqual([]);
  });

  it("reads no table at all off a list whose first slot is null", () => {
    const table = struct(nameHash("VfxProbabilityTableData"), {
      keyTimes: container(number(0), number(1)),
      keyValues: container(number(0), number(1)),
    });
    const tabled = (...slots: VfxValue[]) =>
      emitter({
        birthVelocity: struct(nameHash("ValueVector3"), {
          constantValue: vector(-400, 0, 0),
          dynamics: struct(nameHash("VfxAnimatedVector3fVariableData"), {
            probabilityTables: container(...slots),
          }),
        }),
      });
    const [headless, headed, empty] = readVfxSystem(
      system([
        tabled({ type: "null" }, table, table),
        tabled(table, { type: "null" }, table),
        tabled(),
      ]),
    ).emitters;

    expect(headless.birthVelocity.tables).toEqual([]);
    expect(headed.birthVelocity.tables.map((each) => each.channel)).toEqual([0, 2]);
    expect(empty.birthVelocity.tables).toEqual([]);
  });

  it("pairs a curve's two lists into keys and drops the tail neither reaches", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          scale0: keyed([0, 0.5, 1], [vector(1, 1, 1), vector(2, 2, 2)]),
        }),
      ]),
    ).emitters;

    expect(only.scale0.keys).toEqual([
      { time: 0, values: [1, 1, 1] },
      { time: 0.5, values: [2, 2, 2] },
    ]);
  });

  it("carries the texture's reference and the path the emitter named", () => {
    const asset: AssetRef = { kind: "gameChunk", wad: "Smolder.wad.client", pathHash: "0f0f0f0f" };
    const [only] = readVfxSystem(
      system([
        emitter({
          texture: { type: "asset", path: "assets/particle.dds", asset },
        }),
      ]),
    ).emitters;

    expect(only.texture).toEqual({ path: "assets/particle.dds", asset });
  });

  it("reads a texture the install does not ship as a path with no reference", () => {
    const [only] = readVfxSystem(
      system([emitter({ texture: { type: "asset", path: "assets/gone.dds", asset: null } })]),
    ).emitters;

    expect(only.texture).toEqual({ path: "assets/gone.dds", asset: null });
  });

  it("reads the primitive's class as its quad type", () => {
    const [ray, none] = readVfxSystem(
      system([emitter({ primitive: struct(nameHash("VfxPrimitiveRay"), {}) }), emitter({})]),
    ).emitters;

    expect(ray.quadType).toBe(QUAD_TYPE.ray);
    expect(none.quadType).toBe(QUAD_TYPE.cameraQuad);
    expect(none.primitiveClass).toBeNull();
  });

  it("reads a primitive class with no kind as undrawn rather than as a camera quad", () => {
    const classes = [
      "VfxPrimitiveLaser",
      "VfxPrimitiveRibbon",
      "VfxPrimitiveCameraSegmentSeriesBeam",
      "VfxPrimitiveNonRenderable",
    ];

    const { emitters } = readVfxSystem(
      system(classes.map((named) => emitter({ primitive: struct(nameHash(named), {}) }))),
    );

    expect(emitters.map((held) => held.quadType)).toEqual(classes.map(() => null));
    expect(emitters.map(isUndrawn)).toEqual(classes.map(() => true));
    expect(emitters.map((held) => held.primitiveClass)).toEqual(classes.map(nameHash));
  });

  it("reads the unit quad as a camera kind of its own", () => {
    const [camera, unit] = readVfxSystem(
      system([
        emitter({ primitive: struct(nameHash("VfxPrimitiveCameraQuad"), {}) }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveCameraUnitQuad"), {}) }),
      ]),
    ).emitters;

    expect(unit.quadType).toBe(QUAD_TYPE.cameraUnitQuad);
    expect([camera, unit].map(drawsAsQuad)).toEqual([true, true]);
    expect([camera, unit].map(facesTheCamera)).toEqual([true, true]);
    expect([camera, unit].map(isUnitQuad)).toEqual([false, true]);
  });

  it("reads the stencil mode and the reference a mode reads", () => {
    const held = (mode: number, ref: number) =>
      emitter({
        stencilMode: { type: "number", value: mode },
        stencilRef: { type: "number", value: ref },
      });

    const [tested, off, past] = readVfxSystem(
      system([held(3, 7), held(0, 7), held(9, 7)]),
    ).emitters;

    expect([tested.stencilMode, tested.stencilRef]).toEqual([STENCIL_MODE.testNotEqual, 7]);
    expect([off.stencilMode, off.stencilRef]).toEqual([STENCIL_MODE.disabled, 0]);
    expect(past.stencilMode).toBe(STENCIL_MODE.disabled);
    expect(readVfxSystem(system([held(4, 1)])).emitters[0].stencilMode).toBe(
      STENCIL_MODE.writeMaskIfTestNotEqual,
    );
  });

  it("reads the stencil reference id of a mode, and none for a zero hash or the disabled mode", () => {
    const withId = (mode: number, hash: string) =>
      emitter({
        stencilMode: { type: "number", value: mode },
        StencilReferenceId: { type: "hash", hash, name: null },
      });

    const [named, zero, off] = readVfxSystem(
      system([withId(2, "0x0badf00d"), withId(2, "0x00000000"), withId(0, "0x0badf00d")]),
    ).emitters;

    expect(named.stencilReferenceId).toBe("0x0badf00d");
    expect(zero.stencilReferenceId).toBeNull();
    expect(off.stencilReferenceId).toBeNull();
  });

  it("reads no stencil mode off a simple emitter", () => {
    const fields = {
      stencilMode: { type: "number", value: 1 },
      stencilRef: { type: "number", value: 7 },
    } as const;

    const [complex, simple] = readVfxSystem(system([emitter(fields)], [emitter(fields)])).emitters;

    expect([complex.stencilMode, complex.stencilRef]).toEqual([STENCIL_MODE.writeMask, 7]);
    expect([simple.stencilMode, simple.stencilRef]).toEqual([STENCIL_MODE.disabled, 0]);
  });

  it("falls back to the default blend mode for a byte outside the enum", () => {
    const [held, past] = readVfxSystem(
      system([emitter({ blendMode: number(1) }), emitter({ blendMode: number(99) })]),
    ).emitters;

    expect(held.blendMode).toBe(BLEND_MODE.alpha);
    expect(past.blendMode).toBe(BLEND_MODE.add);
  });

  it("draws the three quad kinds as quads and a mesh as something else", () => {
    const [camera, arbitrary, ray, mesh] = readVfxSystem(
      system([
        emitter({ primitive: struct(nameHash("VfxPrimitiveCameraQuad"), {}) }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveArbitraryQuad"), {}) }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveRay"), {}) }),
        emitter({ primitive: struct(nameHash("VfxPrimitiveMesh"), {}) }),
      ]),
    ).emitters;

    expect([camera, arbitrary, ray].map(drawsAsQuad)).toEqual([true, true, true]);
    expect(drawsAsQuad(mesh)).toBe(false);
    expect([camera, arbitrary, ray].map(facesTheCamera)).toEqual([true, false, false]);
    expect([camera, arbitrary, ray].map(isRay)).toEqual([false, false, true]);
  });

  it("reads the orientation fields an arbitrary quad stands on", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          isRotationEnabled: { type: "bool", value: true },
          isDirectionOriented: { type: "bool", value: true },
          birthRotation0: constantOf(vector(0, 0, 1.5)),
        }),
      ]),
    ).emitters;

    expect(only.rotationEnabled).toBe(true);
    expect(only.directionOriented).toBe(true);
    expect(only.birthRotation0.constant).toEqual([0, 0, 1.5]);
    expect(only.rotation0.constant).toEqual([0, 0, 0]);
  });

  it("reads one whole cell and no transform for an emitter writing no UV field", () => {
    const [only] = readVfxSystem(system([emitter({})])).emitters;

    expect(only.uv.book.divisions).toEqual([1, 1]);
    expect(only.uv.book.frames).toBe(1);
    expect(only.uv.scale.constant).toEqual([1, 1]);
    expect(only.uv.center).toEqual([0.5, 0.5]);
    expect(only.multUv).toBeNull();
    expect(only.multTexture).toBeNull();
  });

  it("reads the grid a flipbook is cut into and how it plays", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          texDiv: vector(4, 2),
          numFrames: number(8),
          startFrame: number(3),
          frameRate: number(12),
          isRandomStartFrame: { type: "bool", value: true },
        }),
      ]),
    ).emitters;

    expect(only.uv.book.divisions).toEqual([4, 2]);
    expect(only.uv.book.frames).toBe(8);
    expect(only.uv.book.start).toBe(3);
    expect(only.uv.book.rate).toBe(12);
    expect(only.uv.book.randomStart).toBe(true);
  });

  it("reads the transform's own fields, flips included", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          uvScale: constantOf(vector(2, 3)),
          uvTransformCenter: vector(0.25, 0.75),
          emitterUvScrollRate: vector(0.5, -0.5),
          TextureFlipU: { type: "bool", value: true },
          uvScrollClamp: { type: "bool", value: true },
          texAddressModeBase: number(2),
        }),
      ]),
    ).emitters;

    expect(only.uv.scale.constant).toEqual([2, 3]);
    expect(only.uv.center).toEqual([0.25, 0.75]);
    expect(only.uv.emitterScrollRate).toEqual([0.5, -0.5]);
    expect(only.uv.flipU).toBe(true);
    expect(only.uv.flipV).toBe(false);
    expect(only.uv.scrollClamp).toBe(true);
    expect(only.uv.addressMode).toBe(ADDRESS_MODE.clamp);
  });

  it("reads textureMult as a layer of its own, under its own field names", () => {
    const held: AssetRef = { kind: "gameChunk", wad: "Smolder.wad.client", pathHash: "0a0a0a0a" };
    const [only] = readVfxSystem(
      system([
        emitter({
          textureMult: struct(nameHash("VfxTextureMultDefinitionData"), {
            textureMult: { type: "asset", path: "assets/detail.dds", asset: held },
            texDivMult: vector(2, 2),
            uvScaleMult: constantOf(vector(4, 4)),
            TextureMultFilpV: { type: "bool", value: true },
          }),
        }),
      ]),
    ).emitters;

    expect(only.multTexture).toEqual({ path: "assets/detail.dds", asset: held });
    expect(only.multUv?.book.divisions).toEqual([2, 2]);
    expect(only.multUv?.scale.constant).toEqual([4, 4]);
    expect(only.multUv?.flipV).toBe(true);
    expect(only.multUv?.flipU).toBe(false);
  });

  it("gives the mult layer the base layer's book, which is the one frame counter", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          numFrames: number(6),
          frameRate: number(24),
          startFrame: number(2),
          isRandomStartFrame: { type: "bool", value: true },
          textureMult: struct(nameHash("VfxTextureMultDefinitionData"), {
            texDivMult: vector(3, 2),
            isRandomStartFrameMult: { type: "bool", value: false },
          }),
        }),
      ]),
    ).emitters;

    expect(only.multUv?.book.frames).toBe(6);
    expect(only.multUv?.book.rate).toBe(24);
    expect(only.multUv?.book.start).toBe(2);
    /* `isRandomStartFrameMult` is written and never read, so the base layer's decides. */
    expect(only.multUv?.book.randomStart).toBe(true);
    /* Its own grid, though, because `texDivMult` is a name the mult layer does carry. */
    expect(only.multUv?.book.divisions).toEqual([3, 2]);
  });

  it("gives the mult layer the base layer's emitterUvScrollRate, its own having no reader", () => {
    const mult = struct(nameHash("VfxTextureMultDefinitionData"), {
      emitterUvScrollRateMult: vector(9, 9),
    });
    const [scrolling, still] = readVfxSystem(
      system([
        emitter({ emitterUvScrollRate: vector(0.5, -0.5), textureMult: mult }),
        emitter({ textureMult: mult }),
      ]),
    ).emitters;

    expect(scrolling.multUv?.emitterScrollRate).toEqual([0.5, -0.5]);
    expect(still.multUv?.emitterScrollRate).toEqual([0, 0]);
  });

  it("falls back to the default UV mode for a byte outside the enum", () => {
    const [held, past] = readVfxSystem(
      system([emitter({ uvMode: number(3) }), emitter({ uvMode: number(42) })]),
    ).emitters;

    expect(held.uvMode).toBe(UV_MODE.localSpace);
    expect(past.uvMode).toBe(UV_MODE.default);
  });

  it("answers an empty system for a root that is no object", () => {
    const model = readVfxSystem({
      materials: [],
      entry: "0xdeadbeef",
      name: null,
      classHash: nameHash("VfxSystemDefinitionData"),
      class: null,
      root: { type: "null" },
    });

    expect(model.entry).toBe("0xdeadbeef");
    expect(model.emitters).toEqual([]);
  });
});

describe("the mesh a primitive names", () => {
  const SKIN: AssetRef = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0a0a0a0a" };
  const SCB: AssetRef = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0b0b0b0b" };

  function hash(name: string): VfxValue {
    return { type: "hash", hash: nameHash(name), name };
  }

  function meshEmitter(mesh: Record<string, VfxValue>): VfxValue {
    return emitter({
      primitive: struct(nameHash("VfxPrimitiveMesh"), {
        mMesh: struct(nameHash("VfxMeshDefinitionData"), mesh),
      }),
    });
  }

  function attachedEmitter(mesh: Record<string, VfxValue>): VfxValue {
    return emitter({
      primitive: struct(nameHash("VfxPrimitiveAttachedMesh"), {
        mMesh: struct(nameHash("VfxMeshDefinitionData"), mesh),
      }),
    });
  }

  it("reads the skin of a whole pair, and both submesh lists", () => {
    const [only] = readVfxSystem(
      system([
        meshEmitter({
          mMeshName: { type: "asset", path: "assets/aatrox.skn", asset: SKIN },
          mMeshSkeletonName: { type: "asset", path: "assets/aatrox.skl", asset: null },
          mSimpleMeshName: { type: "asset", path: "assets/blade.scb", asset: SCB },
          mSubmeshesToDraw: container(hash("body")),
          mSubmeshesToDrawAlways: container(hash("cape"), hash("wings")),
        }),
      ]),
    ).emitters;

    expect(only.mesh?.asset).toEqual(SKIN);
    expect(only.mesh?.submeshes).toEqual([nameHash("body")]);
    expect(only.mesh?.submeshesAlways).toEqual([nameHash("cape"), nameHash("wings")]);
  });

  it("says which slot the geometry came out of, which is the look-at the alignment takes", () => {
    const [skin, simple] = readVfxSystem(
      system([
        meshEmitter({
          mMeshName: { type: "asset", path: "assets/blade.skn", asset: SKIN },
          mMeshSkeletonName: { type: "asset", path: "assets/blade.skl", asset: SKIN },
        }),
        meshEmitter({ mSimpleMeshName: { type: "asset", path: "assets/blade.scb", asset: SCB } }),
      ]),
    ).emitters;

    expect([skin.mesh?.skinned, simple.mesh?.skinned]).toEqual([true, false]);
  });

  it("falls to the simple mesh where the pair is not whole", () => {
    const skinAlone = meshEmitter({
      mMeshName: { type: "asset", path: "assets/aatrox.skn", asset: SKIN },
      mSimpleMeshName: { type: "asset", path: "assets/blade.scb", asset: SCB },
    });
    const skeletonEmpty = meshEmitter({
      mMeshName: { type: "asset", path: "assets/aatrox.skn", asset: SKIN },
      mMeshSkeletonName: { type: "asset", path: "DoesNotExist.skl", asset: null },
      mSimpleMeshName: { type: "asset", path: "assets/blade.scb", asset: SCB },
    });
    const skinEmpty = meshEmitter({
      mMeshName: { type: "asset", path: "assets/doesnotexist.skn", asset: SKIN },
      mMeshSkeletonName: { type: "asset", path: "assets/aatrox.skl", asset: null },
      mSimpleMeshName: { type: "asset", path: "assets/blade.scb", asset: SCB },
    });

    const drawn = readVfxSystem(system([skinAlone, skeletonEmpty, skinEmpty])).emitters;

    expect(drawn.map((each) => each.mesh?.asset)).toEqual([SCB, SCB, SCB]);
    expect(drawn[0].mesh?.submeshesAlways).toEqual([]);
  });

  it("reads no simple mesh under an extension the engine ignores, or the empty name", () => {
    const wrongExtension = meshEmitter({
      mSimpleMeshName: { type: "asset", path: "assets/blade.sco", asset: SCB },
    });
    const empty = meshEmitter({
      mSimpleMeshName: { type: "asset", path: "doesnotexist.scb", asset: SCB },
    });
    const gmesh = meshEmitter({
      mSimpleMeshName: { type: "asset", path: "assets/blade.GMESH", asset: SCB },
    });

    const drawn = readVfxSystem(system([wrongExtension, empty, gmesh])).emitters;

    expect(drawn.map((each) => each.mesh?.asset ?? null)).toEqual([null, null, SCB]);
  });

  it("leaves an attached mesh to its attachment, whether or not it names geometry", () => {
    const named: Record<string, VfxValue> = {
      mSimpleMeshName: { type: "asset", path: "assets/blade.scb", asset: SCB },
    };
    const [attached, bare, plain] = readVfxSystem(
      system([attachedEmitter(named), attachedEmitter({}), meshEmitter(named)]),
    ).emitters;

    expect(attached.quadType).toBe(QUAD_TYPE.attachedMesh);
    expect([attached, bare, plain].map(drawsAsMesh)).toEqual([false, false, true]);
    expect([attached, bare, plain].map(drawsTheAttachment)).toEqual([true, true, false]);
    expect([attached, bare, plain].map(isUndrawn)).toEqual([false, false, false]);
  });
});

describe("child particle sets", () => {
  function childSet(fields: Record<string, VfxValue>): VfxValue {
    return struct(nameHash("VfxChildParticleSetDefinitionData"), fields);
  }

  function identifier(fields: Record<string, VfxValue>): VfxValue {
    return struct(nameHash("VfxChildIdentifier"), fields);
  }

  const spark = struct(nameHash("VfxSystemDefinitionData"), {
    complexEmitterDefinitionData: container(
      emitter({ emitterName: { type: "string", value: "spark" } }),
    ),
  });

  it("reads no child set for an emitter writing none", () => {
    const [only] = readVfxSystem(system([emitter({})])).emitters;

    expect(only.childSet).toBeNull();
  });

  it("reads a child the resolver inlined as a system of its own", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(identifier({ effect: spark })),
          }),
        }),
      ]),
    ).emitters;

    expect(only.childSet?.children[0]?.emitters.map((each) => each.name)).toEqual(["spark"]);
    expect(only.childSet?.onDeath).toBe(false);
    expect(only.childSet?.bones).toEqual([]);
    expect(only.childSet?.probability.constant).toEqual([0]);
    expect(only.childSet?.inheritance).toBeNull();
  });

  it("names a child by the object its link reached", () => {
    const reached = {
      ...(spark as VfxValue & { type: "struct" }),
      object: { entry: "0x0badf00d", name: "particles/spark" },
    };
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(identifier({ effect: reached })),
          }),
        }),
      ]),
    ).emitters;

    expect(only.childSet?.children[0]?.entry).toBe("0x0badf00d");
    expect(only.childSet?.children[0]?.name).toBe("particles/spark");
  });

  it("reads a child the read could not reach as no system, keeping its place", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(
              identifier({ effect: { type: "link", hash: "0x0badf00d", name: null } }),
              identifier({ effectKey: { type: "hash", hash: "0x12345678", name: null } }),
              identifier({ effect: spark }),
            ),
          }),
        }),
      ]),
    ).emitters;

    expect(only.childSet?.children.map((each) => each?.emitters.length ?? null)).toEqual([
      null,
      null,
      1,
    ]);
  });

  it("reads a key the resolver inlined, and a link ahead of a key", () => {
    const smoke = struct(nameHash("VfxSystemDefinitionData"), {
      complexEmitterDefinitionData: container(
        emitter({ emitterName: { type: "string", value: "smoke" } }),
      ),
    });
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(
              identifier({ effectKey: spark }),
              identifier({ effect: smoke, effectKey: spark }),
            ),
          }),
        }),
      ]),
    ).emitters;

    expect(only.childSet?.children.map((each) => each?.emitters[0].name)).toEqual([
      "spark",
      "smoke",
    ]);
  });

  it("reads the death flag, the bones, the probability and the inheritance", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(identifier({ effect: spark })),
            childEmitOnDeath: { type: "bool", value: true },
            boneToSpawnAt: container({ type: "string", value: "R_Hand" }),
            childrenProbability: constantOf(number(2.5)),
            ParentInheritanceDefinition: struct(nameHash("VfxParentInheritanceParams"), {
              Mode: number(10),
              RelativeOffset: struct(nameHash("ValueVector3"), {
                constantValue: vector(1, 2, 3),
                dynamics: { type: "null" },
              }),
            }),
          }),
        }),
      ]),
    ).emitters;

    expect(only.childSet?.onDeath).toBe(true);
    expect(only.childSet?.bones).toEqual(["R_Hand"]);
    expect(only.childSet?.probability.constant).toEqual([2.5]);
    expect(only.childSet?.inheritance?.mode).toBe(10);
    expect(only.childSet?.inheritance?.offset.constant).toEqual([1, 2, 3]);
  });

  it("reads a child's own child set, so a nested system nests", () => {
    const nested = struct(nameHash("VfxSystemDefinitionData"), {
      complexEmitterDefinitionData: container(
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(identifier({ effect: spark })),
          }),
        }),
      ),
    });
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: childSet({
            childrenIdentifiers: container(identifier({ effect: nested })),
          }),
        }),
      ]),
    ).emitters;

    const grandchild = only.childSet?.children[0]?.emitters[0].childSet?.children[0];
    expect(grandchild?.emitters.map((each) => each.name)).toEqual(["spark"]);
  });
});

describe("the backface cull", () => {
  it("culls unless disableBackfaceCull is written", () => {
    const [culled, kept] = readVfxSystem(
      system([emitter({}), emitter({ disableBackfaceCull: { type: "bool", value: true } })]),
    ).emitters;

    expect(culled.backfaceCull).toBe(true);
    expect(kept.backfaceCull).toBe(false);
  });
});

describe("the ground layer", () => {
  it("reads isGroundLayer, off where it is not written", () => {
    const [standing, ground] = readVfxSystem(
      system([emitter({}), emitter({ isGroundLayer: { type: "bool", value: true } })]),
    ).emitters;

    expect(standing.groundLayer).toBe(false);
    expect(ground.groundLayer).toBe(true);
  });

  it("reads renderPhaseOverride, automatic where it is not written", () => {
    const [bare, forced] = readVfxSystem(
      system([emitter({}), emitter({ renderPhaseOverride: number(4) })]),
    ).emitters;

    expect(bare.renderPhaseOverride).toBe(RENDER_PHASE.automatic);
    expect(forced.renderPhaseOverride).toBe(RENDER_PHASE.postDistortion);
  });

  it("takes the ground layer off a forced phase, whatever isGroundLayer says", () => {
    const flagged = { isGroundLayer: bool(true) };
    const [forcedIn, forcedOut, automatic] = readVfxSystem(
      system([
        emitter({ renderPhaseOverride: number(RENDER_PHASE.groundLayer) }),
        emitter({ ...flagged, renderPhaseOverride: number(RENDER_PHASE.default) }),
        emitter({ ...flagged, renderPhaseOverride: number(RENDER_PHASE.automatic) }),
      ]),
    ).emitters;

    expect(forcedIn.groundLayer).toBe(true);
    expect(forcedOut.groundLayer).toBe(false);
    expect(automatic.groundLayer).toBe(true);
  });

  it("leaves a HUD-layer system's emitters off the ground layer unless a phase forces it", () => {
    const [flagged, forced] = readVfxSystem(
      hudSystem([
        emitter({ isGroundLayer: bool(true) }),
        emitter({ renderPhaseOverride: number(RENDER_PHASE.groundLayer) }),
      ]),
    ).emitters;

    expect(flagged.groundLayer).toBe(false);
    expect(forced.groundLayer).toBe(true);
  });
});

describe("the drawing layer", () => {
  it("reads drawingLayer 1 as the HUD layer, onto the system and every emitter of it", () => {
    const hud = readVfxSystem(hudSystem([emitter({})], [emitter({})]));
    const world = readVfxSystem(system([emitter({})], [], { drawingLayer: number(0) }));

    expect(hud.hudLayer).toBe(true);
    expect(hud.emitters.map((each) => each.hudLayer)).toEqual([true, true]);
    expect(world.hudLayer).toBe(false);
    expect(world.emitters[0].hudLayer).toBe(false);
    expect(readVfxSystem(system([emitter({})])).hudLayer).toBe(false);
  });

  it("reads a child system's layer off the child, not off its parent", () => {
    const child = struct(nameHash("VfxSystemDefinitionData"), {
      complexEmitterDefinitionData: container(emitter({})),
      drawingLayer: number(1),
    });
    const [only] = readVfxSystem(
      system([
        emitter({
          childParticleSetDefinition: struct(nameHash("VfxChildParticleSetDefinitionData"), {
            childrenIdentifiers: container(
              struct(nameHash("VfxChildIdentifier"), { effect: child }),
            ),
          }),
        }),
      ]),
    ).emitters;

    expect(only.hudLayer).toBe(false);
    expect(only.childSet?.children[0]?.hudLayer).toBe(true);
    expect(only.childSet?.children[0]?.emitters[0].hudLayer).toBe(true);
  });
});

describe("the emission timing", () => {
  it("keeps lifetime as written, an end time that no delay and no single particle moves", () => {
    const [delayed, burst, bare] = readVfxSystem(
      system([
        emitter({ lifetime: number(2.5), timeBeforeFirstEmission: number(4) }),
        emitter({
          lifetime: number(50),
          isSingleParticle: bool(true),
          particleLifetime: constantOf(number(2)),
        }),
        emitter({ isSingleParticle: bool(true) }),
      ]),
    ).emitters;

    expect([delayed.lifetime, delayed.timeBeforeFirstEmission]).toEqual([2.5, 4]);
    expect([burst.lifetime, burst.singleParticle]).toEqual([50, true]);
    expect(bare.lifetime).toBeNull();
  });

  it("reads period and timeActiveDuringPeriod each as written, and neither as no period", () => {
    const periods = readVfxSystem(
      system([
        emitter({}),
        emitter({ period: number(2) }),
        emitter({ timeActiveDuringPeriod: number(0.5) }),
        emitter({ period: number(2), timeActiveDuringPeriod: number(0.5) }),
        emitter({ period: number(0) }),
      ]),
    ).emitters.map((each) => each.period);

    expect(periods).toEqual([
      null,
      { length: 2, active: null },
      { length: null, active: 0.5 },
      { length: 2, active: 0.5 },
      { length: 0, active: null },
    ]);
  });

  it("reads rateByVelocityFunction as its two numbers, and none where both are zero", () => {
    const [written, zero, bare] = readVfxSystem(
      system([
        emitter({ rateByVelocityFunction: constantOf(vector(2, 5)) }),
        emitter({ rateByVelocityFunction: constantOf(vector(0, 0)) }),
        emitter({}),
      ]),
    ).emitters;

    expect(written.rateByVelocity).toEqual([2, 5]);
    expect(zero.rateByVelocity).toBeNull();
    expect(bare.rateByVelocity).toBeNull();
  });

  it("reads a rateByVelocityFunction of one number set as a function", () => {
    const [slope, floor] = readVfxSystem(
      system([
        emitter({ rateByVelocityFunction: constantOf(vector(2, 0)) }),
        emitter({ rateByVelocityFunction: constantOf(vector(0, 5)) }),
      ]),
    ).emitters;

    expect(slope.rateByVelocity).toEqual([2, 0]);
    expect(floor.rateByVelocity).toEqual([0, 5]);
  });

  it("caps that function at MaximumRateByVelocity, 300 where it is not written", () => {
    const [bare, written] = readVfxSystem(
      system([emitter({}), emitter({ MaximumRateByVelocity: number(40) })]),
    ).emitters;

    expect(bare.maximumRateByVelocity).toBe(300);
    expect(written.maximumRateByVelocity).toBe(40);
  });

  it("reads HasVariableStartTime and ChanceToNotExist, off and none where unwritten", () => {
    const [bare, written] = readVfxSystem(
      system([
        emitter({}),
        emitter({ HasVariableStartTime: bool(true), ChanceToNotExist: number(0.25) }),
      ]),
    ).emitters;

    expect([bare.hasVariableStartTime, bare.chanceToNotExist]).toEqual([false, 0]);
    expect([written.hasVariableStartTime, written.chanceToNotExist]).toEqual([true, 0.25]);
  });

  it("says an emitter overrides materials where its list of them holds one", () => {
    const override = struct(nameHash("VfxMaterialOverrideDefinitionData"), {});
    const [bare, empty, written] = readVfxSystem(
      system([
        emitter({}),
        emitter({ materialOverrideDefinitions: container() }),
        emitter({ materialOverrideDefinitions: container(override) }),
      ]),
    ).emitters;

    expect([bare, empty, written].map((each) => each.overridesMaterials)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("the birth", () => {
  it("reads birthAcceleration, none where it is not written", () => {
    const [bare, written] = readVfxSystem(
      system([emitter({}), emitter({ birthAcceleration: constantOf(vector(0, -90, 5)) })]),
    ).emitters;

    expect(bare.birthAcceleration.constant).toEqual([0, 0, 0]);
    expect(written.birthAcceleration.constant).toEqual([0, -90, 5]);
  });

  it("reads postRotateOrientationAxis behind hasPostRotateOrientation alone", () => {
    const axis = { postRotateOrientationAxis: vector(0, 90, 0) };
    const [flagged, unflagged, off, bareFlag] = readVfxSystem(
      system([
        emitter({ ...axis, hasPostRotateOrientation: bool(true) }),
        emitter(axis),
        emitter({ ...axis, hasPostRotateOrientation: bool(false) }),
        emitter({ hasPostRotateOrientation: bool(true) }),
      ]),
    ).emitters;

    expect(flagged.postRotate).toEqual([0, 90, 0]);
    expect(unflagged.postRotate).toBeNull();
    expect(off.postRotate).toBeNull();
    expect(bareFlag.postRotate).toEqual([0, 0, 0]);
  });

  it("reads modulationFactor, one on every channel where it is not written", () => {
    const [bare, written] = readVfxSystem(
      system([emitter({}), emitter({ modulationFactor: vector(0.5, 1, 2, 0.25) })]),
    ).emitters;

    expect(bare.modulation).toEqual([1, 1, 1, 1]);
    expect(written.modulation).toEqual([0.5, 1, 2, 0.25]);
  });

  it("reads emissionMeshName with its scale and its normal flag, at one and on by default", () => {
    const ring: AssetRef = { kind: "gameChunk", wad: "Aatrox.wad.client", pathHash: "0f0e0d0c" };
    const named = { emissionMeshName: { type: "asset", path: "assets/ring.scb", asset: ring } };
    const [bare, written, none, empty] = readVfxSystem(
      system([
        emitter(named as Record<string, VfxValue>),
        emitter({
          ...(named as Record<string, VfxValue>),
          emissionMeshScale: number(2.5),
          useEmissionMeshNormalForBirth: bool(false),
        }),
        emitter({ emissionMeshScale: number(2.5) }),
        emitter({ emissionMeshName: { type: "asset", path: "", asset: null } }),
      ]),
    ).emitters;

    expect(bare.emissionMesh).toEqual({
      mesh: { path: "assets/ring.scb", asset: ring },
      scale: 1,
      useNormal: true,
    });
    expect(written.emissionMesh).toEqual({
      mesh: { path: "assets/ring.scb", asset: ring },
      scale: 2.5,
      useNormal: false,
    });
    expect(none.emissionMesh).toBeNull();
    expect(empty.emissionMesh).toBeNull();
  });

  it("reads offsetLifetimeScaling and the axes its symmetry mode reads unsigned", () => {
    const [bare, written] = readVfxSystem(
      system([
        emitter({}),
        emitter({
          offsetLifetimeScaling: vector(0.01, 0, -0.02),
          offsetLifeScalingSymmetryMode: number(5),
        }),
      ]),
    ).emitters;

    expect([bare.offsetLifetimeScaling, bare.offsetLifeSymmetry]).toEqual([[0, 0, 0], 0]);
    expect([written.offsetLifetimeScaling, written.offsetLifeSymmetry]).toEqual([
      [0.01, 0, -0.02],
      5,
    ]);
  });

  it("reads the winding flag off the unnamed field 0xd1ee8634", () => {
    const [bare, flipped, kept] = readVfxSystem(
      system([
        emitter({}),
        emitter({ "0xd1ee8634": bool(true) }),
        emitter({ "0xd1ee8634": bool(false) }),
      ]),
    ).emitters;

    expect([bare, flipped, kept].map((each) => each.flipWinding)).toEqual([false, true, false]);
  });
});

describe("the force fields", () => {
  function collection(lists: Record<string, VfxValue>): VfxValue {
    return struct(nameHash("VfxFieldCollectionDefinitionData"), lists);
  }

  it("reads each kind's own values, with the schema's defaults where a field is unwritten", () => {
    const [only] = readVfxSystem(
      system([
        emitter({
          fieldCollectionDefinition: collection({
            fieldNoiseDefinitions: container(
              struct(nameHash("VfxFieldNoiseDefinitionData"), {
                axisFraction: vector(1, 0, 1),
                frequency: constantOf(number(10)),
                radius: constantOf(number(500)),
                velocityDelta: constantOf(number(20)),
              }),
            ),
            fieldOrbitalDefinitions: container(
              struct(nameHash("VfxFieldOrbitalDefinitionData"), {}),
            ),
            fieldAccelerationDefinitions: container(
              struct(nameHash("VfxFieldAccelerationDefinitionData"), {
                acceleration: constantOf(vector(0, -500, 0)),
                isLocalSpace: { type: "bool", value: false },
              }),
            ),
          }),
        }),
      ]),
    ).emitters;

    const fields = only.fields;
    expect(fields?.noise[0].axisFraction).toEqual([1, 0, 1]);
    expect(fields?.noise[0].frequency.constant).toEqual([10]);
    expect(fields?.noise[0].radius.constant).toEqual([500]);
    expect(fields?.noise[0].velocityDelta.constant).toEqual([20]);
    expect(fields?.noise[0].position.constant).toEqual([0, 0, 0]);
    expect(fields?.orbital[0].direction.constant).toEqual([0, 1, 0]);
    expect(fields?.orbital[0].localSpace).toBe(true);
    expect(fields?.acceleration[0].acceleration.constant).toEqual([0, -500, 0]);
    expect(fields?.acceleration[0].localSpace).toBe(false);
    expect(fields?.attraction).toEqual([]);
    expect(fields?.drag).toEqual([]);
  });

  it("reads a collection holding no field, and no collection, as none", () => {
    const [empty, absent] = readVfxSystem(
      system([emitter({ fieldCollectionDefinition: collection({}) }), emitter({})]),
    ).emitters;

    expect(empty.fields).toBeNull();
    expect(absent.fields).toBeNull();
  });
});

describe("the instantiation gates", () => {
  /** An emitter with a rate, which the gate on an emitter that can never emit lets through. */
  function emitting(fields: Record<string, VfxValue> = {}): VfxValue {
    return emitter({ rate: constantOf(number(1)), ...fields });
  }

  it("culls the low-spec importance, which Very High effects quality never spawns", () => {
    const [lowSpec, rich, plain] = readVfxSystem(
      system([
        emitting({ importance: number(4) }),
        emitting({ importance: number(5) }),
        emitting({}),
      ]),
    ).emitters;

    expect([lowSpec.culled, lowSpec.disabled]).toEqual(["importance", true]);
    expect([rich.culled, rich.disabled]).toEqual([null, false]);
    expect([plain.culled, plain.disabled]).toEqual([null, false]);
  });

  it("culls a colourblind-only emitter off the complex list alone", () => {
    const model = readVfxSystem(
      system(
        [
          emitting({ colorblindVisibility: number(2) }),
          emitting({ colorblindVisibility: number(1) }),
        ],
        [emitting({ colorblindVisibility: number(2) })],
      ),
    );
    const [colorblind, normal, simple] = model.emitters;

    expect(colorblind.culled).toBe("colorblind");
    expect(normal.culled).toBeNull();
    expect(simple.culled).toBeNull();
  });

  it("never instantiates a colorblindVisibility past the three, on the complex list alone", () => {
    const [three, four, always, simple] = readVfxSystem(
      system(
        [
          emitting({ colorblindVisibility: number(3) }),
          emitting({ colorblindVisibility: number(4) }),
          emitting({ colorblindVisibility: number(0) }),
        ],
        [emitting({ colorblindVisibility: number(3) })],
      ),
    ).emitters;

    expect([three.culled, three.disabled]).toEqual(["never", true]);
    expect([four.culled, four.disabled]).toEqual(["never", true]);
    expect([always.culled, always.disabled]).toEqual([null, false]);
    expect([simple.culled, simple.disabled]).toEqual([null, false]);
  });

  /** An emitter whose `Filtering` writes `policy`. */
  function filtered(policy: number, own: Record<string, VfxValue> = {}): VfxValue {
    return emitting({
      ...own,
      Filtering: struct(nameHash("VfxEmitterFiltering"), { spectatorPolicy: number(policy) }),
    });
  }

  it("culls a spectatorPolicy that asks for a spectator, on either list", () => {
    const [always, hidden, spectating, past, bare, simple] = readVfxSystem(
      system(
        [
          filtered(0),
          filtered(1),
          filtered(2),
          filtered(7),
          emitting({ Filtering: struct(nameHash("VfxEmitterFiltering"), {}) }),
        ],
        [filtered(2)],
      ),
    ).emitters;

    expect([always.culled, hidden.culled, bare.culled]).toEqual([null, null, null]);
    expect([spectating.culled, spectating.disabled]).toEqual(["spectator", true]);
    expect([past.culled, past.disabled]).toEqual(["spectator", true]);
    expect([simple.culled, simple.disabled]).toEqual(["spectator", true]);
  });

  it("drops every simple emitter of a HUD-layer system, and none of its complex ones", () => {
    const [complex, simple] = readVfxSystem(hudSystem([emitting({})], [emitting({})])).emitters;
    const [, world] = readVfxSystem(system([emitting({})], [emitting({})])).emitters;

    expect([complex.culled, complex.disabled]).toEqual([null, false]);
    expect([simple.culled, simple.disabled]).toEqual(["hudLayer", true]);
    expect([world.culled, world.disabled]).toEqual([null, false]);
  });

  it("names the first gate that removes an emitter: spectator, HUD layer, importance, palette", () => {
    const lowSpec = { importance: number(4) };
    const colorblind = { colorblindVisibility: number(2) };
    const [spectator, importance, palette] = readVfxSystem(
      system([
        filtered(2, { ...lowSpec, ...colorblind }),
        emitting({ ...lowSpec, ...colorblind }),
        emitting(colorblind),
      ]),
    ).emitters;
    const [, hudSpectator, hudLowSpec] = readVfxSystem(
      hudSystem([emitting({})], [filtered(2, lowSpec), emitting(lowSpec)]),
    ).emitters;

    expect(spectator.culled).toBe("spectator");
    expect(importance.culled).toBe("importance");
    expect(palette.culled).toBe("colorblind");
    expect(hudSpectator.culled).toBe("spectator");
    expect(hudLowSpec.culled).toBe("hudLayer");
  });

  it("keeps an emitter's own disabled flag apart from the gate that names none", () => {
    const [only] = readVfxSystem(system([emitting({ disabled: bool(true) })])).emitters;

    expect([only.culled, only.disabled]).toEqual([null, true]);
  });
  it("drops an emitter that can never emit: no rate, no single burst, no flex rate, no override", () => {
    const ramp = (peak: number) =>
      struct(nameHash("ValueFloat"), {
        constantValue: number(5),
        dynamics: struct(nameHash("VfxAnimatedFloatVariableData"), {
          times: container(number(0), number(1)),
          values: container(number(0), number(peak)),
        }),
      });
    const [none, zero, flat, climbing, burst, flexed, overriding, simple] = readVfxSystem(
      system(
        [
          emitter({}),
          emitter({ rate: constantOf(number(0)) }),
          emitter({ rate: ramp(0) }),
          emitter({ rate: ramp(3) }),
          emitter({ isSingleParticle: bool(true) }),
          emitter({ flexRate: struct(nameHash("FlexValueFloat"), {}) }),
          emitter({ materialOverrideDefinitions: container(struct(nameHash("x"), {})) }),
        ],
        [emitter({})],
      ),
    ).emitters;

    expect([none.culled, none.disabled]).toEqual(["noRate", true]);
    expect([zero.culled, flat.culled, simple.culled]).toEqual(["noRate", "noRate", "noRate"]);
    expect([climbing.culled, burst.culled, flexed.culled, overriding.culled]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
