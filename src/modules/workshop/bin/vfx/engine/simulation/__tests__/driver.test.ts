import { describe, expect, it } from "vitest";

import { createPreviewPlayback } from "../../../../../objectsBrowser/utils/previewPlayback";
import {
  BLEND_MODE,
  COLOR_LOOKUP,
  DRAG_MOTION,
  LINGER_TYPE,
  QUAD_TYPE,
  STENCIL_MODE,
  UV_MODE,
} from "../../model/enums";
import {
  type ChildSetModel,
  type EmitterModel,
  plainUvLayer,
  POINT_SHAPE,
  type SystemModel,
} from "../../model/model";
import type { Joints } from "../../model/rig";
import { multiplyInto, turnInto } from "../../utils/basis";
import { createDriver, type Driver } from "../driver";
import { drawnPlace, drawnPlaceInto, frameOf } from "../particleRead";
import { FRAME_SLOTS, type Pool } from "../pool";

function constant(...values: number[]) {
  return { constant: values, keys: [], tables: [] };
}

function emitter(over: Partial<EmitterModel> = {}): EmitterModel {
  return {
    emissionSurface: null,
    customMaterial: null,
    index: 0,
    simple: false,
    listIndex: 0,
    name: "smoke",
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
    rate: constant(20),
    particleLifetime: constant(1),
    lifetime: null,
    timeBeforeFirstEmission: 0,
    period: null,
    singleParticle: false,
    sharedRandom: false,
    birthVelocity: constant(0, 100, 0),
    acceleration: constant(0, -50, 0),
    drag: constant(0, 0, 0),
    birthDrag: constant(0, 0, 0),
    velocity: constant(0, 0, 0),
    worldAcceleration: constant(0, 0, 0),
    birthOrbitalVelocity: constant(0, 0, 0),
    bindWeight: constant(0),
    emitterPosition: constant(0, 0, 0),
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
    rotation0: constant(0, 0, 0),
    birthRotation0: constant(0, 0, 0),
    birthRotationalVelocity0: constant(0, 0, 0),
    birthRotationalAcceleration: constant(0, 0, 0),
    legacySimple: null,
    pivotUp: false,
    rotationEnabled: false,
    directionOriented: false,
    directionVelocityScale: 0,
    directionVelocityMinScale: 1,
    scale0: constant(1, 1, 1),
    birthScale0: constant(10, 10, 10),
    color: constant(1, 1, 1, 1),
    birthColor: constant(1, 1, 1, 1),
    texture: null,
    blendMode: BLEND_MODE.add,
    pass: 0,
    miscRenderFlags: 0,
    groundLayer: false,
    alphaRef: 0,
    quadType: QUAD_TYPE.cameraQuad,
    stencilMode: STENCIL_MODE.disabled,
    stencilRef: 0,
    stencilReferenceId: null,
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

function system(...emitters: EmitterModel[]): SystemModel {
  return {
    entry: "0x1",
    name: null,
    emitters,
    transform: null,
    hudLayer: false,
    dragMotion: DRAG_MOTION.stepped,
    buildUpTime: 0,
  };
}

/**
 * A pool as a value two runs are compared by, which is the live range and nothing past it.
 *
 * A position is in the frame its particle was born in, so the anchor and the matrix
 * translation are what say where in the world it stands.
 */
function snapshot(pool: Pool) {
  return {
    count: pool.count,
    position: [...pool.position.subarray(0, pool.count * 3)],
    velocity: [...pool.velocity.subarray(0, pool.count * 3)],
    anchor: [...pool.anchor.subarray(0, pool.count * 3)],
    placed: [...pool.placed.subarray(0, pool.count * 3)],
    birthTime: [...pool.birthTime.subarray(0, pool.count)],
  };
}

/** Where the particle at `at` of `driver`'s own pool draws, in the world, as `model` has it. */
function placeOf(driver: Driver, model: SystemModel, at: number): number[] {
  const out = drawnPlace();
  const own = model.emitters[driver.pool.emitter[at]];
  drawnPlaceInto(driver.pool, at, frameOf(driver, own), out);
  return [...out.place];
}

/** A basis as its nine cells, a rounding error and a signed zero taken out. */
function cells(basis: ArrayLike<number>): number[] {
  return Array.from(basis, (cell) => Math.round(cell * 1e6) / 1e6 + 0);
}

/** The velocity the particle at `at` keeps, turned into the world by the frame it was born in. */
function flightOf(pool: Pool, at: number): number[] {
  const flight = pool.velocity.slice(at * 3, at * 3 + 3);
  turnInto(pool.frame, flight, 0, at * FRAME_SLOTS);
  return [...flight];
}

/** Every column of a pool over its live range, which is the whole of what a run produced. */
function rows(pool: Pool) {
  const columns: Record<string, number[]> = {};
  for (const [name, held] of Object.entries(pool)) {
    if (typeof held === "number") continue;
    const column = held as Int32Array | Uint32Array | Float32Array;
    columns[name] = [...column.subarray(0, pool.count * (column.length / pool.capacity))];
  }
  return { count: pool.count, born: pool.born, columns };
}

/** A run as a value: its pool, its clock, the children under `paths` and the births log. */
function stood(driver: Driver, ...paths: string[]) {
  return {
    pool: rows(driver.pool),
    time: driver.time,
    elapsed: driver.elapsed,
    births: driver.births().map((birth) => ({ ...birth })),
    children: paths.map((path) => driver.sources(path).map((child) => rows(child.pool))),
  };
}

function driverFor(model: SystemModel, seed: number) {
  const driver = createDriver(seed);
  driver.swap(model);
  return driver;
}

function run(model: SystemModel, seed: number, frames: number) {
  const driver = driverFor(model, seed);
  for (let at = 0; at < frames; at += 1) driver.advance(1 / 60);
  return driver;
}

describe("createDriver", () => {
  it("puts two runs of one seed in the same place", () => {
    const model = system(emitter());

    expect(snapshot(run(model, 7, 90).pool)).toEqual(snapshot(run(model, 7, 90).pool));
  });

  it("puts two seeds in the same place while nothing draws from the stream", () => {
    /* T0 draws once per particle and reads no probability table, so a system whose
       values are all constants is the same run under any seed. The draw order is what
       the later tiers hang their own rolls on. */
    const model = system(emitter());

    expect(snapshot(run(model, 1, 60).pool)).toEqual(snapshot(run(model, 2, 60).pool));
  });

  it("reaches a time by advancing from zero, whatever the frames were", () => {
    const driver = driverFor(system(emitter()), 3);

    driver.seek(1);

    expect(driver.time).toBeCloseTo(1, 5);
    expect(driver.pool.count).toBeGreaterThan(0);
  });

  it("puts a seek and the frames it replays in the same place", () => {
    const model = system(emitter());
    const seeked = driverFor(model, 3);
    seeked.seek(0.5);

    expect(snapshot(seeked.pool)).toEqual(snapshot(run(model, 3, 30).pool));
  });

  it("puts a seek and the frames it replays in the same place through a noise field", () => {
    const model = system(
      emitter({
        fields: {
          acceleration: [],
          attraction: [],
          drag: [],
          orbital: [],
          noise: [
            {
              position: constant(0, 0, 0),
              axisFraction: [1, 1, 1],
              frequency: constant(10),
              radius: constant(10000),
              velocityDelta: constant(20),
            },
          ],
        },
      }),
    );
    const seeked = driverFor(model, 3);
    seeked.seek(0.5);

    expect(snapshot(seeked.pool)).toEqual(snapshot(run(model, 3, 30).pool));
  });

  it("opens on a system that has already played for its buildUpTime", () => {
    const driver = driverFor({ ...system(emitter()), buildUpTime: 1 }, 3);
    const born = driver.pool.birthTime.subarray(0, driver.pool.count);

    expect(driver.pool.count).toBeGreaterThan(10);
    expect(Math.max(...born)).toBeLessThanOrEqual(0);
    expect(driver.phase).toBe(0);
    expect(driver.elapsed).toBe(1);
  });

  it("puts a seek and the frames it replays in the same place through a build-up", () => {
    const model = { ...system(emitter()), buildUpTime: 1 };
    const seeked = driverFor(model, 3);
    seeked.seek(0.5);

    expect(snapshot(seeked.pool)).toEqual(snapshot(run(model, 3, 30).pool));
  });

  it("builds up again where a looping rig starts its run over", () => {
    const model = { ...system(emitter()), buildUpTime: 1 };
    const driver = driverFor(model, 3);
    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });

    /* The span is the endless emitter's five seconds and one of particle life. */
    for (let at = 0; at < 361; at += 1) driver.advance(1 / 60);

    expect(driver.phase).toBeLessThan(0.05);
    expect(driver.pool.count).toBeGreaterThan(10);
  });

  it("empties the pool on a restart", () => {
    const driver = run(system(emitter()), 3, 60);
    expect(driver.pool.count).toBeGreaterThan(0);

    driver.restart();

    expect(driver.pool.count).toBe(0);
    expect(driver.time).toBe(0);
  });

  it("keeps the live particles when an edit swaps the definition", () => {
    const driver = run(system(emitter()), 3, 60);
    const before = snapshot(driver.pool);
    expect(before.count).toBeGreaterThan(0);

    driver.swap(system(emitter({ birthColor: constant(1, 0, 0, 1) })));

    expect(snapshot(driver.pool)).toEqual(before);
    expect(driver.time).toBeGreaterThan(0);
  });

  it("reports whether a swap changes a field the simulation reads", () => {
    const driver = run(system(emitter()), 3, 60);
    const moved = { blendMode: 1, emitterPosition: constant(5, 0, 0) } as const;

    expect(driver.swap(system(emitter({ blendMode: 1 })))).toBe(false);
    expect(driver.swap(system(emitter(moved)))).toBe(true);
    expect(driver.swap(system(emitter(moved)))).toBe(false);
  });

  it("returns the live particles to their first state when an edit is swapped back and replayed", () => {
    const plain = run(system(emitter()), 3, 60);
    plain.seek(plain.phase);

    const undone = run(system(emitter()), 3, 60);
    undone.swap(system(emitter({ emitterPosition: constant(5, 0, 0) })));
    undone.seek(undone.phase);
    const edited = snapshot(undone.pool);
    undone.swap(system(emitter()));
    undone.seek(undone.phase);

    expect(edited).not.toEqual(snapshot(plain.pool));
    expect(snapshot(undone.pool)).toEqual(snapshot(plain.pool));
  });

  it("carries an edit to the spawn frame and the first emission into the next batch", () => {
    const turned = { rotationOverride: [0, 90, 0] as [number, number, number] };
    const driver = run(system(emitter({ birthVelocity: constant(100, 0, 0), ...turned })), 3, 30);

    /* The velocity is kept in the emitter's own frame, and the frame beside it turns it. */
    expect(driver.pool.count).toBeGreaterThan(0);
    expect(driver.pool.velocity[0]).toBeCloseTo(100, 3);
    expect(flightOf(driver.pool, 0)[2]).toBeCloseTo(-100, 3);

    driver.swap(system(emitter({ birthVelocity: constant(100, 0, 0) })));
    const born = driver.pool.count;
    /* A rate of 20 owes one particle every third frame, and nothing restarts the count. */
    for (let at = 0; at < 3; at += 1) driver.advance(1 / 60);

    expect(driver.pool.count).toBe(born + 1);
    expect(flightOf(driver.pool, born)[0]).toBeCloseTo(100, 3);
    expect(flightOf(driver.pool, born)[2]).toBeCloseTo(0, 3);
    /* A particle born before the edit keeps the frame it was born in. */
    expect(flightOf(driver.pool, 0)[2]).toBeCloseTo(-100, 3);
  });

  it("replays to the current phase when an edit adds or removes an emitter", () => {
    const next = system(emitter(), emitter({ index: 1, listIndex: 1, name: "spark" }));
    const driver = run(system(emitter()), 3, 60);
    const phase = driver.phase;

    driver.swap(next);

    expect(driver.phase).toBeCloseTo(phase, 9);
    expect(snapshot(driver.pool)).toEqual(snapshot(run(next, 3, 60).pool));
  });

  it("replays to the current phase when an edit replaces one emitter of the same count", () => {
    const spark = emitter({ index: 1, listIndex: 1, name: "spark" });
    const next = system(emitter(), emitter({ index: 1, listIndex: 1, name: "ember" }));
    const driver = run(system(emitter(), spark), 3, 60);

    driver.swap(next);

    expect(snapshot(driver.pool)).toEqual(snapshot(run(next, 3, 60).pool));
  });

  it("replays to the current phase when an emitter moves between the two lists", () => {
    const next = system(emitter({ simple: true }));
    const driver = run(system(emitter()), 3, 60);

    driver.swap(next);

    expect(snapshot(driver.pool)).toEqual(snapshot(run(next, 3, 60).pool));
  });

  it("keeps the checkpoints across an edit to what only the draw reads", () => {
    /* A play at 30 Hz writes checkpoints a 60 Hz replay from zero would not reproduce. */
    const played = () => {
      const driver = driverFor(system(emitter()), 3);
      for (let at = 0; at < 90; at += 1) driver.advance(1 / 30);
      return driver;
    };
    const plain = played();
    plain.seek(plain.phase);
    const edited = played();
    edited.swap(system(emitter({ blendMode: 1 })));
    edited.seek(edited.phase);
    const replayed = driverFor(system(emitter()), 3);
    replayed.seek(plain.phase);

    expect(snapshot(edited.pool)).toEqual(snapshot(plain.pool));
    expect(snapshot(edited.pool)).not.toEqual(snapshot(replayed.pool));
  });

  it("holds the phase when an edit shortens a looping run", () => {
    /* A still rig's run is the system's own span, which an edit to a lifetime moves. */
    const driver = driverFor(system(emitter({ lifetime: 2, particleLifetime: constant(1) })), 3);
    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });
    for (let at = 0; at < 150; at += 1) driver.advance(1 / 60);

    const alive = driver.pool.count;
    expect(alive).toBeGreaterThan(1);

    driver.swap(system(emitter({ lifetime: 0.5, particleLifetime: constant(1) })));
    driver.advance(1 / 60);

    /* A replay empties the pool and starts the shortened emitter over, so the newest
       particle would postdate the edit rather than predate it. */
    const newest = Math.max(...driver.pool.birthTime.subarray(0, driver.pool.count));

    expect(driver.pool.count).toBeGreaterThan(1);
    expect(newest).toBeLessThan(2.5);
  });

  it("holds room for the particles a system of several emitters spawns", () => {
    expect(createDriver(1).pool.capacity).toBeGreaterThan(1000);
  });
});

describe("child sets", () => {
  /* A linger as long as the lifetime, so a stopped child plays its particles out. */
  const ember: Partial<EmitterModel> = {
    name: "ember",
    rate: constant(30),
    particleLifetime: constant(0.5),
    particleLinger: 0.5,
    birthVelocity: constant(0, 0, 0),
    acceleration: constant(0, 0, 0),
  };
  const embers = system(emitter(ember));

  function childSet(over: Partial<ChildSetModel> = {}): ChildSetModel {
    return {
      children: [embers],
      bones: [],
      probability: constant(0),
      onDeath: false,
      inheritance: null,
      ...over,
    };
  }

  /** One particle at the start, living a second and rising at 100 a second. */
  function parent(over: Partial<EmitterModel> = {}): EmitterModel {
    return emitter({
      rate: constant(1),
      lifetime: 0.1,
      particleLifetime: constant(1),
      birthVelocity: constant(0, 100, 0),
      acceleration: constant(0, 0, 0),
      childSet: childSet(),
      ...over,
    });
  }

  it("spawns a system of its own for a particle born", () => {
    const driver = run(system(parent()), 3, 30);
    const children = driver.sources("0.0");

    expect(children).toHaveLength(1);
    expect(children[0].pool.count).toBeGreaterThan(0);
  });

  it("carries the child with the particle it rides", () => {
    const model = system(parent());
    const driver = run(model, 3, 30);
    const [child] = driver.sources("0.0");

    expect(driver.pool.count).toBe(1);
    expect(child.origin[1]).toBeCloseTo(placeOf(driver, model, 0)[1], 3);
    expect(child.origin[1]).toBeGreaterThan(40);
  });

  it("stands a child on its particle, and leaves the child's own transform to its particles", () => {
    const moved: SystemModel = {
      ...embers,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 500, 0, 0, 1],
    };
    const model = system(parent({ childSet: childSet({ children: [moved] }) }));
    const driver = run(model, 3, 30);
    const [child] = driver.sources("0.0");
    const [x, y] = placeOf(driver, model, 0);

    expect(child.origin[0]).toBeCloseTo(x, 3);
    expect(child.origin[1]).toBeCloseTo(y, 3);
    expect(child.pool.count).toBeGreaterThan(0);
    expect(child.pool.placed[0]).toBeCloseTo(500, 3);
  });

  it("moves a HUD-layer child by its transform's translation, and its particles by none of it", () => {
    const moved: SystemModel = {
      ...embers,
      hudLayer: true,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 500, 0, 0, 1],
    };
    const model = system(parent({ childSet: childSet({ children: [moved] }) }));
    const driver = run(model, 3, 30);
    const [child] = driver.sources("0.0");

    expect(child.origin[0]).toBeCloseTo(placeOf(driver, model, 0)[0] + 500, 3);
    expect(child.pool.count).toBeGreaterThan(0);
    expect(child.pool.placed[0]).toBeCloseTo(0, 3);
  });

  it("spawns a child none of whose emitters exist this run, and reaps it with nothing drawn", () => {
    const absent = system(emitter({ ...ember, chanceToNotExist: 1 }));
    const driver = run(system(parent({ childSet: childSet({ children: [absent] }) })), 3, 30);

    expect(driver.births()).toHaveLength(1);
    expect(driver.sources("0.0")).toHaveLength(0);
  });

  it("stops a child where its particle died, and reaps it once it has played out", () => {
    const driver = run(system(parent()), 3, 66);
    const [child] = driver.sources("0.0");
    expect(driver.pool.count).toBe(0);
    const left = child.origin[1];
    const alive = child.pool.count;

    for (let at = 0; at < 12; at += 1) driver.advance(1 / 60);
    expect(child.origin[1]).toBe(left);
    expect(child.pool.count).toBeLessThan(alive);

    for (let at = 0; at < 60; at += 1) driver.advance(1 / 60);
    expect(driver.sources("0.0")).toHaveLength(0);
  });

  it("cuts a stopped child's particles at once where its emitters grant no linger", () => {
    const bare = system(emitter({ ...ember, particleLinger: 0 }));
    const driver = run(system(parent({ childSet: childSet({ children: [bare] }) })), 3, 66);

    expect(driver.pool.count).toBe(0);
    expect(driver.sources("0.0")).toHaveLength(0);
  });

  it("spawns a death child where the particle died, and none while it lives", () => {
    const driver = run(system(parent({ childSet: childSet({ onDeath: true }) })), 3, 30);
    expect(driver.sources("0.0")).toHaveLength(0);

    for (let at = 0; at < 36; at += 1) driver.advance(1 / 60);
    const [child] = driver.sources("0.0");
    expect(child.origin[1]).toBeGreaterThan(90);

    const where = child.origin[1];
    for (let at = 0; at < 12; at += 1) driver.advance(1 / 60);
    expect(child.origin[1]).toBe(where);
    expect(child.pool.count).toBeGreaterThan(0);
  });

  it("turns a child with the particle it rides, and only by its frame under 0x2", () => {
    /* A quarter turn about z sends the particle's own x onto the world's y. */
    const turned = { birthRotation0: constant(0, 0, 90) };
    const plain = run(system(parent(turned)), 3, 30);
    const framed = run(
      system(
        parent({
          ...turned,
          childSet: childSet({ inheritance: { mode: 0x2, offset: constant(0, 0, 0) } }),
        }),
      ),
      3,
      30,
    );

    expect(plain.sources("0.0")[0].orientation[3]).toBeCloseTo(1, 5);
    expect(framed.sources("0.0")[0].orientation[3]).toBeCloseTo(0, 5);
  });

  it("adds RelativeOffset turned by the particle, and on the world's axes under 0x1", () => {
    const turned = { birthRotation0: constant(0, 0, 90) };
    const offset = (mode: number) =>
      system(
        parent({
          ...turned,
          childSet: childSet({ inheritance: { mode, offset: constant(10, 0, 0) } }),
        }),
      );

    const local = run(offset(0), 3, 30);
    const world = run(offset(0x1), 3, 30);
    const localY = placeOf(local, offset(0), 0)[1];
    const worldY = placeOf(world, offset(0x1), 0)[1];

    expect(local.sources("0.0")[0].origin[0]).toBeCloseTo(0, 3);
    expect(local.sources("0.0")[0].origin[1]).toBeCloseTo(localY + 10, 3);
    expect(world.sources("0.0")[0].origin[0]).toBeCloseTo(10, 3);
    expect(world.sources("0.0")[0].origin[1]).toBeCloseTo(worldY, 3);
  });

  it("turns RelativeOffset by the particle even where 0x2 drops its turn from the child", () => {
    const model = system(
      parent({
        birthRotation0: constant(0, 0, 90),
        childSet: childSet({ inheritance: { mode: 0x2, offset: constant(10, 0, 0) } }),
      }),
    );
    const driver = run(model, 3, 30);
    const [child] = driver.sources("0.0");

    expect(child.origin[0]).toBeCloseTo(0, 3);
    expect(child.origin[1]).toBeCloseTo(placeOf(driver, model, 0)[1] + 10, 3);
  });

  it("carries an edit to the inheritance to a child already live", () => {
    const offsetBy = (x: number) =>
      childSet({ inheritance: { mode: 0x1, offset: constant(x, 0, 0) } });
    const driver = run(system(parent({ childSet: offsetBy(0) })), 3, 30);
    const [child] = driver.sources("0.0");

    driver.swap(system(parent({ childSet: offsetBy(10) })));
    driver.advance(1 / 60);

    expect(driver.sources("0.0")).toEqual([child]);
    expect(child.origin[0]).toBeCloseTo(10, 3);
  });

  it("spawns nothing for a set naming bones while the rig carries no joints", () => {
    const driver = run(system(parent({ childSet: childSet({ bones: ["R_Hand"] }) })), 3, 30);

    expect(driver.sources("0.0")).toHaveLength(0);
  });

  it("empties the children with the pool on a restart", () => {
    const driver = run(system(parent()), 3, 30);
    const children = driver.sources("0.0");
    expect(children).toHaveLength(1);

    driver.restart();

    expect(children).toHaveLength(0);
  });

  it("puts a child in the same place whether its run was played or sought", () => {
    const played = run(system(parent()), 5, 45);
    const sought = driverFor(system(parent()), 5);
    sought.seek(0.75);

    const [left] = played.sources("0.0");
    const [right] = sought.sources("0.0");
    expect(snapshot(right.pool)).toEqual(snapshot(left.pool));
  });

  it("keeps a child across an edit that keeps its shape, and drops it across one that does not", () => {
    const driver = run(system(parent()), 3, 30);
    const [child] = driver.sources("0.0");

    driver.swap(system(parent({ birthColor: constant(1, 0, 0, 1) })));
    expect(driver.sources("0.0")).toEqual([child]);

    driver.swap(system(parent({ childSet: childSet({ children: [system()] }) })));
    expect(driver.sources("0.0")).toHaveLength(0);
  });

  it("nests a child's own children, and stops nesting past the cap", () => {
    let nested = embers;
    for (let depth = 0; depth < 6; depth += 1)
      nested = system(parent({ childSet: childSet({ children: [nested] }) }));
    const driver = run(nested, 3, 30);

    expect(driver.sources("0.0/0.0")).toHaveLength(1);
    expect(driver.sources(["0.0", "0.0", "0.0", "0.0", "0.0"].join("/"))).toHaveLength(0);
  });

  describe("on bones", () => {
    /** A joint standing still at `(x, y, z)`, turned by the identity. */
    function anchorAt(x: number, y: number, z: number) {
      return {
        originAt: () => [x, y, z] as const,
        basisInto: (_time: number, out: Float32Array) => {
          out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
          return out;
        },
      };
    }

    /** `model` run with `joints` bound before any particle spawns, so bone children reach it. */
    function boneRun(model: SystemModel, seed: number, frames: number, joints: Joints) {
      const driver = driverFor(model, seed);
      driver.steer({ motion: { kind: "still" }, life: "once", height: 0, joints });
      for (let at = 0; at < frames; at += 1) driver.advance(1 / 60);
      return driver;
    }

    it("spawns one child per bone, each under its own path", () => {
      const driver = boneRun(
        system(
          parent({
            childSet: childSet({ bones: ["R_Hand", "L_Hand"], children: [embers, embers] }),
          }),
        ),
        3,
        30,
        () => anchorAt(0, 0, 0),
      );

      expect(driver.sources("0.0")).toHaveLength(1);
      expect(driver.sources("0.1")).toHaveLength(1);
    });

    it("places a bone child at its joint, re-rooted at the particle's place and turn", () => {
      const turned = { birthRotation0: constant(0, 0, 90) };
      const model = system(
        parent({ ...turned, childSet: childSet({ bones: ["R_Hand"], children: [embers] }) }),
      );
      const driver = boneRun(model, 3, 30, () => anchorAt(10, 0, 0));

      const [child] = driver.sources("0.0");
      expect(child.origin[0]).toBeCloseTo(0, 3);
      expect(child.origin[1]).toBeCloseTo(placeOf(driver, model, 0)[1] + 10, 3);
    });

    it("turns a bone child by the particle's own turn times the joint's basis", () => {
      const turned = { birthRotation0: constant(0, 0, 90) };
      const rotated = new Float32Array([1, 0, 0, 0, 0, -1, 0, 1, 0]);
      const rotatedAnchor = {
        originAt: () => [0, 0, 0] as const,
        basisInto: (_time: number, out: Float32Array) => {
          out.set(rotated);
          return out;
        },
      };
      const model = system(
        parent({ ...turned, childSet: childSet({ bones: ["R_Hand"], children: [embers] }) }),
      );

      const plain = boneRun(model, 3, 30, () => anchorAt(0, 0, 0));
      const particleTurn = plain.sources("0.0")[0].orientation;
      const expected = new Float32Array(9);
      multiplyInto(particleTurn, rotated, expected);

      const turnedDriver = boneRun(model, 3, 30, () => rotatedAnchor);
      expect([...turnedDriver.sources("0.0")[0].orientation]).toEqual([...expected]);
    });

    it("spawns none where a bone set names fewer bones than children", () => {
      const driver = boneRun(
        system(parent({ childSet: childSet({ bones: ["R_Hand"], children: [embers, embers] }) })),
        3,
        30,
        () => anchorAt(0, 0, 0),
      );

      expect(driver.sources("0.0")).toHaveLength(0);
      expect(driver.sources("0.1")).toHaveLength(0);
    });

    it("skips only the child whose bone the lookup lacks", () => {
      const driver = boneRun(
        system(
          parent({
            childSet: childSet({ bones: ["R_Hand", "L_Hand"], children: [embers, embers] }),
          }),
        ),
        3,
        30,
        (name: string) => (name === "R_Hand" ? anchorAt(10, 0, 0) : null),
      );

      expect(driver.sources("0.0")).toHaveLength(1);
      expect(driver.sources("0.1")).toHaveLength(0);
    });

    it("follows a carried bone child's joint as time moves", () => {
      const walking = {
        originAt: (time: number) => [time * 100, 0, 0] as const,
        basisInto: (_time: number, out: Float32Array) => {
          out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
          return out;
        },
      };
      const driver = boneRun(
        system(parent({ childSet: childSet({ bones: ["R_Hand"], children: [embers] }) })),
        3,
        30,
        () => walking,
      );
      const [child] = driver.sources("0.0");
      const before = child.origin[0];

      for (let at = 0; at < 6; at += 1) driver.advance(1 / 60);

      expect(child.origin[0]).toBeGreaterThan(before);
    });
  });
});

describe("the rig", () => {
  /* An emitter that ends, so a run has a length the system's own span can be read off. */
  const brief = emitter({ lifetime: 0.5, particleLifetime: constant(0.25) });

  /**
   * How far along X the live particles were born, which is where the origin has been.
   *
   * A position is in its particle's own frame, so the anchor is what the rig's travel moves.
   */
  function reach(pool: Pool): number {
    let most = 0;
    for (let at = 0; at < pool.count; at += 1) most = Math.max(most, pool.anchor[at * 3]);
    return most;
  }

  /** The least X a live particle was born at, which is the oldest birth still alive. */
  function trail(pool: Pool): number {
    let least = Infinity;
    for (let at = 0; at < pool.count; at += 1) least = Math.min(least, pool.anchor[at * 3]);
    return least;
  }

  it("leaves the origin at zero until a rig moves it", () => {
    const model = system(emitter());
    const driver = run(model, 3, 60);

    expect(driver.pool.count).toBeGreaterThan(0);
    expect(reach(driver.pool)).toBe(0);
    expect(placeOf(driver, model, 0)[0]).toBe(0);
    expect(driver.origin).toEqual([0, 0, 0]);
  });

  it("births along the path once a flying rig is bound", () => {
    const driver = driverFor(system(emitter()), 3);
    driver.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 },
      life: "once",
      height: 0,
    });

    for (let at = 0; at < 60; at += 1) driver.advance(1 / 60);

    /* A second of flight at 100 a second, every particle anchored where it was born. */
    expect(reach(driver.pool)).toBeGreaterThan(90);
    expect(reach(driver.pool)).toBeLessThanOrEqual(100.001);
    expect(trail(driver.pool)).toBeLessThan(20);
  });

  it("keeps a birth in the emitter's own frame, and stands it in the world on its anchor", () => {
    const model = system(
      emitter({ birthVelocity: constant(0, 0, 0), acceleration: constant(0, 0, 0) }),
    );
    const driver = driverFor(model, 3);
    driver.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 },
      life: "once",
      height: 0,
    });
    for (let at = 0; at < 30; at += 1) driver.advance(1 / 60);

    expect(driver.pool.count).toBeGreaterThan(1);
    for (let at = 0; at < driver.pool.count; at += 1) {
      expect([...driver.pool.position.subarray(at * 3, at * 3 + 3)]).toEqual([0, 0, 0]);
      expect(placeOf(driver, model, at)[0]).toBeCloseTo(driver.pool.anchor[at * 3], 4);
    }
    expect(trail(driver.pool)).toBeLessThan(reach(driver.pool));
  });

  it("spreads the births of one step along the travel of that step", () => {
    const driver = driverFor(system(emitter({ rate: constant(600) })), 3);
    driver.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 600 },
      life: "once",
      height: 0,
    });
    for (let at = 0; at < 2; at += 1) driver.advance(1 / 60);

    /* The second step travels from 10 to 20 and owes the particles of one frame at 600 a second. */
    const born = [];
    for (let at = 0; at < driver.pool.count; at += 1) {
      if (driver.pool.birthTime[at] > 1.05 / 60) born.push(driver.pool.anchor[at * 3]);
    }

    expect(born.length).toBeGreaterThan(5);
    expect(new Set(born.map((x) => x.toFixed(3))).size).toBe(born.length);
    expect(Math.min(...born)).toBeGreaterThan(10);
    expect(Math.max(...born)).toBeCloseTo(20, 3);
  });

  it("holds the phase when a parameter is tuned, so a drag does not pin the run", () => {
    const flight = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 } as const;
    const driver = driverFor(system(emitter()), 3);
    driver.steer({ motion: flight, life: "once", height: 0 });
    for (let at = 0; at < 60; at += 1) driver.advance(1 / 60);

    const flown = reach(driver.pool);
    expect(flown).toBeGreaterThan(90);
    driver.steer({ motion: { ...flight, speed: 200 }, life: "once", height: 0 });
    for (let at = 0; at < 6; at += 1) driver.advance(1 / 60);

    /* Pinning the run would put the next births back at the launch point, leaving the
       reach where the first second of flight had already carried it. */
    expect(reach(driver.pool)).toBeGreaterThan(flown);
  });

  it("moves what is alive onto the joint when the pose under a bone rig is replaced", () => {
    const anchorAt = (x: number) => ({
      originAt: (): [number, number, number] => [x, 0, 0],
      basisInto: (_time: number, out: Float32Array) => {
        out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        return out;
      },
    });
    const driver = driverFor(system(emitter({ particleLifetime: constant(10) })), 3);
    driver.steer({
      motion: { kind: "bone", anchor: anchorAt(0), target: null },
      life: "once",
      height: 0,
    });
    for (let at = 0; at < 30; at += 1) driver.advance(1 / 60);

    const alive = driver.pool.count;
    const time = driver.time;
    expect(alive).toBeGreaterThan(1);
    expect(reach(driver.pool)).toBe(0);

    driver.steer({
      motion: { kind: "bone", anchor: anchorAt(100), target: null },
      life: "once",
      height: 0,
    });

    expect(driver.pool.count).toBe(alive);
    expect(driver.time).toBeCloseTo(time, 6);
    expect(trail(driver.pool)).toBe(100);
  });

  it("holds the phase across a tune that shortens a looping run", () => {
    /* A `once` rig's phase is the clock, so only a looping one can wrap. */
    const flight = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 } as const;
    const driver = driverFor(system(emitter()), 3);
    driver.steer({ motion: flight, life: "loop", height: 0 });
    for (let at = 0; at < 360; at += 1) driver.advance(1 / 60);

    const alive = driver.pool.count;
    expect(alive).toBeGreaterThan(1);

    driver.steer({ motion: { ...flight, speed: 200 }, life: "loop", height: 0 });
    driver.advance(1 / 60);

    expect(driver.pool.count).toBeGreaterThanOrEqual(alive);
  });

  it("stops the system where the rig says, so nothing is born past it", () => {
    const driver = driverFor(system(emitter()), 3);
    driver.steer({ motion: { kind: "still" }, life: "once", height: 0, stopAt: 0.5 });

    for (let at = 0; at < 30; at += 1) driver.advance(1 / 60);
    const before = driver.pool.count;
    expect(before).toBeGreaterThan(0);

    for (let at = 0; at < 30; at += 1) driver.advance(1 / 60);
    expect(driver.pool.count).toBe(0);
  });

  it("keeps a stopped emitter spawning until the system's age passes its emitterLinger", () => {
    /* A linger as long as the life, so the cap a finished emitter takes cuts nothing short. */
    const waiting = emitter({ rate: constant(60), emitterLinger: 0.75, particleLinger: 1 });
    const driver = driverFor(system(waiting), 3);
    driver.steer({ motion: { kind: "still" }, life: "once", height: 0, stopAt: 0.5 });
    for (let at = 0; at < 60; at += 1) driver.advance(1 / 60);

    const newest = Math.max(...driver.pool.birthTime.subarray(0, driver.pool.count));

    expect(driver.pool.count).toBeGreaterThan(0);
    expect(newest).toBeGreaterThan(0.7);
    expect(newest).toBeLessThan(0.77);
  });

  it("stops a path rig where it lands, lets the linger play out, then flies again", () => {
    const driver = driverFor(system(emitter({ rate: constant(60), particleLinger: 0.5 })), 3);
    driver.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [100, 0, 0], speed: 100 },
      life: "loop",
      height: 0,
    });

    for (let at = 0; at < 30; at += 1) driver.advance(1 / 60);
    expect(driver.pool.count).toBeGreaterThan(0);
    expect(driver.elapsed).toBeCloseTo(0.5, 3);

    /* Landed at one second, so the linger caps every lifetime at half a second: the
       pool thins as the earlier births run out, and nothing new is born. */
    for (let at = 0; at < 42; at += 1) driver.advance(1 / 60);
    expect(driver.origin[0]).toBeCloseTo(100, 3);
    const lingering = driver.pool.count;
    expect(lingering).toBeGreaterThan(0);
    for (let at = 0; at < 12; at += 1) driver.advance(1 / 60);
    expect(driver.pool.count).toBeLessThan(lingering);

    /* The run is the flight plus the linger, so the next flight starts at 1.5 seconds. */
    for (let at = 0; at < 10; at += 1) driver.advance(1 / 60);
    expect(driver.elapsed).toBeCloseTo(94 / 60 - 1.5, 3);
    expect(driver.origin[0]).toBeCloseTo((94 / 60 - 1.5) * 100, 2);
  });

  it("flies a path rig on its Y, so a birth along Y flies with it and Z points up", () => {
    const driver = driverFor(system(emitter({ birthVelocity: constant(0, 100, 0) })), 3);
    driver.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 },
      life: "once",
      height: 0,
    });
    driver.advance(1 / 60);

    /* The birth keeps its velocity as authored, and the frame it was born in turns it. */
    expect(driver.pool.count).toBeGreaterThan(0);
    expect([...driver.pool.velocity.subarray(0, 3)]).toEqual([0, 100, 0]);
    const [x, y, z] = flightOf(driver.pool, 0);
    expect(x).toBeCloseTo(100, 3);
    expect(y).toBeCloseTo(0, 3);
    expect(z).toBeCloseTo(0, 3);

    const lifted = driverFor(system(emitter({ birthVelocity: constant(0, 0, 100) })), 3);
    lifted.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 },
      life: "once",
      height: 0,
    });
    lifted.advance(1 / 60);
    expect(flightOf(lifted.pool, 0)[1]).toBeCloseTo(100, 3);
  });

  it("moves a flying rig's particle in the world the way its frame turns its velocity", () => {
    const model = system(
      emitter({ birthVelocity: constant(0, 100, 0), acceleration: constant(0, 0, 0) }),
    );
    const driver = driverFor(model, 3);
    driver.steer({
      motion: { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 },
      life: "once",
      height: 0,
    });
    driver.advance(1 / 60);
    const born = placeOf(driver, model, 0);
    for (let at = 0; at < 30; at += 1) driver.advance(1 / 60);

    /* Half a second along its own Y, which the rig's flight lays along the world's X. */
    const stood = placeOf(driver, model, 0);
    expect(driver.pool.position[1]).toBeCloseTo(50, 2);
    expect(stood[0] - born[0]).toBeCloseTo(50, 2);
    expect(stood[1] - born[1]).toBeCloseTo(0, 3);
    expect(driver.pool.travel[0]).toBeCloseTo(100, 2);
  });

  describe("on a bone", () => {
    /** An anchor walking a hundred units a second along `x`, turned a quarter about up. */
    const walker = {
      originAt: (time: number) => [time * 100, 0, 0] as const,
      basisInto: (_time: number, out: Float32Array) => {
        out.set([0, 0, 1, 0, 1, 0, -1, 0, 0]);
        return out;
      },
    };
    const bone = {
      motion: { kind: "bone", anchor: walker, target: null },
      life: "once",
      height: 0,
    } as const;

    it("births where the anchor has walked", () => {
      const driver = driverFor(system(emitter({ birthVelocity: constant(0, 0, 0) })), 3);
      driver.steer(bone);
      for (let at = 0; at < 60; at += 1) driver.advance(1 / 60);

      expect(reach(driver.pool)).toBeGreaterThan(90);
      expect(driver.origin[0]).toBeCloseTo(100, 3);
    });

    it("turns the system by the anchor's whole basis", () => {
      const driver = driverFor(system(emitter({ birthVelocity: constant(0, 0, 100) })), 3);
      driver.steer(bone);
      driver.advance(1 / 60);

      expect([...driver.orientation]).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);
      expect(driver.pool.count).toBeGreaterThan(0);
      expect(cells(driver.pool.frame.subarray(0, 9))).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);
      expect(flightOf(driver.pool, 0)[0]).toBeCloseTo(100, 3);
      expect(flightOf(driver.pool, 0)[2]).toBeCloseTo(0, 3);
    });

    it("leaves the system unturned for an emitter off isLocalOrientation", () => {
      const model = system(
        emitter({ birthVelocity: constant(0, 0, 100), localOrientation: false }),
      );
      const driver = driverFor(model, 3);
      driver.steer(bone);
      driver.advance(1 / 60);

      expect(cells(driver.pool.frame.subarray(0, 9))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      expect(flightOf(driver.pool, 0)[2]).toBeCloseTo(100, 3);
    });

    it("puts a seek and the frames it replays in the same place", () => {
      const model = system(emitter());
      const played = driverFor(model, 3);
      played.steer(bone);
      for (let at = 0; at < 30; at += 1) played.advance(1 / 60);

      const sought = driverFor(model, 3);
      sought.steer(bone);
      sought.seek(0.5);

      expect(snapshot(sought.pool)).toEqual(snapshot(played.pool));
    });
  });

  describe("the definition's own transform", () => {
    /* The file's rows: a quarter turn that sends X onto Z, under a translation of 500 on X. */
    const TURNED_AND_MOVED = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 500, 0, 0, 1];

    const standing = emitter({
      birthVelocity: constant(0, 0, 0),
      acceleration: constant(0, 0, 0),
      emitterPosition: constant(10, 0, 0),
    });

    it("is the last factor of each particle's own matrix, and moves the origin nowhere", () => {
      const model: SystemModel = { ...system(standing), transform: TURNED_AND_MOVED };
      const driver = run(model, 3, 1);

      expect(driver.pool.count).toBeGreaterThan(0);
      expect(driver.origin).toEqual([0, 0, 0]);
      expect([...driver.pool.anchor.subarray(0, 3)]).toEqual([0, 0, 0]);
      expect([...driver.pool.position.subarray(0, 3)]).toEqual([10, 0, 0]);

      const placed = [...driver.pool.placed.subarray(0, 3)];
      expect(placed[0]).toBeCloseTo(500, 3);
      expect(placed[1]).toBeCloseTo(0, 3);
      expect(placed[2]).toBeCloseTo(10, 3);
      expect(placeOf(driver, model, 0)[0]).toBeCloseTo(500, 3);
      expect(placeOf(driver, model, 0)[2]).toBeCloseTo(10, 3);
    });

    it("turns no part of the rig's own orientation", () => {
      const model: SystemModel = { ...system(standing), transform: TURNED_AND_MOVED };
      const driver = run(model, 3, 1);

      expect(cells(driver.orientation)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      expect(cells(driver.pool.frame.subarray(0, 9))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      expect(driver.world.hud).toBe(false);
      expect(driver.world.offset).toEqual([500, 0, 0]);
    });

    it("stands inside the frame a particle was born in, so the frame turns its translation", () => {
      const turned = emitter({ ...standing, rotationOverride: [0, 90, 0] });
      const model: SystemModel = {
        ...system(turned),
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 500, 0, 0, 1],
      };
      const driver = run(model, 3, 1);
      const [x, , z] = placeOf(driver, model, 0);

      /* The frame's quarter turn about Y sends the matrix's 510 on X onto minus Z. */
      expect(driver.pool.placed[0]).toBeCloseTo(510, 3);
      expect(x).toBeCloseTo(0, 2);
      expect(z).toBeCloseTo(-510, 2);
    });

    it("moves where a HUD-layer system stands by its translation, and turns nothing", () => {
      const model: SystemModel = {
        ...system({ ...standing, hudLayer: true }),
        hudLayer: true,
        transform: TURNED_AND_MOVED,
      };
      const driver = run(model, 3, 1);

      expect(driver.pool.count).toBeGreaterThan(0);
      expect(driver.world.hud).toBe(true);
      expect(driver.origin).toEqual([500, 0, 0]);
      expect([...driver.pool.anchor.subarray(0, 3)]).toEqual([500, 0, 0]);
      expect([...driver.pool.placed.subarray(0, 3)]).toEqual([10, 0, 0]);
      expect(placeOf(driver, model, 0)).toEqual([510, 0, 0]);
    });

    it("carries the HUD-layer translation along a rig's travel", () => {
      const model: SystemModel = {
        ...system({ ...standing, hudLayer: true }),
        hudLayer: true,
        transform: TURNED_AND_MOVED,
      };
      const driver = driverFor(model, 3);
      driver.steer({
        motion: { kind: "path", from: [0, 0, 0], to: [0, 0, 1000], speed: 100 },
        life: "once",
        height: 0,
      });
      for (let at = 0; at < 60; at += 1) driver.advance(1 / 60);

      expect(driver.origin[0]).toBeCloseTo(500, 3);
      expect(driver.origin[2]).toBeCloseTo(100, 3);
    });
  });

  it("carries an orbit on a missile's frame, or on a unit's under that orientation", () => {
    const orbiting = (orientation: "missile" | "unit") => {
      const driver = run(system(emitter()), 3, 0);
      driver.steer({
        motion: { kind: "orbit", radius: 100, period: 60, orientation },
        life: "once",
        height: 0,
      });
      driver.advance(1 / 60);
      return [...driver.orientation].map((cell) => Math.round(cell * 100) / 100 + 0);
    };

    expect(orbiting("missile")).toEqual([-1, 0, 0, 0, 0, 1, 0, 1, 0]);
    expect(orbiting("unit")).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("puts the run back to its start when the motion itself changes", () => {
    const driver = run(system(emitter()), 3, 60);
    expect(driver.pool.count).toBeGreaterThan(0);

    driver.steer({
      motion: { kind: "orbit", radius: 100, period: 2, orientation: "missile" },
      life: "once",
      height: 0,
    });

    expect(driver.pool.count).toBe(0);
    expect(driver.time).toBe(0);
  });

  it("keeps the particles already in the air when only the lifecycle changes", () => {
    const driver = run(system(emitter()), 3, 60);
    const before = snapshot(driver.pool);
    expect(before.count).toBeGreaterThan(0);

    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });

    expect(snapshot(driver.pool)).toEqual(before);
    expect(driver.time).toBeGreaterThan(0);
  });

  /* `brief` plays out inside a second, so 1.3s is past the end of a first run and
     inside a second one that a looping rig has started. */
  const PAST_ONE_RUN = { seconds: 1.3, frames: 78 };

  it("plays a run through and leaves it finished under a rig that does not loop", () => {
    const driver = driverFor(system(brief), 3);
    driver.steer({ motion: { kind: "still" }, life: "once", height: 0 });

    for (let at = 0; at < PAST_ONE_RUN.frames; at += 1) driver.advance(1 / 60);

    expect(driver.pool.count).toBe(0);
  });

  it("starts the effect over under a looping rig", () => {
    const driver = driverFor(system(brief), 3);
    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });

    for (let at = 0; at < PAST_ONE_RUN.frames; at += 1) driver.advance(1 / 60);

    expect(driver.pool.count).toBeGreaterThan(0);
  });

  it("restarts a drained object preview repeatedly instead of waiting through an empty span", () => {
    const driver = driverFor(system(brief), 3);
    driver.steer({ motion: { kind: "still" }, life: "once", height: 0 });
    const advance = createPreviewPlayback(driver, 60, 0);
    let restarts = 0;
    let time = 0;
    let emittingRuns = 0;
    let seen = false;

    for (let frame = 0; frame < 600; frame += 1) {
      advance(1 / 60);
      if (driver.time < time) {
        restarts += 1;
        if (seen) emittingRuns += 1;
        seen = false;
      }
      seen ||= driver.pool.count > 0;
      time = driver.time;
    }

    expect(restarts).toBeGreaterThan(5);
    expect(emittingRuns).toBe(restarts);
  });

  it("keeps a preview alive until its delayed emitters have had time to start", () => {
    const driver = driverFor(system(brief), 3);
    driver.steer({ motion: { kind: "still" }, life: "once", height: 0 });
    const advance = createPreviewPlayback(driver, 60, 4);
    for (let frame = 0; frame < 180; frame += 1) advance(1 / 60);
    expect(driver.time).toBeCloseTo(3);
  });

  it("replays a loop the same way a seek reaches it", () => {
    const rig = { motion: { kind: "still" }, life: "loop", height: 0 } as const;

    const played = driverFor(system(brief), 5);
    played.steer(rig);
    for (let at = 0; at < PAST_ONE_RUN.frames; at += 1) played.advance(1 / 60);

    const sought = driverFor(system(brief), 5);
    sought.steer(rig);
    sought.seek(PAST_ONE_RUN.seconds);

    expect(sought.pool.count).toBeGreaterThan(0);
    expect(snapshot(sought.pool)).toEqual(snapshot(played.pool));
  });

  it("wraps a loop on the clock rather than on when the rig was bound", () => {
    const rig = { motion: { kind: "still" }, life: "loop", height: 0 } as const;

    /* Bound 1.5s in, off the beat of `brief`'s own one-second run, so a rig counting
       from where it was bound would wrap half a run away from where the clock does. */
    const played = driverFor(system(brief), 5);
    for (let at = 0; at < 90; at += 1) played.advance(1 / 60);
    played.steer(rig);
    for (let at = 0; at < 60; at += 1) played.advance(1 / 60);

    const sought = driverFor(system(brief), 5);
    sought.steer(rig);
    sought.seek(2.5);

    expect(played.pool.count).toBeGreaterThan(0);
    expect(snapshot(played.pool)).toEqual(snapshot(sought.pool));
  });
});

describe("ChanceToNotExist", () => {
  /* An emitter that plays out inside the second a still rig loops on. */
  const brief = { lifetime: 0.5, particleLifetime: constant(0.25) };
  const flaky = emitter({ ...brief, chanceToNotExist: 0.5 });
  const SEEDS = Array.from({ length: 24 }, (_, at) => at + 1);

  /** The emitter at `index` spawned something over the first ten frames of a run of `seed`. */
  function exists(model: SystemModel, seed: number, index = 0): boolean {
    const { pool } = run(model, seed, 10);
    return [...pool.emitter.subarray(0, pool.count)].includes(index);
  }

  it("leaves the emitter out of some runs and in others, by the seed alone", () => {
    const outcomes = SEEDS.map((seed) => exists(system(flaky), seed));

    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
    expect(SEEDS.map((seed) => exists(system(flaky), seed))).toEqual(outcomes);
  });

  it("never leaves out an emitter writing no chance, and always one whose chance is one", () => {
    const certain = system(emitter(brief));
    const never = system(emitter({ ...brief, chanceToNotExist: 1 }));

    expect(SEEDS.map((seed) => exists(certain, seed))).not.toContain(false);
    expect(SEEDS.map((seed) => exists(never, seed))).not.toContain(true);
  });

  it("leaves the system's other emitters in where it leaves one out", () => {
    const pair = system(flaky, emitter({ ...brief, index: 1, listIndex: 1, name: "spark" }));
    const split = SEEDS.filter((seed) => !exists(pair, seed, 0));

    expect(split.length).toBeGreaterThan(0);
    for (const seed of split) expect(exists(pair, seed, 1)).toBe(true);
  });

  it("rolls again each time a looping rig starts the run over", () => {
    const driver = driverFor(system(flaky), 3);
    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });

    /* Thirty passes of one second each, a pass counted as in where it drew a particle. */
    const passes: boolean[] = [];
    for (let pass = 0; pass < 30; pass += 1) {
      let drew = false;
      for (let frame = 0; frame < 60; frame += 1) {
        driver.advance(1 / 60);
        drew ||= driver.pool.count > 0;
      }
      passes.push(drew);
    }

    expect(passes).toContain(true);
    expect(passes).toContain(false);
  });

  it("reaches by a seek the rolls a play made, pass for pass", () => {
    const rig = { motion: { kind: "still" }, life: "loop", height: 0 } as const;
    const played = driverFor(system(flaky), 3);
    played.steer(rig);
    const sought = driverFor(system(flaky), 3);
    sought.steer(rig);

    /* A quarter second into each pass, where an emitter that exists has particles alive. */
    const stood: ReturnType<typeof snapshot>[] = [];
    for (let frame = 0; frame < 15; frame += 1) played.advance(1 / 60);
    for (let pass = 0; pass < 10; pass += 1) {
      stood.push(snapshot(played.pool));
      sought.seek(pass + 0.25);
      expect(snapshot(sought.pool)).toEqual(stood[pass]);

      for (let frame = 0; frame < 60; frame += 1) played.advance(1 / 60);
    }

    expect(stood.some((pass) => pass.count > 0)).toBe(true);
    expect(stood.some((pass) => pass.count === 0)).toBe(true);

    /* Back through a checkpoint, which holds the roll its pass made. */
    sought.seek(3.25);
    expect(snapshot(sought.pool)).toEqual(stood[3]);
  });
});

describe("checkpoints", () => {
  /** A child system whose particles play out on their own. */
  const embers = system(
    emitter({
      name: "ember",
      rate: constant(30),
      particleLifetime: constant(0.5),
      particleLinger: 0.5,
      birthVelocity: constant(0, 0, 0),
      acceleration: constant(0, 0, 0),
    }),
  );

  function childSet(over: Partial<ChildSetModel> = {}): ChildSetModel {
    return {
      children: [embers],
      bones: [],
      probability: constant(0),
      onDeath: false,
      inheritance: null,
      ...over,
    };
  }

  /** One particle at the start, living a second, carrying a child system of its own. */
  function parent(over: Partial<EmitterModel> = {}): EmitterModel {
    return emitter({
      rate: constant(1),
      lifetime: 0.1,
      particleLifetime: constant(1),
      birthVelocity: constant(0, 100, 0),
      acceleration: constant(0, 0, 0),
      childSet: childSet(),
      ...over,
    });
  }

  /** An emitter that plays out inside the shortest run a rig loops on. */
  const brief = emitter({ lifetime: 0.3, particleLifetime: constant(0.2) });

  const LOOPING = { motion: { kind: "still" }, life: "loop", height: 0 } as const;

  it("puts a seek through a checkpoint where a seek from zero puts it", () => {
    const model = system(emitter());
    const straight = driverFor(model, 7);
    straight.seek(0.42);

    const through = driverFor(model, 7);
    through.seek(1);
    through.seek(0.42);

    expect(stood(through)).toEqual(stood(straight));
  });

  it("starts a seek at the checkpoint rather than replaying the run from zero", () => {
    const driver = driverFor(system(emitter()), 7);
    driver.seek(1);
    const late = driver.histogram.counts(0)[55];
    expect(late).toBeGreaterThan(0);

    driver.seek(0.42);

    /* A rewind clears the lanes, and a restore leaves the bins past the checkpoint. */
    expect(driver.histogram.counts(0)[55]).toBe(late);
  });

  it("puts a seek through a checkpoint where a seek from zero puts it across a loop wrap", () => {
    const straight = driverFor(system(brief), 5);
    straight.steer(LOOPING);
    straight.seek(1.3);

    const through = driverFor(system(brief), 5);
    through.steer(LOOPING);
    through.seek(2);
    through.seek(1.3);

    expect(straight.pool.count).toBeGreaterThan(0);
    expect(stood(through)).toEqual(stood(straight));
  });

  it("puts a seek through a checkpoint where a seek from zero puts it across a death spawn", () => {
    const model = system(parent({ childSet: childSet({ onDeath: true }) }));
    const straight = driverFor(model, 5);
    straight.seek(0.9);

    const through = driverFor(model, 5);
    through.seek(2);
    through.seek(0.9);
    expect(stood(through, "0.0")).toEqual(stood(straight, "0.0"));

    /* The particle dies past the checkpoint, off the state the checkpoint carried over. */
    for (let at = 0; at < 30; at += 1) {
      straight.advance(1 / 60);
      through.advance(1 / 60);
    }

    expect(through.sources("0.0")).toHaveLength(1);
    expect(stood(through, "0.0")).toEqual(stood(straight, "0.0"));
  });

  it("drops the checkpoints when an edit swaps the definition", () => {
    const first = system(emitter({ birthVelocity: constant(0, 100, 0) }));
    const next = system(emitter({ birthVelocity: constant(100, 0, 0) }));
    const edited = driverFor(first, 7);
    edited.seek(1);
    edited.swap(next);
    edited.seek(0.42);

    const fresh = driverFor(next, 7);
    fresh.seek(0.42);

    expect(stood(edited)).toEqual(stood(fresh));
  });

  it("drops the checkpoints when the rig is tuned", () => {
    const flight = { kind: "path", from: [0, 0, 0], to: [1000, 0, 0], speed: 100 } as const;
    const quick = { motion: { ...flight, speed: 400 }, life: "once", height: 0 } as const;
    const model = system(emitter());

    const steered = driverFor(model, 7);
    steered.steer({ motion: flight, life: "once", height: 0 });
    steered.seek(1);
    steered.steer(quick);
    steered.seek(0.42);

    const fresh = driverFor(model, 7);
    fresh.steer(quick);
    fresh.seek(0.42);

    expect(stood(steered)).toEqual(stood(fresh));
  });
});

describe("the lanes' histogram", () => {
  it("counts the live particles at the bin each step lands in", () => {
    const driver = driverFor(system(emitter()), 7);
    driver.seek(1);
    const { histogram } = driver;

    expect(histogram.bin).toBeCloseTo(1 / 60, 10);
    expect(histogram.bins).toBe(360);
    expect(histogram.counts(0)).toHaveLength(histogram.bins);
    /* A step is binned on the phase it ends at, which a second of 60 steps lands at bin 60. */
    expect(histogram.reached).toBe(60);
    expect(histogram.counts(0)[30]).toBeGreaterThan(0);
    expect(histogram.counts(0)[histogram.reached]).toBe(driver.pool.count);
    expect(histogram.counts(0)[histogram.reached + 1]).toBe(0);
  });

  it("follows the clock with the bin it has reached, and starts the pass over on a wrap", () => {
    const brief = emitter({ lifetime: 0.3, particleLifetime: constant(0.2) });
    const driver = driverFor(system(brief), 5);
    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });

    driver.seek(0.9);
    expect(driver.histogram.bins).toBe(60);
    expect(driver.histogram.reached).toBeGreaterThan(50);

    driver.seek(1.05);
    expect(driver.histogram.reached).toBeLessThan(5);
  });

  it("clears the lanes when an edit swaps the definition", () => {
    const driver = driverFor(system(emitter()), 7);
    driver.seek(1);
    expect(driver.histogram.counts(0)[59]).toBeGreaterThan(0);

    driver.swap(system(emitter({ lifetime: 0.5 })));

    expect(driver.histogram.counts(0)[59]).toBe(0);
    expect(driver.histogram.reached).toBe(-1);
  });
});

describe("the births log", () => {
  const embers = system(emitter({ name: "ember", rate: constant(30) }));

  /** One particle carrying a child system, which the log names once it spawns. */
  const parent = emitter({
    rate: constant(1),
    lifetime: 0.1,
    particleLifetime: constant(1),
    childSet: {
      children: [embers],
      bones: [],
      probability: constant(0),
      onDeath: false,
      inheritance: null,
    },
  });

  it("names the child a run spawned, and empties on a restart", () => {
    const driver = driverFor(system(parent), 5);
    driver.seek(0.5);

    expect(driver.births()).toHaveLength(1);
    const [birth] = driver.births();
    expect(birth.path).toBe("0.0");
    expect(birth.emitter).toBe(0);
    expect(birth.slot).toBe(0);
    expect(birth.depth).toBe(1);
    expect(birth.bornAt).toBeGreaterThan(0);
    expect(birth.bornAt).toBeLessThan(0.1);

    driver.restart();

    expect(driver.births()).toHaveLength(0);
  });

  it("starts the log over on a loop wrap", () => {
    const driver = driverFor(system(parent), 5);
    driver.steer({ motion: { kind: "still" }, life: "loop", height: 0 });

    driver.seek(0.5);
    expect(driver.births()).toHaveLength(1);

    driver.seek(1.5);
    expect(driver.births()).toHaveLength(1);
  });
});
