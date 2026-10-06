import { describe, expect, it } from "vitest";

import { FORWARD } from "@/modules/viewport";

import type { ProbabilityTable } from "../../model/curve";
import {
  ADDRESS_MODE,
  BLEND_MODE,
  COLOR_LOOKUP,
  DRAG_MOTION,
  type DragMotion,
  LINGER_TYPE,
  OFFSET_SYMMETRY,
  QUAD_TYPE,
  STENCIL_MODE,
  TRAIL_MODE,
  TRAIL_SMOOTHING,
  UV_MODE,
} from "../../model/enums";
import {
  type EmitterModel,
  type ErosionModel,
  type FieldsModel,
  type LegacySimpleModel,
  plainUvLayer,
  POINT_SHAPE,
  type SpawnShape,
  type SystemModel,
  type TrailModel,
  type UvLayer,
  type ValueCurve,
} from "../../model/model";
import { type Motion, originAt, type Point } from "../../model/rig";
import { ROTATION_RATE } from "../../model/systemModel";
import { AXIS, axisInto, identityInto, yawInto } from "../../utils/basis";
import { Rng } from "../../utils/Rng";
import type { EmissionSampler, SystemSurfaces } from "../emissionSurface";
import {
  createEmitterStates,
  type EmitterState,
  NO_TRANSFORM,
  stepEmitters,
  type SystemStep,
  worldOf,
} from "../integrate";
import {
  age01,
  appearance,
  type DrawFrame,
  drawnPlace,
  drawnPlaceInto,
  erosionDrive,
  frameOf,
  orbitInto,
  ownBasisInto,
  type Source,
  spinOf,
  standingFrameInto,
  stretchOf,
} from "../particleRead";
import { createPool, FRAME_SLOTS, NOT_LINGERING, type Pool, spawn, UV, uvAt } from "../pool";
import { fixedRateStepper } from "../stepper";

/** A system the rig neither turns nor transforms, which most of a draw reads against. */
const UNTURNED = identityInto(new Float32Array(FRAME_SLOTS));

function flat(...constant: number[]): ValueCurve {
  return { constant, keys: [], tables: [] };
}

function keyed(...keys: [number, ...number[]][]): ValueCurve {
  return {
    constant: [0],
    keys: keys.map(([time, ...values]) => ({ time, values })),
    tables: [],
  };
}

/** A probability table on `channel` whose draw runs from `from` to `to`. */
function spread(channel: number, from: number, to: number): ProbabilityTable {
  return {
    channel,
    single: 1,
    keys: [
      { time: 0, values: [from] },
      { time: 1, values: [to] },
    ],
  };
}

function emitterOf(over: Partial<EmitterModel> = {}): EmitterModel {
  return {
    emissionSurface: null,
    customMaterial: null,
    index: 0,
    simple: false,
    listIndex: 0,
    name: "spark",
    disabled: false,
    culled: null,
    hudLayer: false,
    chanceToNotExist: 0,
    rateByVelocity: null,
    maximumRateByVelocity: 300,
    hasVariableStartTime: false,
    overridesMaterials: false,
    birthAcceleration: { constant: [0, 0, 0], keys: [], tables: [] },
    emissionMesh: null,
    offsetLifetimeScaling: [0, 0, 0],
    offsetLifeSymmetry: 0,
    postRotate: null,
    modulation: [1, 1, 1, 1],
    renderPhaseOverride: 7,
    flipWinding: false,
    rate: flat(0),
    particleLifetime: flat(100),
    lifetime: null,
    timeBeforeFirstEmission: 0,
    period: null,
    singleParticle: false,
    sharedRandom: false,
    birthVelocity: flat(0, 0, 0),
    acceleration: flat(0, 0, 0),
    drag: flat(0, 0, 0),
    birthDrag: flat(0, 0, 0),
    velocity: flat(0, 0, 0),
    worldAcceleration: flat(0, 0, 0),
    birthOrbitalVelocity: flat(0, 0, 0),
    bindWeight: flat(0),
    emitterPosition: flat(0, 0, 0),
    emitterSpace: false,
    shape: POINT_SHAPE,
    rotationOverride: [0, 0, 0],
    scaleOverride: [1, 1, 1],
    translationOverride: [0, 0, 0],
    localOrientation: true,
    particleLocalOrientation: false,
    uniformScale: false,
    particleLinger: 0,
    emitterLinger: 0,
    lingerType: LINGER_TYPE.maxLifetimeAfterEmitterDies,
    linger: null,
    palette: null,
    erosion: null,
    distortion: null,
    reflection: null,
    soft: null,
    lookupX: COLOR_LOOKUP.lifetime,
    lookupY: COLOR_LOOKUP.constant,
    lookupOffsets: [0, 0],
    lookupScales: [1, 1],
    colorTexture: null,
    uv: plainUvLayer(),
    uvMode: UV_MODE.default,
    multTexture: null,
    multUv: null,
    rotation0: flat(0, 0, 0),
    birthRotation0: flat(0, 0, 0),
    birthRotationalVelocity0: flat(0, 0, 0),
    birthRotationalAcceleration: flat(0, 0, 0),
    legacySimple: null,
    pivotUp: false,
    rotationEnabled: false,
    directionOriented: false,
    directionVelocityScale: 0,
    directionVelocityMinScale: 1,
    scale0: flat(1, 1, 1),
    birthScale0: flat(1, 1, 1),
    color: flat(1, 1, 1, 1),
    birthColor: flat(1, 1, 1, 1),
    texture: null,
    blendMode: BLEND_MODE.add,
    pass: 0,
    miscRenderFlags: 0,
    groundLayer: false,
    alphaRef: 0,
    quadType: QUAD_TYPE.cameraQuad,
    stencilMode: STENCIL_MODE.disabled,
    stencilRef: 0,
    primitiveClass: null,
    primitiveName: null,
    mesh: null,
    trail: null,
    beam: null,
    projection: null,
    childSet: null,
    fields: null,
    depthBias: [0, 0],
    depthPushPull: 0,
    backfaceCull: true,
    ...over,
  };
}

function legacyOf(over: Partial<LegacySimpleModel> = {}): LegacySimpleModel {
  return {
    birthScale: flat(100),
    scaleBias: [1, 1],
    scale: flat(1),
    birthRotation: flat(0),
    birthRotationalVelocity: flat(0),
    rotation: flat(0),
    lockedToEmitter: false,
    hasFixedOrbit: false,
    fixedOrbitType: 1,
    orientation: 0,
    particleBind: [0, 0],
    uvScrollRate: [0, 0],
    scaleUpFromOrigin: false,
    ...over,
  };
}

/** A simple emitter, the one kind the reader hands a legacy block. */
function simpleOf(
  legacy: Partial<LegacySimpleModel> = {},
  over: Partial<EmitterModel> = {},
): EmitterModel {
  return emitterOf({ simple: true, legacySimple: legacyOf(legacy), ...over });
}

const AT_ORIGIN: DrawFrame = {
  emitter: emitterOf(),
  now: 0,
  phase: 0,
  origin: [0, 0, 0],
  orientation: UNTURNED,
  world: NO_TRANSFORM,
};

interface Run {
  readonly pool: Pool;
  readonly state: EmitterState[];
  readonly emitters: readonly EmitterModel[];
  step(count?: number): void;
  /** Where the particle at `at` draws in the world at the run's own time, to four decimals. */
  place(at: number): number[];
}

/** What a run stands on beside its emitters and its step. */
interface Staging {
  readonly capacity?: number;
  readonly seed?: number;
  readonly motion?: Motion;
  /** The time the rig stops the system at, and null for a system left running. */
  readonly stopAt?: number | null;
  readonly facing?: Point;
  readonly dragMotion?: DragMotion;
  /** The definition's own `transform`, sixteen cells as the file lays them out. */
  readonly transform?: readonly number[] | null;
  readonly hudLayer?: boolean;
  /** The stream `ChanceToNotExist` is rolled from, and none to leave every emitter in. */
  readonly chance?: Rng;
  /** The emission samplers of each emitter, by emitter index. */
  readonly surfaces?: SystemSurfaces;
}

const STILL: Motion = { kind: "still" };

function run(emitters: readonly EmitterModel[], dt = 0.25, staging: Staging = {}): Run {
  const {
    capacity = 256,
    seed = 1,
    motion = STILL,
    stopAt = null,
    facing = FORWARD,
    dragMotion = DRAG_MOTION.stepped,
    transform = null,
    hudLayer = false,
    chance,
    surfaces,
  } = staging;
  const system: SystemModel = {
    entry: null,
    name: null,
    emitters,
    transform,
    hudLayer,
    dragMotion,
    buildUpTime: 0,
  };
  const pool = createPool(capacity);
  const state = createEmitterStates(emitters, chance);
  const stepper = fixedRateStepper(1 / dt);
  const rng = new Rng(seed);
  const yaw = yawInto(facing, new Float32Array(FRAME_SLOTS));
  const world = worldOf(system);
  let origin = originAt(motion, 0);

  return {
    pool,
    state,
    emitters,
    step(count = 1) {
      for (let frame = 0; frame < count; frame += 1) {
        for (const step of stepper.advance(dt)) {
          const now = originAt(motion, step.now);
          const moved: Point = [now[0] - origin[0], now[1] - origin[1], now[2] - origin[2]];
          const placed: SystemStep = {
            dt: step.dt,
            now: step.now,
            origin: now,
            moved,
            yaw,
            world,
            stopped: stopAt !== null && step.now >= stopAt,
            surfaces,
          };
          stepEmitters(pool, system, placed, rng, state);
          origin = now;
        }
      }
    },
    place(at) {
      const source: Source = {
        pool,
        time: stepper.now,
        elapsed: stepper.now,
        origin,
        target: origin,
        orientation: yaw,
        world,
      };
      const out = drawnPlace();
      drawnPlaceInto(pool, at, frameOf(source, emitters[pool.emitter[at]]), out);
      return Array.from(out.place, rounded);
    },
  };
}

function vec3(array: Float32Array, index: number): number[] {
  return Array.from(array.subarray(index * 3, index * 3 + 3));
}

/** `value` to four decimals, which drops a basis's float error and its negative zero. */
function rounded(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0;
}

/** One column of `array` over the pool's live particles. */
function column(pool: Pool, array: ArrayLike<number>): number[] {
  return Array.from({ length: pool.count }, (_, at) => array[at]);
}

describe("stepEmitters", () => {
  it("births a particle at the emitter origin, moving at the birth velocity", () => {
    const sim = run([emitterOf({ birthVelocity: flat(1, 2, 3) })]);
    sim.step();

    expect(sim.pool.count).toBe(1);
    expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
    expect(vec3(sim.pool.velocity, 0)).toEqual([1, 2, 3]);
  });

  it("carries a particle at its velocity once a later step moves it", () => {
    const sim = run([emitterOf({ birthVelocity: flat(1, 2, 3) })], 1);
    sim.step(3);

    expect(vec3(sim.pool.position, 0)).toEqual([2, 4, 6]);
  });

  it("adds the emitter's acceleration to the velocity before it moves the particle", () => {
    const sim = run([emitterOf({ acceleration: flat(0, -10, 0) })], 1);
    sim.step(3);

    expect(vec3(sim.pool.velocity, 0)).toEqual([0, -20, 0]);
    expect(vec3(sim.pool.position, 0)).toEqual([0, -30, 0]);
  });

  it("adds the birth acceleration to the emitter's own, held at what the particle drew", () => {
    const sim = run(
      [emitterOf({ birthAcceleration: flat(0, -10, 0), acceleration: flat(0, -5, 0) })],
      1,
    );
    sim.step(3);

    expect(vec3(sim.pool.birthAcceleration, 0)).toEqual([0, -10, 0]);
    expect(vec3(sim.pool.velocity, 0)).toEqual([0, -30, 0]);
    expect(vec3(sim.pool.position, 0)).toEqual([0, -45, 0]);
  });

  it("eases a velocity toward zero under a drag it can absorb", () => {
    const sim = run([emitterOf({ birthVelocity: flat(10, 0, 0), drag: flat(0.5, 0, 0) })], 1);
    sim.step(2);
    expect(sim.pool.velocity[0]).toBeCloseTo(5, 5);

    sim.step();
    expect(sim.pool.velocity[0]).toBeCloseTo(2.5, 5);
  });

  it("never pushes a velocity across zero, however large the drag", () => {
    const sim = run([emitterOf({ birthVelocity: flat(10, -4, 0), drag: flat(100, 100, 0) })], 1);
    sim.step(4);

    expect(sim.pool.velocity[0]).toBe(0);
    expect(sim.pool.velocity[1]).toBe(0);
  });

  it("drags the emitter's own velocity and leaves the change on the particle's", () => {
    const sim = run([emitterOf({ velocity: flat(10, 0, 0), drag: flat(0.5, 0, 0) })], 1);

    /* The drift is dragged from 10 to 5, and the particle's own velocity absorbs the 5. */
    sim.step(2);
    expect(sim.pool.velocity[0]).toBeCloseTo(-5, 5);
    expect(sim.pool.position[0]).toBeCloseTo(5, 5);

    sim.step();
    expect(sim.pool.velocity[0]).toBeCloseTo(-7.5, 5);
    expect(sim.pool.position[0]).toBeCloseTo(7.5, 5);
  });

  it("drags a particle by its birth drag where the emitter keys none", () => {
    const sim = run([emitterOf({ birthVelocity: flat(10, 0, 0), birthDrag: flat(0.5, 0, 0) })], 1);
    sim.step(2);
    expect(sim.pool.velocity[0]).toBeCloseTo(5, 5);

    sim.step();
    expect(sim.pool.velocity[0]).toBeCloseTo(2.5, 5);
  });

  it("sums the birth drag into the emitter's own, per axis", () => {
    const sim = run(
      [
        emitterOf({
          birthVelocity: flat(10, 10, 10),
          drag: flat(0.25, 0.5, 0),
          birthDrag: flat(0.25, 0, 0),
        }),
      ],
      1,
    );
    sim.step(2);

    expect(sim.pool.velocity[0]).toBeCloseTo(5, 5);
    expect(sim.pool.velocity[1]).toBeCloseTo(5, 5);
    expect(sim.pool.velocity[2]).toBeCloseTo(10, 5);
  });

  it("holds the birth drag at what the particle was born under", () => {
    const sim = run(
      [
        emitterOf({
          lifetime: 10,
          birthVelocity: flat(10, 0, 0),
          birthDrag: keyed([0, 0, 0, 0], [0.5, 0, 0, 0], [0.6, 100, 100, 100]),
        }),
      ],
      1,
    );
    sim.step(8);

    expect(vec3(sim.pool.birthDrag, 0)).toEqual([0, 0, 0]);
    expect(sim.pool.velocity[0]).toBeCloseTo(10, 5);
  });

  describe("under kAnalyticDragMotion", () => {
    const analytic = (emitters: readonly EmitterModel[], dt: number) =>
      run(emitters, dt, { dragMotion: DRAG_MOTION.analytic });

    it("zeroes the birth velocity and eases out to it over the birth drag", () => {
      const sim = analytic(
        [emitterOf({ birthVelocity: flat(100, 0, 0), birthDrag: flat(4, 0, 0) })],
        0.05,
      );
      sim.step();
      expect(vec3(sim.pool.velocity, 0)).toEqual([0, 0, 0]);

      sim.step(200);
      expect(sim.pool.position[0]).toBeCloseTo(25, 3);
    });

    it("stands where the closed form puts it at an age, whatever the step", () => {
      const emitters = [emitterOf({ birthVelocity: flat(-400, 0, 0), birthDrag: flat(10, 0, 0) })];
      const eased = -40 * (1 - Math.exp(-1));

      const coarse = analytic(emitters, 0.05);
      coarse.step(1 + 2);
      const fine = analytic(emitters, 0.01);
      fine.step(1 + 10);

      expect(coarse.pool.position[0]).toBeCloseTo(eased, 3);
      expect(fine.pool.position[0]).toBeCloseTo(eased, 3);

      const stepped = run(emitters, 0.05);
      stepped.step(1 + 2);
      expect(stepped.pool.position[0]).not.toBeCloseTo(eased, 1);
    });

    it("never moves an axis no birth drag damps off its birth velocity", () => {
      const sim = analytic(
        [emitterOf({ birthVelocity: flat(100, 0, 0), drag: flat(4, 0, 0) })],
        0.05,
      );
      sim.step(20);

      expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
    });

    it("eases off the birth drag alone, whatever drag the emitter adds", () => {
      const sim = analytic(
        [
          emitterOf({
            birthVelocity: flat(100, 0, 0),
            birthDrag: flat(4, 0, 0),
            drag: flat(100, 0, 0),
          }),
        ],
        0.05,
      );
      sim.step(1 + 5);

      expect(sim.pool.position[0]).toBeCloseTo(25 * (1 - Math.exp(-1)), 3);
    });

    it("steps no drag at all, so the emitter's own damps nothing", () => {
      const sim = analytic([emitterOf({ velocity: flat(10, 0, 0), drag: flat(-800, 0, 0) })], 1);
      sim.step(3);

      expect(vec3(sim.pool.position, 0)).toEqual([20, 0, 0]);
      expect(vec3(sim.pool.velocity, 0)).toEqual([0, 0, 0]);
    });

    it("eases nothing on an axis whose birth drag is negative, rather than overflowing", () => {
      const sim = analytic(
        [emitterOf({ birthVelocity: flat(10, 0, 0), birthDrag: flat(-800, 0, 0) })],
        1,
      );
      sim.step(3);

      expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
      expect(vec3(sim.pool.placed, 0)).toEqual([0, 0, 0]);
    });

    it("leaves the acceleration undamped", () => {
      const sim = analytic(
        [
          emitterOf({
            acceleration: flat(0, -10, 0),
            drag: flat(0, 4, 0),
            birthDrag: flat(0, 4, 0),
          }),
        ],
        1,
      );
      sim.step(3);

      expect(vec3(sim.pool.velocity, 0)).toEqual([0, -20, 0]);
      expect(vec3(sim.pool.position, 0)).toEqual([0, -30, 0]);
    });
  });

  it("retires a particle when its lifetime passes", () => {
    const sim = run([emitterOf({ particleLifetime: flat(1) })]);
    sim.step(4);
    expect(sim.pool.count).toBe(1);

    sim.step();
    expect(sim.pool.count).toBe(0);
  });

  it("emits one particle from an emitter authored at no rate", () => {
    const sim = run([emitterOf({ rate: flat(0) })]);
    sim.step(10);

    expect(sim.pool.count).toBe(1);
  });

  it("holds the first spawn until timeBeforeFirstEmission", () => {
    const sim = run([emitterOf({ rate: flat(4), timeBeforeFirstEmission: 0.5 })]);
    sim.step();
    expect(sim.pool.count).toBe(0);

    /* The count runs from the system's start, so the half second owes two at once. */
    sim.step();
    expect(sim.pool.count).toBe(2);
  });

  it("pauses an emitter outside the active part of each period", () => {
    const sim = run([emitterOf({ rate: flat(4), period: { length: 2, active: 0.5 } })]);
    sim.step(2);
    const active = sim.pool.count;
    expect(active).toBeGreaterThan(0);

    sim.step(5);
    expect(sim.pool.count).toBe(active);

    sim.step(2);
    expect(sim.pool.count).toBeGreaterThan(active);
  });

  it("emits a single-particle emitter's whole burst once and never again", () => {
    const sim = run([emitterOf({ rate: flat(5), singleParticle: true })]);
    sim.step();
    expect(sim.pool.count).toBe(5);

    sim.step(20);
    expect(sim.pool.count).toBe(5);
  });

  it("caps a step's spawns at a third of the rate plus one", () => {
    const sim = run([emitterOf({ rate: flat(100) })], 1);
    sim.step();

    expect(sim.pool.count).toBe(34);
  });

  it("drops the fraction a step's count truncates, so the average rate falls short", () => {
    const sim = run([emitterOf({ rate: flat(10) })], 0.25);
    sim.step(8);

    /* Each step owes two and a half and spawns two, so two seconds make 16 and not 20. */
    expect(sim.pool.count).toBe(16);
  });

  it("stops emitting once the system's time reaches lifetime, keeping what is already alive", () => {
    const sim = run([emitterOf({ rate: flat(10), lifetime: 0.5 })]);
    sim.step(2);
    const emitted = sim.pool.count;

    sim.step(10);
    expect(sim.pool.count).toBe(emitted);
    expect(emitted).toBeGreaterThan(0);
  });

  it("emits nothing from a disabled emitter, and everything from the one beside it", () => {
    const sim = run([
      emitterOf({ rate: flat(8), disabled: true }),
      emitterOf({ rate: flat(8), index: 1 }),
    ]);
    sim.step(4);

    expect(sim.pool.count).toBeGreaterThan(0);
    expect(column(sim.pool, sim.pool.emitter)).not.toContain(0);
  });

  it("yaws a birth to the system's facing, velocity and placement alike", () => {
    const sim = run(
      [emitterOf({ birthVelocity: flat(0, 0, 10), translationOverride: [0, 0, 5] })],
      0.25,
      { facing: [1, 0, 0] },
    );
    sim.step(2);

    /* The pool keeps the birth's own frame, and the yaw is what the frame turns it by. */
    expect(vec3(sim.pool.velocity, 0)).toEqual([0, 0, 10]);
    expect(vec3(sim.pool.travel, 0).map(rounded)).toEqual([10, 0, 0]);
    expect(vec3(sim.pool.anchor, 0).map(rounded)).toEqual([5, 0, 0]);
    expect(sim.place(0)).toEqual([7.5, 0, 0]);
  });

  it("stands a birth on rotationOverride, scaled by scaleOverride", () => {
    const sim = run([
      emitterOf({
        birthVelocity: flat(0, 0, 10),
        rotationOverride: [0, 90, 0],
        scaleOverride: [2, 1, 1],
        shape: { kind: "point", offset: [1, 0, 0] },
      }),
    ]);
    sim.step();

    /* The point's own offset is scaled along x and turned onto -z. */
    expect(vec3(sim.pool.position, 0)).toEqual([1, 0, 0]);
    expect(sim.place(0)).toEqual([0, 0, -2]);

    sim.step();
    expect(vec3(sim.pool.travel, 0).map(rounded)).toEqual([10, 0, 0]);
    expect(sim.place(0)).toEqual([2.5, 0, -2]);
  });

  it("leaves the system's facing out of the frame where isLocalOrientation is off", () => {
    const sim = run(
      [
        emitterOf({
          birthVelocity: flat(0, 0, 10),
          translationOverride: [0, 0, 5],
          localOrientation: false,
        }),
      ],
      0.25,
      { facing: [1, 0, 0] },
    );
    sim.step(2);

    expect(Array.from(sim.pool.frame.subarray(0, FRAME_SLOTS), rounded)).toEqual(
      Array.from(UNTURNED),
    );
    expect(vec3(sim.pool.travel, 0)).toEqual([0, 0, 10]);
    expect(sim.place(0)).toEqual([0, 0, 7.5]);
  });

  it("leaves translationOverride out of the turn and the scale of the emitter's own frame", () => {
    const sim = run([
      emitterOf({
        rotationOverride: [0, 90, 0],
        scaleOverride: [3, 3, 3],
        translationOverride: [0, 0, 5],
      }),
    ]);
    sim.step();

    expect(vec3(sim.pool.anchor, 0)).toEqual([0, 0, 5]);
    expect(sim.place(0)).toEqual([0, 0, 5]);
  });

  it("turns the emitter's acceleration and drift by the frame a particle was born in", () => {
    const sim = run([emitterOf({ acceleration: flat(0, 0, 100), velocity: flat(0, 0, 4) })], 0.25, {
      facing: [1, 0, 0],
    });
    sim.step(2);

    expect(vec3(sim.pool.velocity, 0)).toEqual([0, 0, 25]);
    /* A quarter second at 25 plus the drift's 4, along the x the frame turns z onto. */
    expect(vec3(sim.pool.travel, 0).map(rounded)).toEqual([29, 0, 0]);
    expect(sim.place(0)).toEqual([(25 + 4) * 0.25, 0, 0]);
  });

  it("replays the same pool from the same seed", () => {
    const emitters = [emitterOf({ rate: flat(30), particleLifetime: flat(0.6) })];
    const first = run(emitters, 0.05, { seed: 4321 });
    const second = run(emitters, 0.05, { seed: 4321 });
    first.step(40);
    second.step(40);

    expect(second.pool.count).toBe(first.pool.count);
    expect(Array.from(second.pool.roll)).toEqual(Array.from(first.pool.roll));
    expect(Array.from(second.pool.position)).toEqual(Array.from(first.pool.position));
    expect(Array.from(second.pool.birthTime)).toEqual(Array.from(first.pool.birthTime));
  });
});

describe("the spawn count", () => {
  it("lets a slow rate build up over the steps that spawn nothing", () => {
    const sim = run([emitterOf({ rate: flat(1) })]);
    sim.step(4);
    expect(sim.pool.count).toBe(1);

    /* The first spawn was at 0.25, and a whole particle is owed a second after it. */
    sim.step();
    expect(sim.pool.count).toBe(2);
    expect(sim.state[0].lastSpawn).toBe(1.25);
  });

  it("counts a delayed emitter's first spawn over the whole delay, so it bursts to the cap", () => {
    const sim = run([emitterOf({ rate: flat(100), timeBeforeFirstEmission: 1 })]);
    expect(sim.state[0].lastSpawn).toBe(0);

    sim.step(3);
    expect(sim.pool.count).toBe(0);

    sim.step();
    expect(sim.pool.count).toBe(34);

    /* From there a step owes the quarter second since the last spawn alone. */
    sim.step();
    expect(sim.pool.count).toBe(34 + 25);
  });

  it("holds a first emission that counts to nothing under HasVariableStartTime", () => {
    const sim = run([emitterOf({ rate: flat(1), hasVariableStartTime: true })]);
    sim.step(3);
    expect(sim.pool.count).toBe(0);
    expect(sim.state[0].emitted).toBe(false);

    sim.step();
    expect(sim.pool.count).toBe(1);
    expect(sim.pool.birthTime[0]).toBe(1);
  });

  describe("under rateByVelocityFunction", () => {
    /* A hundred units a second along X, so a quarter-second step travels twenty-five. */
    const flight: Motion = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 };

    it("spawns by the system's speed in rate's place", () => {
      const sim = run([emitterOf({ rate: flat(400), rateByVelocity: [0.1, 0] })], 0.25, {
        motion: flight,
      });
      sim.step(3);

      /* Ten a second, so each quarter second owes two and a half. */
      expect(sim.pool.count).toBe(6);
    });

    it("spawns at the function's own offset where the system stands still", () => {
      const sim = run([emitterOf({ rate: flat(400), rateByVelocity: [0.1, 6] })]);
      sim.step(3);

      expect(sim.pool.count).toBe(3);
    });

    it("holds the rate at maximumRateByVelocity", () => {
      const sim = run(
        [emitterOf({ rate: flat(400), rateByVelocity: [1, 0], maximumRateByVelocity: 6 })],
        0.25,
        { motion: flight },
      );
      sim.step(3);

      expect(sim.pool.count).toBe(3);
    });
  });

  it("rolls ChanceToNotExist as the system spawns, and leaves an absent emitter out", () => {
    const sim = run(
      [emitterOf({ rate: flat(8), chanceToNotExist: 1 }), emitterOf({ rate: flat(8), index: 1 })],
      0.25,
      { chance: new Rng(7) },
    );
    sim.step(4);

    expect(sim.state.map((state) => state.absent)).toEqual([true, false]);
    expect(sim.pool.count).toBeGreaterThan(0);
    expect(column(sim.pool, sim.pool.emitter)).not.toContain(0);
  });

  it("draws nothing for an emitter writing no chance, and leaves every emitter in without a stream", () => {
    const rng = new Rng(7);
    const untouched = rng.clone();

    expect(createEmitterStates([emitterOf()], rng)[0].absent).toBe(false);
    expect(rng.unitFloat()).toBe(untouched.unitFloat());
    expect(createEmitterStates([emitterOf({ chanceToNotExist: 1 })])[0].absent).toBe(false);
  });
});

describe("the emission window", () => {
  it("reads lifetime as an end time on the system's clock, not as a span after the delay", () => {
    const sim = run([emitterOf({ rate: flat(4), timeBeforeFirstEmission: 0.5, lifetime: 1 })]);
    sim.step(12);

    /* Two at 0.5 and one at 0.75, and the end at 1 comes before a fourth. */
    expect(sim.pool.count).toBe(3);
    expect(Math.max(...column(sim.pool, sim.pool.birthTime))).toBe(0.75);
  });

  it("never emits from an emitter delayed past its own end", () => {
    const sim = run([emitterOf({ rate: flat(4), timeBeforeFirstEmission: 2, lifetime: 1 })]);
    sim.step(16);

    expect(sim.pool.count).toBe(0);
  });

  describe("of a single-particle emitter", () => {
    /** How many particles a burst delayed two seconds has, a quarter second after it is due. */
    function burst(over: Partial<EmitterModel>): number {
      const sim = run([
        emitterOf({
          rate: flat(1),
          singleParticle: true,
          particleLifetime: flat(1),
          timeBeforeFirstEmission: 2,
          ...over,
        }),
      ]);
      sim.step(9);
      return sim.pool.count;
    }

    it("ends at particleLifetime where it writes no lifetime, so a longer delay never bursts", () => {
      expect(burst({ lifetime: null })).toBe(0);
    });

    it("ends at particleLifetime where its lifetime is over ten seconds past it", () => {
      expect(burst({ lifetime: 50 })).toBe(0);
    });

    it("keeps a lifetime within ten seconds of particleLifetime", () => {
      expect(burst({ lifetime: 5 })).toBe(1);
    });

    it("keeps its lifetime as written where it overrides materials", () => {
      expect(burst({ lifetime: null, overridesMaterials: true })).toBe(1);
    });
  });

  it("counts the period from the system's start, whatever the delay", () => {
    const sim = run([
      emitterOf({
        rate: flat(4),
        timeBeforeFirstEmission: 0.5,
        period: { length: 2, active: 1 },
      }),
    ]);
    sim.step(7);

    /* Active until 1 on the system's clock, which leaves the delayed emitter half a second. */
    expect(sim.pool.count).toBe(3);
    expect(Math.max(...column(sim.pool, sim.pool.birthTime))).toBe(0.75);

    sim.step(2);
    expect(sim.pool.count).toBe(4);
    expect(sim.pool.birthTime[3]).toBe(2.25);
  });

  it("runs a period of no length as one cycle that never repeats", () => {
    const sim = run([emitterOf({ rate: flat(4), period: { length: null, active: 0.5 } })]);
    sim.step(20);

    expect(sim.pool.count).toBe(1);
    expect(sim.pool.birthTime[0]).toBe(0.25);
  });
});

describe("the births of one step", () => {
  /* A hundred units a second along X, so a quarter-second step travels twenty-five. */
  const flight: Motion = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 };

  it("spreads them evenly over the step, in birth time and along the system's travel", () => {
    const sim = run([emitterOf({ rate: flat(16), birthVelocity: flat(0, 3, 0) })], 0.25, {
      motion: flight,
    });
    sim.step();

    expect(column(sim.pool, sim.pool.birthTime)).toEqual([0.0625, 0.125, 0.1875, 0.25]);
    expect([0, 1, 2, 3].map((at) => sim.pool.anchor[at * 3])).toEqual([6.25, 12.5, 18.75, 25]);
  });

  it("moves none of them on the step they are born in, however early in it", () => {
    const sim = run([emitterOf({ rate: flat(16), birthVelocity: flat(0, 3, 0) })]);
    sim.step();

    expect(sim.pool.count).toBe(4);
    for (let at = 0; at < sim.pool.count; at += 1) {
      expect(vec3(sim.pool.position, at)).toEqual([0, 0, 0]);
      expect(vec3(sim.pool.travel, at)).toEqual([0, 0, 0]);
    }
  });
});

describe("the values read over a particle's life", () => {
  /* The emitter's own life runs a hundred times as long as its particle's, so a value read
     at the emitter's phase would hardly have left its first key. */
  const brief = { particleLifetime: flat(1), lifetime: 100 };

  it("reads acceleration at the particle's age", () => {
    const sim = run([emitterOf({ ...brief, acceleration: keyed([0, 0, 0, 0], [1, 0, 4, 0]) })]);
    sim.step(3);

    expect(sim.pool.velocity[1]).toBeCloseTo(4 * 0.25 * 0.25 + 4 * 0.5 * 0.25, 5);
  });

  it("reads velocity at the particle's age", () => {
    const sim = run([emitterOf({ ...brief, velocity: keyed([0, 0, 0, 0], [1, 0, 8, 0]) })]);
    sim.step(3);

    expect(sim.pool.position[1]).toBeCloseTo(8 * 0.25 * 0.25 + 8 * 0.5 * 0.25, 5);
  });

  it("reads drag at the particle's age", () => {
    const sim = run([
      emitterOf({
        ...brief,
        birthVelocity: flat(10, 0, 0),
        drag: keyed([0, 0, 0, 0], [1, 2, 0, 0]),
      }),
    ]);
    sim.step(3);

    /* Half a unit of drag at a quarter of the life, then one at half of it. */
    expect(sim.pool.velocity[0]).toBeCloseTo(10 * (1 - 0.5 * 0.25) * (1 - 0.25), 5);
  });

  it("reads bindWeight at the particle's age", () => {
    const flight: Motion = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 };
    const sim = run([emitterOf({ ...brief, bindWeight: keyed([0, 1], [1, 0]) })], 0.25, {
      motion: flight,
    });
    sim.step(3);

    /* Born where the origin stood at 25, then carried by three quarters and by half of 25. */
    expect(vec3(sim.pool.bound, 0)).toEqual([0.75 * 25 + 0.5 * 25, 0, 0]);
    expect(sim.place(0)).toEqual([25 + 0.75 * 25 + 0.5 * 25, 0, 0]);
  });

  it("reads a lingering particle's replacement in the value's place", () => {
    const sim = run(
      [
        emitterOf({
          particleLinger: 1,
          lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterDies,
          velocity: flat(0, 10, 0),
          linger: {
            rotation: null,
            scale: null,
            color: null,
            acceleration: null,
            velocity: flat(0, -10, 0),
            drag: null,
          },
        }),
      ],
      0.25,
      { stopAt: 0.5 },
    );
    sim.step(3);

    /* Born at 0.25 and lingering from the stop at 0.5, so both steps that move it read the linger's. */
    expect(vec3(sim.pool.position, 0)).toEqual([0, -5, 0]);
  });
});

describe("appearance", () => {
  const out = { scale: new Float32Array(3), color: new Float32Array(4) };

  function at(pool: Pool, emitter: EmitterModel, now: number) {
    appearance(pool, 0, emitter, now, out);
    return { scale: Array.from(out.scale), color: Array.from(out.color) };
  }

  it("multiplies the birth scale by the lifetime curve at the particle's age", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    pool.birthScale.set([2, 2, 2], 0);
    const emitter = emitterOf({ scale0: keyed([0, 1, 1, 1], [1, 3, 3, 3]) });

    expect(at(pool, emitter, 1).scale).toEqual([4, 4, 4]);
  });

  it("serves the first scale component to every axis under isUniformScale", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    pool.birthScale.set([20, 2, 2], 0);
    const emitter = emitterOf({ scale0: flat(1, 0.5, 0.5), uniformScale: true });

    expect(at(pool, emitter, 1).scale).toEqual([20, 20, 20]);
  });

  it("leaves isUniformScale off a primitive that is neither a quad nor a mesh", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    pool.birthScale.set([20, 2, 2], 0);
    const scaled = { scale0: flat(1, 0.5, 0.5), uniformScale: true };

    for (const quadType of [QUAD_TYPE.ray, QUAD_TYPE.cameraTrail, QUAD_TYPE.beam]) {
      expect(at(pool, emitterOf({ ...scaled, quadType }), 1).scale).toEqual([20, 1, 1]);
    }
    expect(at(pool, emitterOf({ ...scaled, quadType: QUAD_TYPE.mesh }), 1).scale).toEqual([
      20, 20, 20,
    ]);
  });

  it("multiplies the birth colour by the lifetime curve at the particle's age", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    pool.birthColor.set([1, 0.5, 1, 1], 0);
    const emitter = emitterOf({ color: keyed([0, 1, 1, 1, 1], [1, 0, 0, 0, 0]) });

    expect(at(pool, emitter, 1).color).toEqual([0.5, 0.25, 0.5, 0.5]);
  });

  it("multiplies the colour by modulationFactor, channel by channel", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    pool.birthColor.set([1, 0.5, 1, 1], 0);
    const emitter = emitterOf({ color: flat(1, 1, 0.5, 1), modulation: [2, 2, 0.5, 0.25] });

    expect(at(pool, emitter, 1).color).toEqual([2, 1, 0.25, 0.25]);
  });

  it("holds the curve at its end for a particle at or past its lifetime", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    const emitter = emitterOf({ scale0: keyed([0, 1, 1, 1], [1, 3, 3, 3]) });

    expect(at(pool, emitter, 2).scale).toEqual([3, 3, 3]);
    expect(at(pool, emitter, 9).scale).toEqual([3, 3, 3]);
  });

  it("reads the curve at its start for a particle younger than its birth", () => {
    const pool = createPool(1);
    spawn(pool, 0, 4, 2, 0);
    const emitter = emitterOf({ scale0: keyed([0, 1, 1, 1], [1, 3, 3, 3]) });

    expect(at(pool, emitter, 0).scale).toEqual([1, 1, 1]);
  });

  it("leaves the birth value alone on a channel a narrower curve does not carry", () => {
    /* A type-mismatched bin authors a `Vec3` as one float. */
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);
    pool.birthScale.set([2, 3, 4], 0);
    pool.birthColor.set([1, 1, 1, 1], 0);
    at(pool, emitterOf({ scale0: flat(5, 5, 5), color: flat(0.25, 0.25, 0.25, 0.25) }), 1);

    const narrow = emitterOf({ scale0: flat(1), color: flat(0.5) });

    expect(at(pool, narrow, 1)).toEqual({ scale: [2, 3, 4], color: [0.5, 1, 1, 1] });
  });
});

describe("rotation", () => {
  it("stands a particle at its birth rotation", () => {
    const held = run([emitterOf({ rate: flat(4), birthRotation0: flat(0, 0, 1.5) })]);

    held.step();

    expect(held.pool.rotation[2]).toBeCloseTo(1.5, 6);
  });

  it("turns a particle by rotation0's integral over its age, scaled to the second it is authored against", () => {
    /* `rotation0` is authored per 1/60 s, so a curve holding one turns a particle 60
       degrees a second, which is 15 over a quarter second whatever its lifetime. */
    const held = run([
      emitterOf({
        rate: flat(4),
        rotation0: keyed([0, 0, 0, 1], [1, 0, 0, 1]),
        rotationEnabled: true,
      }),
    ]);

    held.step(2);

    expect(held.pool.rotation[2]).toBeCloseTo(ROTATION_RATE / 4, 4);
  });

  it("integrates a rotation0 that climbs, rather than reading it where the particle stands", () => {
    const held = run([
      emitterOf({
        particleLifetime: flat(1),
        rotation0: keyed([0, 0, 0, 0], [1, 0, 0, 2]),
        rotationEnabled: true,
      }),
    ]);

    held.step(3);

    /* Half through its life the curve reads one and its integral a quarter. */
    expect(held.pool.rotation[2]).toBeCloseTo(0.25 * ROTATION_RATE, 1);
  });

  it("adds a rotation0 writing no keys as one fixed amount, whatever the particle's age", () => {
    const held = run([
      emitterOf({ particleLifetime: flat(2), rotation0: flat(0, 0, 1), rotationEnabled: true }),
    ]);

    held.step();
    expect(held.pool.rotation[2]).toBe(ROTATION_RATE * 2);

    held.step(4);
    expect(held.pool.rotation[2]).toBe(ROTATION_RATE * 2);
  });

  it("leaves a particle where it was born while rotation is off", () => {
    const held = run([emitterOf({ rate: flat(4), rotation0: flat(0, 0, 1) })]);

    held.step(4);

    expect(held.pool.rotation[2]).toBe(0);
  });

  it("carries a swapped particle's rotation with it", () => {
    const held = run([emitterOf({ rate: flat(40), birthRotation0: flat(0, 0, 2) })], 0.25, {
      capacity: 8,
    });

    held.step(3);

    for (let at = 0; at < held.pool.count; at += 1) {
      expect(held.pool.rotation[at * 3 + 2]).toBeCloseTo(2, 6);
    }
  });

  it("builds the spin off the age in closed form, the same at any step", () => {
    const emitters = [
      emitterOf({
        birthRotation0: flat(0, 0, 1),
        birthRotationalVelocity0: flat(0, 0, 8),
        birthRotationalAcceleration: flat(0, 0, 16),
      }),
    ];
    const coarse = run(emitters, 0.25);
    coarse.step(1 + 2);
    const fine = run(emitters, 0.05);
    fine.step(1 + 10);

    /* Half a second old: the birth angle, 8 a second, and half of 16 over the age squared. */
    const turned = 1 + 0.5 * (8 + 0.5 * 0.5 * 16);
    expect(coarse.pool.rotation[2]).toBeCloseTo(turned, 5);
    expect(fine.pool.rotation[2]).toBeCloseTo(turned, 5);
  });

  it("turns the basis by postRotateOrientationAxis after the spin", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 10, 0);
    pool.rotation.set([0, 0, 90], 0);
    const basis = new Float32Array(FRAME_SLOTS);
    const axis = new Float32Array(3);
    const axisOf = (emitter: EmitterModel, which: number) => {
      ownBasisInto(pool, 0, emitter, { ...AT_ORIGIN, emitter }, basis);
      axisInto(basis, which, axis, 0);
      return Array.from(axis, rounded);
    };

    /* The roll stands the particle's own +X up, and the yaw after it leaves an up alone. */
    const turned = emitterOf({ postRotate: [0, 90, 0] });
    expect(axisOf(turned, AXIS.x)).toEqual([0, 1, 0]);
    expect(axisOf(turned, AXIS.z)).toEqual([1, 0, 0]);

    expect(axisOf(emitterOf(), AXIS.x)).toEqual([0, 1, 0]);
    expect(axisOf(emitterOf(), AXIS.z)).toEqual([0, 0, 1]);
  });
});

describe("birth draws", () => {
  it("multiplies a probability table's draw into its channel at birth", () => {
    const sim = run([
      emitterOf({
        rate: flat(40),
        birthScale0: { constant: [10, 10, 10], keys: [], tables: [spread(1, 2, 4)] },
      }),
    ]);
    sim.step();

    expect(sim.pool.count).toBeGreaterThan(2);
    const drawn = new Set<number>();
    for (let at = 0; at < sim.pool.count; at += 1) {
      expect(sim.pool.birthScale[at * 3]).toBe(10);
      expect(sim.pool.birthScale[at * 3 + 1]).toBeGreaterThanOrEqual(20);
      expect(sim.pool.birthScale[at * 3 + 1]).toBeLessThanOrEqual(40);
      drawn.add(sim.pool.birthScale[at * 3 + 1]);
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it("draws each channel of a birth vector on its own, so one table on every axis spreads them", () => {
    const sim = run([
      emitterOf({
        rate: flat(40),
        birthScale0: {
          constant: [10, 10, 10],
          keys: [],
          tables: [spread(0, 1, 2), spread(1, 1, 2), spread(2, 1, 2)],
        },
      }),
    ]);
    sim.step();

    expect(sim.pool.count).toBeGreaterThan(2);
    for (let at = 0; at < sim.pool.count; at += 1) {
      const [x, y, z] = vec3(sim.pool.birthScale, at);
      expect(new Set([x, y, z]).size).toBe(3);
      for (const axis of [x, y, z]) {
        expect(axis).toBeGreaterThanOrEqual(10);
        expect(axis).toBeLessThanOrEqual(20);
      }
    }
  });

  it("hands every particle one shared number for the emitter's whole life under ParticlesShareRandomValue", () => {
    const book = { ...plainUvLayer().book, frames: 8, randomStart: true };
    const sim = run([
      emitterOf({
        rate: flat(40),
        sharedRandom: true,
        uv: { ...plainUvLayer(), book },
        birthScale0: { constant: [10, 10, 10], keys: [], tables: [spread(1, 2, 4)] },
      }),
    ]);
    sim.step(2);

    expect(sim.pool.count).toBeGreaterThan(2);
    expect(new Set(column(sim.pool, sim.pool.roll)).size).toBe(1);
    const phases = new Set<number>();
    const scales = new Set<number>();
    for (let at = 0; at < sim.pool.count; at += 1) {
      phases.add(sim.pool.uv[uvAt(at, 0) + UV.phase]);
      scales.add(sim.pool.birthScale[at * 3 + 1]);
    }
    expect(phases.size).toBe(1);

    /* A birth vector's table is no reader of the shared number, and draws for itself. */
    expect(scales.size).toBeGreaterThan(1);
  });

  it("draws particleLifetime on its own, apart from the particle's shared number", () => {
    const sim = run([
      emitterOf({
        rate: flat(40),
        sharedRandom: true,
        particleLifetime: { constant: [1], keys: [], tables: [spread(0, 1, 2)] },
      }),
    ]);
    sim.step();

    expect(sim.pool.count).toBeGreaterThan(2);
    expect(new Set(column(sim.pool, sim.pool.roll)).size).toBe(1);
    const lifetimes = column(sim.pool, sim.pool.lifetime);
    expect(new Set(lifetimes).size).toBeGreaterThan(1);
    for (const lifetime of lifetimes) {
      expect(lifetime).toBeGreaterThanOrEqual(1);
      expect(lifetime).toBeLessThanOrEqual(2);
    }
  });

  it("never expires a particle drawn a negative lifetime", () => {
    const sim = run(
      [
        emitterOf({
          particleLifetime: flat(-1),
          worldAcceleration: flat(0, -10, 0),
          rotation0: flat(0, 0, 1),
          rotationEnabled: true,
        }),
      ],
      1,
    );
    sim.step(50);

    expect(sim.pool.count).toBe(1);
    expect(sim.pool.lifetime[0]).toBe(Infinity);
    expect(age01(sim.pool, 0, 50)).toBe(0);

    /* What is scaled by the lifetime has none to be scaled by, and is left out. */
    expect(sim.pool.rotation[2]).toBe(0);
    expect(sim.place(0)).toEqual([0, 0, 0]);
  });
});

describe("offsetLifetimeScaling", () => {
  /** The lifetime of one particle born ten seconds long at `offset` off its emitter. */
  function lifetimeAt(shape: SpawnShape, over: Partial<EmitterModel>): number {
    const sim = run([emitterOf({ particleLifetime: flat(10), shape, ...over })]);
    sim.step();
    return sim.pool.lifetime[0];
  }

  const off: SpawnShape = { kind: "point", offset: [-2, -3, -1] };

  it("adds the seconds each unit of the shape's offset is worth, signed", () => {
    expect(lifetimeAt(off, { offsetLifetimeScaling: [1, 1, 1] })).toBe(4);
    expect(lifetimeAt(off, { offsetLifetimeScaling: [0, 0, -5] })).toBe(15);
  });

  it.each([
    ["x", OFFSET_SYMMETRY.x, 8],
    ["y", OFFSET_SYMMETRY.y, 10],
    ["z", OFFSET_SYMMETRY.z, 6],
    ["every axis", OFFSET_SYMMETRY.x | OFFSET_SYMMETRY.y | OFFSET_SYMMETRY.z, 16],
  ])("reads %s unsigned where the symmetry mode names it", (_axis, offsetLifeSymmetry, seconds) => {
    expect(lifetimeAt(off, { offsetLifetimeScaling: [1, 1, 1], offsetLifeSymmetry })).toBe(seconds);
  });

  it("never cuts a lifetime below zero", () => {
    const sim = run([
      emitterOf({ particleLifetime: flat(10), shape: off, offsetLifetimeScaling: [10, 0, 0] }),
    ]);
    sim.step();

    /* Nothing to live, so the step that bore it retired it, and the freed row still holds it. */
    expect(sim.pool.count).toBe(0);
    expect(sim.pool.lifetime[0]).toBe(0);
  });

  it("reads the offset as the shape sampled it, before the shape's own turn", () => {
    const turned: SpawnShape = {
      kind: "legacy",
      offset: flat(2, 0, 0),
      translation: flat(0, 0, 0),
      angles: [flat(90)],
      axes: [[0, 0, 1]],
    };
    const sim = run([
      emitterOf({ particleLifetime: flat(10), shape: turned, offsetLifetimeScaling: [1, 0, 0] }),
    ]);
    sim.step();

    expect(vec3(sim.pool.position, 0).map(rounded)).toEqual([0, 2, 0]);
    expect(sim.pool.lifetime[0]).toBe(12);
  });
});

describe("an emission surface", () => {
  /** A sampler that always returns the same point and normal. */
  function fixed(position: Point, normal: Point): EmissionSampler {
    return {
      sample(_time, _rng, out) {
        out.position.set(position);
        out.normal.set(normal);
        return true;
      },
    };
  }

  const surfaceModel = {
    kind: "mesh",
    mesh: null,
    skeleton: null,
    submeshes: [],
    joints: [],
    scale: 1,
    maxJointWeights: 4,
    useNormal: true,
  } as const;

  function born(over: Partial<EmitterModel>, surfaces: SystemSurfaces) {
    const held = run(
      [
        emitterOf({
          rate: flat(4),
          birthVelocity: flat(0, 3, 0),
          birthAcceleration: flat(0, 0, 2),
          ...over,
        }),
      ],
      0.25,
      { surfaces },
    );
    held.step();

    return held.pool;
  }

  it("adds the surface point and points the birth velocity and acceleration along its normal", () => {
    const sampler = fixed([5, 0, 0], [1, 0, 0]);
    const held = born(
      { emissionSurface: surfaceModel },
      new Map([[0, { mesh: null, surface: sampler }]]),
    );

    expect(vec3(held.position, 0)).toEqual([5, 0, 0]);
    expect(vec3(held.velocity, 0)).toEqual([3, 0, 0]);
    expect(vec3(held.birthAcceleration, 0)).toEqual([2, 0, 0]);
  });

  it("adds the surface point and keeps both birth vectors when the surface's normal switch is off", () => {
    const sampler = fixed([5, 0, 0], [1, 0, 0]);
    const held = born(
      { emissionSurface: { ...surfaceModel, useNormal: false } },
      new Map([[0, { mesh: null, surface: sampler }]]),
    );

    expect(vec3(held.position, 0)).toEqual([5, 0, 0]);
    expect(vec3(held.velocity, 0)).toEqual([0, 3, 0]);
    expect(vec3(held.birthAcceleration, 0)).toEqual([0, 0, 2]);
  });

  it("adds the mesh point and the surface point, and uses the surface normal when both give one", () => {
    const held = born(
      {
        emissionMesh: { mesh: { path: "ring.scb", asset: null }, scale: 1, useNormal: true },
        emissionSurface: surfaceModel,
      },
      new Map([[0, { mesh: fixed([0, 7, 0], [0, 0, 1]), surface: fixed([5, 0, 0], [1, 0, 0]) }]]),
    );

    expect(vec3(held.position, 0)).toEqual([5, 7, 0]);
    expect(vec3(held.velocity, 0)).toEqual([3, 0, 0]);
  });

  it("multiplies each sampled point by its own scale", () => {
    const held = born(
      {
        emissionMesh: { mesh: { path: "ring.scb", asset: null }, scale: 2, useNormal: false },
        emissionSurface: { ...surfaceModel, scale: 3, useNormal: false },
      },
      new Map([[0, { mesh: fixed([0, 7, 0], [0, 0, 1]), surface: fixed([5, 0, 0], [1, 0, 0]) }]]),
    );

    expect(vec3(held.position, 0)).toEqual([15, 14, 0]);
  });
});

describe("a simple emitter's legacy block", () => {
  it("stands the one birth size on every axis, scaleBias across and up, off one draw", () => {
    const sim = run([
      simpleOf(
        {
          scaleBias: [2, 0.5],
          birthScale: { constant: [100], keys: [], tables: [spread(0, 1, 2)] },
        },
        { rate: flat(40), birthScale0: flat(1, 1, 1) },
      ),
    ]);
    sim.step();

    expect(sim.pool.count).toBeGreaterThan(2);
    for (let at = 0; at < sim.pool.count; at += 1) {
      const [x, y, z] = vec3(sim.pool.birthScale, at);
      expect(z).toBeGreaterThanOrEqual(100);
      expect(z).toBeLessThanOrEqual(200);
      expect(x).toBeCloseTo(z * 2, 4);
      expect(y).toBeCloseTo(z * 0.5, 4);
    }
  });

  it("reads the legacy scale over the age in scale0's place, on every axis", () => {
    const sim = run([
      simpleOf(
        { scale: keyed([0, 1], [1, 5]) },
        { particleLifetime: flat(1), scale0: flat(7, 7, 7) },
      ),
    ]);
    sim.step(3);

    const drawn = { scale: new Float32Array(3), color: new Float32Array(4) };
    appearance(sim.pool, 0, sim.emitters[0], 0.75, drawn);

    expect(Array.from(drawn.scale).map((v) => Math.round(v * 100) / 100)).toEqual([300, 300, 300]);
  });

  const rolling = {
    birthRotation: flat(30),
    birthRotationalVelocity: flat(40),
    rotation: keyed([0, 0], [1, 80]),
  };

  it("rolls a simple particle about the view axis by its birth angle and its birth rate", () => {
    const sim = run([simpleOf(rolling, { particleLifetime: flat(1) })]);
    sim.step(3);

    /* Born at 0.25, so half a second at 40 a second has turned it 20. */
    expect(vec3(sim.pool.rotation, 0)).toEqual([0, 0, 50]);
  });

  it("reads rotation as a simple particle's whole angle under isRotationEnabled", () => {
    const sim = run([simpleOf(rolling, { particleLifetime: flat(1), rotationEnabled: true })]);
    sim.step(3);

    /* Half through its life, where the curve stands at 40 and the birth values count for nothing. */
    expect(vec3(sim.pool.rotation, 0)).toEqual([0, 0, 40]);
  });

  it("spins a simple particle in whole degrees, wrapped into one turn", () => {
    const turning = { birthRotation: flat(-30.7), rotation: flat(400.5) };
    const sim = run([simpleOf(turning, { particleLifetime: flat(1) })]);
    sim.step();
    expect(spinOf(sim.pool, 0, sim.emitters[0])).toBe(330);

    const keyedOn = run([simpleOf(turning, { particleLifetime: flat(1), rotationEnabled: true })]);
    keyedOn.step();
    expect(spinOf(keyedOn.pool, 0, keyedOn.emitters[0])).toBe(40);

    const complex = run([emitterOf({ birthRotation0: flat(30.7, 0, 0) })]);
    complex.step();
    expect(spinOf(complex.pool, 0, complex.emitters[0])).toBeCloseTo(30.7, 5);
  });

  it("keeps all three of a mesh's rotation channels, and rounds none of them", () => {
    const mesh = run([
      emitterOf({ quadType: QUAD_TYPE.mesh, birthRotation0: flat(-30.7, 45, 90) }),
    ]);
    mesh.step();

    expect(mesh.pool.rotation[0]).toBeCloseTo(-30.7, 5);
    expect(mesh.pool.rotation[1]).toBe(45);
    expect(mesh.pool.rotation[2]).toBe(90);
  });

  it.each([
    ["kFixedLifetimeAfterEmitterDies", LINGER_TYPE.fixedLifetimeAfterEmitterDies],
    ["kFixedLifetimeAfterEmitterStops", LINGER_TYPE.fixedLifetimeAfterEmitterStops],
    ["no linger kind", LINGER_TYPE.none],
  ])("caps a stopped simple emitter's particles as the max kind does, under %s", (_, kind) => {
    const sim = run([simpleOf({}, { particleLinger: 1, lingerType: kind })], 0.25, { stopAt: 1 });
    sim.step(4);

    /* A fixed kind would have given the particle born at 0.25 its age plus the second. */
    expect(sim.pool.lifetime[0]).toBe(1);
    expect(sim.pool.lingerFrom[0]).toBe(1);
  });
});

describe("the UV layers", () => {
  function layer(over: Partial<UvLayer> = {}): UvLayer {
    return { ...plainUvLayer(), ...over };
  }

  it("holds the birth ramp's own numbers as they were drawn, whatever the particle's age", () => {
    const sim = run([
      emitterOf({
        uv: layer({
          birthOffset: flat(0.25, -0.5),
          birthScrollRate: flat(2, 0),
          birthRotateRate: flat(9),
          scrollRate: flat(1, 0),
          rotateRate: flat(3),
        }),
      }),
    ]);
    sim.step(3);

    /* A ramp and an integrated rate are both read off the age at draw time, so nothing
       of either accumulates here. */
    const slot = uvAt(0, 0);
    expect(sim.pool.uv[slot + UV.birthOffsetX]).toBeCloseTo(0.25, 6);
    expect(sim.pool.uv[slot + UV.birthOffsetY]).toBeCloseTo(-0.5, 6);
    expect(sim.pool.uv[slot + UV.birthScrollX]).toBe(2);
    expect(sim.pool.uv[slot + UV.birthScrollY]).toBe(0);
    expect(sim.pool.uv[slot + UV.birthRotate]).toBe(9);
  });

  it("opens a book at no phase, at the rate it plays at", () => {
    const sim = run([
      emitterOf({
        uv: layer({ book: { ...plainUvLayer().book, start: 5, rate: 12, birthRate: flat(2) } }),
      }),
    ]);
    sim.step();

    const slot = uvAt(0, 0);
    expect(sim.pool.uv[slot + UV.phase]).toBe(0);
    expect(sim.pool.uv[slot + UV.frameRate]).toBe(24);
  });

  it("draws a random start phase off the particle's own roll, fractions included", () => {
    const book = { ...plainUvLayer().book, frames: 8, randomStart: true };
    const sim = run([emitterOf({ rate: flat(40), uv: layer({ book }) })], 0.25, { capacity: 32 });
    sim.step(2);

    const phases = new Set<number>();
    for (let at = 0; at < sim.pool.count; at += 1) {
      phases.add(sim.pool.uv[uvAt(at, 0) + UV.phase]);
    }

    expect(sim.pool.count).toBeGreaterThan(4);
    expect(phases.size).toBeGreaterThan(1);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(8);
    }
    expect([...phases].some((phase) => phase !== Math.floor(phase))).toBe(true);
  });

  it("opens both layers on the same phase, because one counter serves both", () => {
    const book = { ...plainUvLayer().book, frames: 8, randomStart: true };
    const sim = run([emitterOf({ rate: flat(40), uv: layer({ book }), multUv: layer({ book }) })]);
    sim.step(2);

    expect(sim.pool.count).toBeGreaterThan(1);
    for (let at = 0; at < sim.pool.count; at += 1) {
      expect(sim.pool.uv[uvAt(at, 1) + UV.phase]).toBe(sim.pool.uv[uvAt(at, 0) + UV.phase]);
    }
  });

  it("keeps the second layer's ramp apart from the first's", () => {
    const sim = run([
      emitterOf({
        uv: layer({ birthOffset: flat(1, 0) }),
        multUv: layer({ birthOffset: flat(0, 2) }),
      }),
    ]);
    sim.step();

    expect(sim.pool.uv[uvAt(0, 0) + UV.birthOffsetX]).toBeCloseTo(1, 6);
    expect(sim.pool.uv[uvAt(0, 1) + UV.birthOffsetY]).toBeCloseTo(2, 6);
  });

  it("touches no second layer for an emitter carrying none", () => {
    const sim = run([emitterOf({ uv: layer({ birthOffset: flat(1, 1) }) })]);
    sim.step(3);

    expect(sim.pool.uv[uvAt(0, 1) + UV.birthOffsetX]).toBe(0);
  });

  it("carries a swapped particle's UV state with it", () => {
    const book = { ...plainUvLayer().book, frames: 8, randomStart: true };
    const sim = run([emitterOf({ rate: flat(40), uv: layer({ book }) })], 0.25, { capacity: 8 });
    sim.step(3);

    for (let at = 0; at < sim.pool.count; at += 1) {
      expect(sim.pool.uv[uvAt(at, 0) + UV.phase]).toBeLessThan(8);
    }
  });
});

describe("the direction stretch", () => {
  const moving = { birthVelocity: flat(0, 100, 0), directionVelocityScale: 0.05 };

  /** The stretch of the one particle of an emitter moving a hundred a second, once it has moved. */
  function stretched(emitter: EmitterModel): number {
    const sim = run([emitter], 1);
    sim.step(2);
    return stretchOf(sim.pool, 0, sim.emitters[0]);
  }

  it("stretches a quad by its speed, held at the least stretch", () => {
    expect(stretched(emitterOf(moving))).toBeCloseTo(5, 5);
    expect(stretched(emitterOf({ ...moving, directionVelocityMinScale: 8 }))).toBe(8);
  });

  it("stretches whether or not the emitter is direction oriented", () => {
    expect(stretched(emitterOf({ ...moving, directionOriented: true }))).toBeCloseTo(5, 5);
    expect(stretched(emitterOf({ ...moving, directionOriented: false }))).toBeCloseTo(5, 5);
  });

  it("reads no stretch at all at a directionVelocityScale of zero", () => {
    const off = { ...moving, directionVelocityScale: 0, directionVelocityMinScale: 8 };

    expect(stretched(emitterOf(off))).toBe(1);
  });

  it("holds a particle that does not travel at the least stretch", () => {
    const still = { ...moving, birthVelocity: flat(0, 0, 0) };

    expect(stretched(emitterOf(still))).toBe(1);
    expect(stretched(emitterOf({ ...still, directionVelocityMinScale: 3 }))).toBe(3);
  });

  it.each([
    ["a camera quad", QUAD_TYPE.cameraQuad],
    ["a camera unit quad", QUAD_TYPE.cameraUnitQuad],
    ["an arbitrary quad", QUAD_TYPE.arbitraryQuad],
  ])("stretches %s", (_, quadType) => {
    expect(stretched(emitterOf({ ...moving, quadType }))).toBeCloseTo(5, 5);
  });

  it.each([
    ["a ray", QUAD_TYPE.ray],
    ["a mesh", QUAD_TYPE.mesh],
    ["an attached mesh", QUAD_TYPE.attachedMesh],
    ["a trail", QUAD_TYPE.cameraTrail],
    ["a beam", QUAD_TYPE.beam],
  ])("leaves %s unstretched", (_, quadType) => {
    expect(stretched(emitterOf({ ...moving, quadType }))).toBe(1);
  });

  it("leaves a simple emitter's quad unstretched", () => {
    expect(stretched(simpleOf({}, moving))).toBe(1);
  });

  it("counts the travel a bound particle is carried by as its speed", () => {
    const flight: Motion = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 };
    const sim = run([emitterOf({ bindWeight: flat(1), directionVelocityScale: 0.05 })], 0.25, {
      motion: flight,
    });
    sim.step(2);

    expect(stretchOf(sim.pool, 0, sim.emitters[0])).toBeCloseTo(5, 5);
  });
});

describe("particle linger", () => {
  /** One particle, born on the first quarter-second step, that would live a long time. */
  const lasting = { particleLifetime: flat(100), particleLinger: 1 };

  it("holds a max-lifetime linger until the system stops, then caps every particle", () => {
    const sim = run([emitterOf(lasting)], 0.25, { stopAt: 1 });
    sim.step(3);
    expect(sim.pool.lifetime[0]).toBe(100);

    sim.step();
    expect(sim.pool.count).toBe(1);
    expect(sim.pool.lifetime[0]).toBe(1);
    expect(sim.pool.lingerFrom[0]).toBe(1);

    sim.step();
    expect(sim.pool.count).toBe(0);
  });

  it("gives a fixed-after-stops linger its seconds from the emitter's own end of emission", () => {
    const sim = run([
      emitterOf({
        ...lasting,
        lifetime: 0.5,
        lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      }),
    ]);
    sim.step(3);

    /* Finished at 0.75, on a particle born at 0.25, so it now lives to 1.75. */
    expect(sim.pool.lifetime[0]).toBeCloseTo(1.5, 6);
    expect(sim.state[0].finishedAt).toBe(0.75);

    sim.step(3);
    expect(sim.pool.count).toBe(1);
    sim.step();
    expect(sim.pool.count).toBe(0);
  });

  it("gives a fixed-after-stops burst its seconds from the step after it, no stop asked", () => {
    const sim = run([
      emitterOf({
        ...lasting,
        rate: flat(3),
        singleParticle: true,
        lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      }),
    ]);
    sim.step();
    expect(sim.pool.count).toBe(3);
    expect(sim.state[0].finishedAt).toBeNull();
    expect(sim.pool.lifetime[0]).toBe(100);

    /* Each lives its own age plus the second, and the burst was spread over its step. */
    sim.step();
    expect(sim.state[0].finishedAt).toBe(0.5);
    for (let at = 0; at < 3; at += 1) {
      expect(sim.pool.lifetime[at]).toBeCloseTo(0.5 - sim.pool.birthTime[at] + 1, 6);
      expect(sim.pool.lingerFrom[at]).toBe(0.5);
    }
    expect(sim.pool.lifetime[2]).toBe(1.25);
  });

  it("leaves a burst that overrides materials running to its own end", () => {
    const sim = run([
      emitterOf({
        ...lasting,
        rate: flat(3),
        singleParticle: true,
        overridesMaterials: true,
        lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      }),
    ]);
    sim.step(8);

    expect(sim.state[0].finishedAt).toBeNull();
    expect(sim.pool.lifetime[0]).toBe(100);
  });

  it("leaves a fixed-after-dies linger waiting on a stop the emission's end is not", () => {
    const sim = run([
      emitterOf({
        ...lasting,
        lifetime: 0.5,
        lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterDies,
      }),
    ]);
    sim.step(8);

    expect(sim.pool.lifetime[0]).toBe(100);
    expect(sim.state[0].finishedAt).toBeNull();
  });

  it("changes no lifetime under a linger kind past the three, stopped or ended", () => {
    const sim = run(
      [emitterOf({ ...lasting, lifetime: 0.5, lingerType: LINGER_TYPE.none })],
      0.25,
      {
        stopAt: 1,
      },
    );
    sim.step(8);

    expect(sim.pool.count).toBe(1);
    expect(sim.pool.lifetime[0]).toBe(100);
    expect(sim.pool.lingerFrom[0]).toBe(NOT_LINGERING);
    expect(sim.state[0].finishedAt).toBeNull();
  });

  it("waits a stop out until the system's age passes emitterLinger", () => {
    const sim = run([emitterOf({ ...lasting, emitterLinger: 2 })], 0.25, { stopAt: 1 });
    sim.step(8);
    expect(sim.state[0].finishedAt).toBeNull();
    expect(sim.pool.lifetime[0]).toBe(100);

    sim.step();
    expect(sim.state[0].finishedAt).toBe(2.25);
    expect(sim.pool.lifetime[0]).toBe(1);
  });

  it("grants a stop issued past emitterLinger no wait, the age being the system's own", () => {
    const sim = run([emitterOf({ ...lasting, emitterLinger: 0.5 })], 0.25, { stopAt: 1 });
    sim.step(4);

    expect(sim.state[0].finishedAt).toBe(1);
  });

  it("holds a stopped fixed-after-stops emitter to emitterLinger rather than its lifetime", () => {
    const sim = run(
      [
        emitterOf({
          ...lasting,
          lifetime: 5,
          emitterLinger: 2,
          lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
        }),
      ],
      0.25,
      { stopAt: 1 },
    );
    sim.step(8);
    expect(sim.state[0].finishedAt).toBeNull();

    sim.step();
    expect(sim.state[0].finishedAt).toBe(2.25);
  });

  it("stops an emitter of no emitterLinger at the stop, and drops what has no linger at once", () => {
    const sim = run([emitterOf({ rate: flat(40) })], 0.25, { stopAt: 0.5 });
    sim.step();
    expect(sim.pool.count).toBe(10);

    sim.step();
    expect(sim.pool.count).toBe(0);
  });

  it("keeps a stopped emitter spawning until the system's age passes emitterLinger", () => {
    const sim = run([emitterOf({ rate: flat(40), emitterLinger: 1, particleLinger: 5 })], 0.25, {
      stopAt: 0.5,
    });
    sim.step(2);
    expect(sim.pool.count).toBe(20);

    sim.step(2);
    expect(sim.pool.count).toBe(40);

    sim.step(2);
    expect(sim.pool.count).toBe(40);
    expect(Math.max(...column(sim.pool, sim.pool.birthTime))).toBe(1);
  });

  it("swaps in the linger colour and scale against the linger's own progress", () => {
    const sim = run(
      [
        emitterOf({
          ...lasting,
          lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterDies,
          color: flat(1, 0, 0, 1),
          linger: {
            rotation: null,
            scale: keyed([0, 4, 4, 4], [1, 2, 2, 2]),
            color: keyed([0, 1, 1, 1, 1], [1, 0, 0, 0, 0]),
            acceleration: null,
            velocity: null,
            drag: null,
          },
        }),
      ],
      0.25,
      { stopAt: 0.5 },
    );
    sim.step(2);

    const drawn = { scale: new Float32Array(3), color: new Float32Array(4) };
    appearance(sim.pool, 0, sim.emitters[0], 1, drawn);

    /* Stopped at 0.5 with a second of linger, so at 1.0 the linger is half through. */
    expect(drawn.color[0]).toBeCloseTo(0.5, 6);
    expect(drawn.scale[0]).toBeCloseTo(3, 6);
  });

  it("reads the emitter's own velocity as a drift, never into the particle's", () => {
    const sim = run([emitterOf({ velocity: flat(0, 10, 0) })]);
    sim.step(3);

    expect(vec3(sim.pool.position, 0)).toEqual([0, 5, 0]);
    expect(vec3(sim.pool.velocity, 0)).toEqual([0, 0, 0]);
  });
});

describe("the spawn shape", () => {
  it("births a particle on a sphere's surface and sends its velocity outward", () => {
    const sim = run([
      emitterOf({
        rate: flat(40),
        shape: { kind: "sphere", radius: 50, volume: false },
        birthVelocity: flat(100, 0, 0),
      }),
    ]);
    sim.step();

    expect(sim.pool.count).toBeGreaterThan(1);
    for (let at = 0; at < sim.pool.count; at += 1) {
      const position = vec3(sim.pool.position, at);
      const velocity = vec3(sim.pool.velocity, at);
      expect(Math.hypot(...position)).toBeCloseTo(50, 3);
      expect(Math.hypot(...velocity)).toBeCloseTo(100, 3);
      const dot = position[0] * velocity[0] + position[1] * velocity[1] + position[2] * velocity[2];
      expect(dot / (50 * 100)).toBeCloseTo(1, 4);
    }
  });

  const quarterTurn: SpawnShape = {
    kind: "legacy",
    offset: flat(0, 0, 0),
    translation: flat(0, 0, 0),
    angles: [flat(90)],
    axes: [[0, 0, 1]],
  };

  it("turns a legacy shape's birth velocity and leaves the particle where it was born", () => {
    const sim = run([emitterOf({ shape: quarterTurn, birthVelocity: flat(100, 0, 0) })]);
    sim.step();

    const velocity = vec3(sim.pool.velocity, 0);
    expect(velocity[0]).toBeCloseTo(0, 4);
    expect(velocity[1]).toBeCloseTo(100, 4);
    expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
  });

  it("turns the birth acceleration as it turns the birth velocity", () => {
    const sim = run([emitterOf({ shape: quarterTurn, birthAcceleration: flat(100, 0, 0) })]);
    sim.step();

    expect(vec3(sim.pool.birthAcceleration, 0).map(rounded)).toEqual([0, 100, 0]);
  });

  it("stacks a point shape's offset on the emitter's own", () => {
    const sim = run([
      emitterOf({
        emitterPosition: flat(0, 100, 0),
        shape: { kind: "point", offset: [0, 10, 0] },
      }),
    ]);
    sim.step();

    expect(vec3(sim.pool.position, 0)).toEqual([0, 110, 0]);
  });
});

describe("worldAcceleration", () => {
  /** A pool holding one particle whose matrix stands at `place`, born at zero and living `lifetime` seconds. */
  function placed(place: readonly number[], lifetime: number): Pool {
    const pool = createPool(4);
    const at = spawn(pool, 0, 0, lifetime, 0);
    pool.placed.set(place, (at ?? 0) * 3);
    return pool;
  }

  /** Where the pool's first particle draws for `emitter`, at a frame standing at the origin. */
  function drawn(pool: Pool, emitter: EmitterModel, over: Partial<DrawFrame> = {}): number[] {
    const out = drawnPlace();
    drawnPlaceInto(pool, 0, { ...AT_ORIGIN, emitter, ...over }, out);
    return Array.from(out.place);
  }

  it("ramps a curve's offset from zero to half the acceleration times the age squared", () => {
    const pool = placed([1, 2, 3], 2);
    const emitter = emitterOf({ worldAcceleration: keyed([0, 0, -10, 0], [1, 0, -10, 0]) });

    expect(drawn(pool, emitter)).toEqual([1, 2, 3]);
    expect(drawn(pool, emitter, { now: 1 })[1]).toBeCloseTo(2 - 5, 2);
    expect(drawn(pool, emitter, { now: 2 })[1]).toBeCloseTo(2 - 20, 4);
  });

  it("adds a worldAcceleration writing no keys as one fixed offset, the lifetime squared times it", () => {
    const pool = placed([1, 2, 3], 2);
    const emitter = emitterOf({ worldAcceleration: flat(0, -10, 0) });

    expect(drawn(pool, emitter)).toEqual([1, 2 - 40, 3]);
    expect(drawn(pool, emitter, { now: 1 })).toEqual([1, 2 - 40, 3]);
  });

  it("leaves the drawn position where the integrator put it for an emitter authoring none", () => {
    expect(drawn(placed([1, 2, 3], 2), emitterOf())).toEqual([1, 2, 3]);
  });

  it("integrates the curve over the particle's own age, whatever its emitter's phase", () => {
    const emitter = emitterOf({ worldAcceleration: keyed([0, 0, 0, 0], [1, 0, -8, 0]) });
    const pool = placed([0, 0, 0], 1);

    /* An acceleration climbing to 8 over the life has moved the particle 8 / 6 by its end. */
    expect(drawn(pool, emitter, { now: 1 })[1]).toBeCloseTo(-8 / 6, 4);
    expect(drawn(pool, emitter, { now: 1, phase: 0.5 })[1]).toBeCloseTo(-8 / 6, 4);
    expect(drawn(pool, emitter, { now: 0.5 })[1]).toBeCloseTo(-8 / 6 / 8, 3);
  });

  it("moves the offset in one frame when the linger rewrites the lifetime", () => {
    const emitter = emitterOf({
      particleLifetime: flat(100),
      particleLinger: 1,
      worldAcceleration: flat(0, -10, 0),
      lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      lifetime: 0.5,
    });
    const sim = run([emitter]);

    sim.step(2);
    const before = drawn(sim.pool, emitter, { now: 0.5 })[1];

    sim.step();

    /* Born at 0.25 and finished at 0.75, so the lifetime the offset is scaled by falls
       from 100 to 1.5. */
    expect(before).toBe(-10 * 100 * 100);
    expect(drawn(sim.pool, emitter, { now: 0.75 })[1]).toBe(-10 * 1.5 * 1.5);
  });

  it("does not move the position the integrator holds", () => {
    const sim = run([emitterOf({ worldAcceleration: flat(0, -10, 0) })], 1);
    sim.step(3);

    expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
    expect(vec3(sim.pool.placed, 0)).toEqual([0, 0, 0]);
  });
});

describe("birthOrbitalVelocity", () => {
  /** A quarter turn about `+Y` each second, on a particle born two units along `+X`. */
  const orbiting = {
    birthOrbitalVelocity: flat(0, Math.PI / 2, 0),
    shape: { kind: "point", offset: [2, 0, 0] },
  } satisfies Partial<EmitterModel>;

  it("turns the particle's place about the frame's origin, radians a second", () => {
    const sim = run([emitterOf(orbiting)], 1);
    sim.step();
    expect(sim.place(0)).toEqual([2, 0, 0]);

    sim.step();
    expect(sim.place(0)).toEqual([0, 0, -2]);
    expect(vec3(sim.pool.placed, 0).map(rounded)).toEqual([0, 0, -2]);
    expect(vec3(sim.pool.position, 0)).toEqual([2, 0, 0]);
  });

  it("orbits about the rig's origin rather than the world's", () => {
    const parked: Motion = { kind: "path", from: [10, 0, 0], to: [10, 0, 0], speed: 0 };
    const sim = run([emitterOf(orbiting)], 1, { motion: parked });
    sim.step(2);

    expect(sim.place(0)).toEqual([10, 0, -2]);
  });

  it("orbits about the origin of the emitter's own frame, not about EmitterPosition", () => {
    const sim = run(
      [
        emitterOf({
          birthOrbitalVelocity: flat(0, Math.PI / 2, 0),
          emitterPosition: flat(2, 0, 0),
          translationOverride: [10, 0, 0],
        }),
      ],
      1,
    );
    sim.step(2);

    /* A particle born on EmitterPosition still swings round the frame's origin, which
       translationOverride moves and the orbit does not turn. */
    expect(sim.place(0)).toEqual([10, 0, -2]);
  });

  it("stands a particle still where its emitter authors no orbit", () => {
    const sim = run([emitterOf({ shape: orbiting.shape })], 1);
    sim.step(2);

    expect(orbitInto(sim.pool, 0, 1, new Float32Array(FRAME_SLOTS))).toBe(false);
    expect(sim.place(0)).toEqual([2, 0, 0]);
  });

  it("draws the rate at birth", () => {
    const sim = run([emitterOf({ birthOrbitalVelocity: flat(0, 2, 0) })], 1);
    sim.step();

    expect(vec3(sim.pool.orbital, 0)).toEqual([0, 2, 0]);
  });
});

describe("the definition's transform", () => {
  /** A transform of no turn that moves seven units along `+Z`. */
  const SHIFTED = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 7, 1];

  /** A transform that sends `+X` to `-Z` and `+Z` to `+X`, the file's rows being its axes. */
  const TURNED = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];

  it("moves a particle's matrix inside the frame it was born in, so the frame turns it", () => {
    const sim = run([emitterOf()], 0.25, { facing: [1, 0, 0], transform: SHIFTED });
    sim.step();

    expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
    expect(vec3(sim.pool.placed, 0)).toEqual([0, 0, 7]);
    expect(vec3(sim.pool.anchor, 0)).toEqual([0, 0, 0]);
    expect(sim.place(0)).toEqual([7, 0, 0]);
  });

  it("turns a particle's matrix by its basis, and leaves the integrator's position alone", () => {
    const sim = run([emitterOf({ shape: { kind: "point", offset: [2, 0, 0] } })], 0.25, {
      transform: TURNED,
    });
    sim.step();

    expect(vec3(sim.pool.position, 0)).toEqual([2, 0, 0]);
    expect(vec3(sim.pool.placed, 0).map(rounded)).toEqual([0, 0, -2]);
  });

  it("reaches no particle of a system on the HUD layer", () => {
    const sim = run([emitterOf({ shape: { kind: "point", offset: [2, 0, 0] } })], 0.25, {
      transform: SHIFTED,
      hudLayer: true,
    });
    sim.step();

    expect(vec3(sim.pool.placed, 0)).toEqual([2, 0, 0]);
  });
});

describe("particleIsLocalOrientation", () => {
  /** A pool holding one particle born under `frame`. */
  function born(frame: readonly number[]): Pool {
    const pool = createPool(4);
    spawn(pool, 0, 0, 10, 0);
    pool.frame.set(frame, 0);
    return pool;
  }

  const BIRTH = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const NOW = yawInto([1, 0, 0], new Float32Array(FRAME_SLOTS));

  it("stands a particle of its own on the system's orientation as it is now", () => {
    const out = new Float32Array(FRAME_SLOTS);

    standingFrameInto(
      born(BIRTH),
      0,
      emitterOf({ particleLocalOrientation: true }),
      { ...AT_ORIGIN, orientation: NOW },
      out,
    );

    expect(Array.from(out)).toEqual(Array.from(NOW));
  });

  it("keeps every other particle on the frame it was born in", () => {
    const out = new Float32Array(FRAME_SLOTS);

    standingFrameInto(born(BIRTH), 0, emitterOf(), { ...AT_ORIGIN, orientation: NOW }, out);

    expect(Array.from(out)).toEqual(BIRTH);
  });

  it("turns such a particle's matrix by the system's facing once, and its draw by no frame", () => {
    const ahead = { shape: { kind: "point", offset: [0, 0, 2] } } satisfies Partial<EmitterModel>;
    const own = run([emitterOf({ ...ahead, particleLocalOrientation: true })], 0.25, {
      facing: [1, 0, 0],
    });
    const framed = run([emitterOf(ahead)], 0.25, { facing: [1, 0, 0] });
    own.step();
    framed.step();

    expect(vec3(own.pool.placed, 0).map(rounded)).toEqual([2, 0, 0]);
    expect(vec3(framed.pool.placed, 0)).toEqual([0, 0, 2]);
    expect(own.place(0)).toEqual([2, 0, 0]);
    expect(framed.place(0)).toEqual([2, 0, 0]);
  });
});

describe("the travel one particle records", () => {
  it("carries the emitter's drift where the stored velocity does not", () => {
    const sim = run([emitterOf({ velocity: flat(0, 0, 6) })], 0.5);
    sim.step(2);

    expect(vec3(sim.pool.velocity, 0)).toEqual([0, 0, 0]);
    expect(vec3(sim.pool.travel, 0)).toEqual([0, 0, 6]);
  });

  it("stands at zero for a particle born this step", () => {
    const sim = run([emitterOf({ birthVelocity: flat(0, 9, 0) })], 0.5);
    sim.step();

    expect(vec3(sim.pool.travel, 0)).toEqual([0, 0, 0]);
  });
});

describe("age01", () => {
  it("stands a particle at the end of its life once its lifetime is cut to zero", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 0, 0);

    expect(age01(pool, 0, 0)).toBe(1);
  });

  it("clamps a particle drawn past its own death", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, 2, 0);

    expect(age01(pool, 0, 1)).toBe(0.5);
    expect(age01(pool, 0, 5)).toBe(1);
  });

  it("holds a particle that never expires at the start of its life", () => {
    const pool = createPool(1);
    spawn(pool, 0, 0, Infinity, 0);

    expect(age01(pool, 0, 1000)).toBe(0);
  });
});

describe("erosionDrive", () => {
  const erosion: ErosionModel = {
    map: null,
    addressMode: ADDRESS_MODE.clamp,
    mixer: flat(0, 0, 0, 1),
    drive: keyed([0, 0], [1, 1]),
    lingerDrive: null,
    driveSource: 0,
    featherIn: 0.1,
    featherOut: 0.1,
    sliceWidth: 1.5,
  };

  it("reads the drive against the particle's age, and one for an emitter eroding nothing", () => {
    const sim = run([emitterOf({ particleLifetime: flat(1), erosion })]);
    sim.step(2);

    expect(erosionDrive(sim.pool, 0, sim.emitters[0], 0.5)).toBeCloseTo(0.25, 5);
    expect(erosionDrive(sim.pool, 0, emitterOf(), 0.5)).toBe(1);
  });

  it("switches to the linger drive once the emitter has finished", () => {
    const lingering = emitterOf({
      particleLifetime: flat(1),
      erosion: { ...erosion, lingerDrive: flat(0.75) },
      lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterDies,
      particleLinger: 5,
    });
    const sim = run([lingering], 0.25, { stopAt: 0.5 });
    sim.step(1);
    expect(erosionDrive(sim.pool, 0, lingering, 0.25)).toBeCloseTo(0, 5);

    sim.step(2);
    expect(erosionDrive(sim.pool, 0, lingering, 0.75)).toBe(0.75);
  });
});

describe("a trail's births", () => {
  const trail: TrailModel = {
    mode: TRAIL_MODE.wake,
    smoothing: TRAIL_SMOOTHING.off,
    maxAddedPerFrame: 0,
    tiling: flat(0, 0, 0),
    cutoff: 0,
  };

  it("caps a step's spawns at mMaxAddedPerFrame", () => {
    const sim = run([emitterOf({ rate: flat(40), trail: { ...trail, maxAddedPerFrame: 3 } })]);
    sim.step();

    expect(sim.pool.count).toBe(3);
  });

  it("stamps each particle with how far the spawn point had travelled at its birth", () => {
    const flight: Motion = { kind: "path", from: [0, 0, 0], to: [100, 0, 0], speed: 100 };
    const sim = run([emitterOf({ rate: flat(4), trail })], 0.25, { motion: flight });
    sim.step(3);

    expect(sim.pool.count).toBe(3);
    expect(Array.from(sim.pool.odometer.subarray(0, 3))).toEqual([0, 25, 50]);
  });

  it("draws mBirthTilingSize at birth and keeps two of its three", () => {
    const sim = run([emitterOf({ trail: { ...trail, tiling: flat(500, 2, 9) } })]);
    sim.step();

    expect(Array.from(sim.pool.tiling.subarray(0, 2))).toEqual([500, 2]);
  });
});

describe("EmitterPosition", () => {
  const climbing = keyed([0, 0, 0, 0], [1, 0, 100, 0]);

  it("births a particle at the emitter's offset from the origin, in either space", () => {
    const sim = run([
      emitterOf({ emitterPosition: flat(5, 0, 0) }),
      emitterOf({ index: 1, emitterPosition: flat(0, 7, 0), emitterSpace: true }),
    ]);
    sim.step();

    expect(sim.place(0)).toEqual([5, 0, 0]);
    expect(sim.place(1)).toEqual([0, 7, 0]);
  });

  it("keeps the offset out of the position an emitter-space particle is integrated at", () => {
    const sim = run([
      emitterOf({ emitterPosition: flat(5, 0, 0) }),
      emitterOf({ index: 1, emitterPosition: flat(0, 7, 0), emitterSpace: true }),
    ]);
    sim.step();

    expect(vec3(sim.pool.position, 0)).toEqual([5, 0, 0]);
    expect(vec3(sim.pool.position, 1)).toEqual([0, 0, 0]);
    expect(vec3(sim.pool.placed, 1)).toEqual([0, 7, 0]);
  });

  it("leaves a system-space particle where the offset stood at its birth", () => {
    const sim = run([emitterOf({ lifetime: 1, emitterPosition: climbing })], 0.25);
    sim.step(3);

    expect(sim.place(0)).toEqual([0, 25, 0]);
  });

  it("carries an emitter-space particle with the offset as it moves", () => {
    const sim = run(
      [emitterOf({ lifetime: 1, emitterPosition: climbing, emitterSpace: true })],
      0.25,
    );
    sim.step(3);

    expect(sim.place(0)).toEqual([0, 75, 0]);
    expect(vec3(sim.pool.travel, 0)).toEqual([0, 100, 0]);
  });

  it("moves an emitter-space particle by nothing under a constant offset", () => {
    const sim = run([emitterOf({ emitterPosition: flat(3, 3, 3), emitterSpace: true })]);
    sim.step(4);

    expect(sim.place(0)).toEqual([3, 3, 3]);
    expect(vec3(sim.pool.travel, 0)).toEqual([0, 0, 0]);
  });
});

describe("the rig's origin", () => {
  /* A hundred units a second along X, so a quarter-second step travels twenty-five. */
  const FLIGHT: Motion = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 };

  /** Where each live particle draws on the axis the flight travels, in order. */
  function alongFlight(sim: Run): number[] {
    const held: number[] = [];
    for (let at = 0; at < sim.pool.count; at += 1) held.push(sim.place(at)[0]);
    return held.sort((first, second) => first - second);
  }

  it("births a particle where the origin stands rather than at the world origin", () => {
    const sim = run([emitterOf({ rate: flat(4) })], 0.25, { motion: FLIGHT });
    sim.step();

    expect(sim.pool.count).toBe(1);
    expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
    expect(vec3(sim.pool.anchor, 0)).toEqual([25, 0, 0]);
    expect(sim.place(0)).toEqual([25, 0, 0]);
  });

  it("leaves a world-anchored particle behind, which is what lays a trail", () => {
    const sim = run([emitterOf({ rate: flat(4), bindWeight: flat(0) })], 0.25, { motion: FLIGHT });
    sim.step(3);

    expect(alongFlight(sim)).toEqual([25, 50, 75]);
  });

  it("carries a fully bound particle with the origin", () => {
    const sim = run([emitterOf({ rate: flat(4), bindWeight: flat(1) })], 0.25, { motion: FLIGHT });
    sim.step(3);

    expect(alongFlight(sim)).toEqual([75, 75, 75]);
  });

  it("carries half the travel at half the weight", () => {
    const sim = run([emitterOf({ rate: flat(4), bindWeight: flat(0.5) })], 0.25, {
      motion: FLIGHT,
    });
    sim.step(3);

    expect(alongFlight(sim)).toEqual([50, 62.5, 75]);
  });

  it("moves nothing under a still rig, whatever the weight says", () => {
    const sim = run([emitterOf({ rate: flat(4), bindWeight: flat(1) })], 0.25);
    sim.step(3);

    for (let at = 0; at < sim.pool.count; at += 1) {
      expect(vec3(sim.pool.bound, at)).toEqual([0, 0, 0]);
      expect(sim.place(at)).toEqual([0, 0, 0]);
    }
  });
});

describe("force fields", () => {
  const NONE: FieldsModel = { acceleration: [], attraction: [], noise: [], drag: [], orbital: [] };

  /** One particle, born still at the origin on the first step. */
  function lone(fields: FieldsModel): EmitterModel {
    return emitterOf({ rate: flat(1), singleParticle: true, fields });
  }

  it("keeps a field's pull in the particle's velocity, so an attraction speeds it up", () => {
    const sim = run([
      lone({
        ...NONE,
        attraction: [{ position: flat(100, 0, 0), acceleration: flat(10), radius: flat(1000) }],
      }),
    ]);
    sim.step(3);

    expect(sim.pool.velocity[0]).toBeCloseTo(5, 5);
    expect(sim.pool.position[0]).toBeCloseTo(1.875, 5);
  });

  it("stands a field's position in the emitter's own frame, so what turns the emitter turns its pull", () => {
    const sim = run([
      emitterOf({
        rate: flat(1),
        singleParticle: true,
        rotationOverride: [0, 90, 0],
        fields: {
          ...NONE,
          attraction: [{ position: flat(100, 0, 0), acceleration: flat(10), radius: flat(1000) }],
        },
      }),
    ]);
    sim.step(2);

    expect(sim.pool.velocity[0]).toBeCloseTo(2.5, 4);
    expect(Math.abs(sim.pool.velocity[2])).toBeLessThan(1e-4);
    expect(vec3(sim.pool.travel, 0).map(rounded)).toEqual([0, 0, -2.5]);
  });

  it("shows no field EmitterPosition under IsEmitterSpace, so a particle riding it stands on the field's centre", () => {
    const pulled = (emitterSpace: boolean) =>
      emitterOf({
        rate: flat(1),
        singleParticle: true,
        emitterPosition: flat(0, 0, 50),
        emitterSpace,
        fields: {
          ...NONE,
          attraction: [{ position: flat(0, 0, 0), acceleration: flat(10), radius: flat(1000) }],
        },
      });
    const riding = run([pulled(true)]);
    const standing = run([pulled(false)]);
    riding.step(2);
    standing.step(2);

    expect(Math.hypot(...vec3(riding.pool.velocity, 0))).toBeLessThan(1e-4);
    expect(standing.pool.velocity[2]).toBeCloseTo(-2.5, 4);
  });

  const NOISE = {
    position: flat(0, 0, 0),
    axisFraction: [1, 1, 1] as [number, number, number],
    frequency: flat(10),
    radius: flat(1000),
    velocityDelta: flat(20),
  };

  it("kicks a particle along the same path on every replay of the run", () => {
    const fields: FieldsModel = { ...NONE, noise: [NOISE] };
    const first = run([lone(fields)]);
    const again = run([lone(fields)]);
    first.step(8);
    again.step(8);

    expect(vec3(first.pool.position, 0)).toEqual(vec3(again.pool.position, 0));
    expect(Math.hypot(...vec3(first.pool.position, 0))).toBeGreaterThan(0);
  });

  it("kicks a newborn on its birth step, which moves it nowhere", () => {
    const sim = run([lone({ ...NONE, noise: [NOISE] })]);
    sim.step();

    expect(Math.hypot(...vec3(sim.pool.velocity, 0))).toBeCloseTo(20, 4);
    expect(vec3(sim.pool.position, 0)).toEqual([0, 0, 0]);
  });

  it("fires a noise field of no frequency once, on the particles born with its first update", () => {
    const sim = run([
      emitterOf({ rate: flat(4), fields: { ...NONE, noise: [{ ...NOISE, frequency: flat(0) }] } }),
    ]);
    sim.step(3);

    expect(sim.pool.count).toBe(3);
    expect(Math.hypot(...vec3(sim.pool.velocity, 0))).toBeCloseTo(20, 4);
    expect(Math.hypot(...vec3(sim.pool.velocity, 1))).toBe(0);
    expect(Math.hypot(...vec3(sim.pool.velocity, 2))).toBe(0);
  });
});
