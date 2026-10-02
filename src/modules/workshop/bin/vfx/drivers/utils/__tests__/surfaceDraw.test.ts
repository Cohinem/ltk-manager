import { Vector2 } from "three";
import { describe, expect, it } from "vitest";

import { COLOR_LOOKUP, LINGER_TYPE } from "../../../engine/model/enums";
import { type ErosionModel, plainUvLayer, type ValueCurve } from "../../../engine/model/model";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { createPool, type Pool } from "../../../engine/simulation/pool";
import { fitInto, followedRow, surfaceAt, surfaceCycle, surfaceDraw } from "../surfaceDraw";

/** A one-channel curve running from `from` at the start of the life to `to` at its end. */
function ramp(from: number, to: number): ValueCurve {
  return {
    constant: [from],
    keys: [
      { time: 0, values: [from] },
      { time: 1, values: [to] },
    ],
    tables: [],
  };
}

function erosion(over: Partial<ErosionModel>): ErosionModel {
  return {
    map: null,
    addressMode: 0,
    mixer: flat(0, 0, 0, 1),
    drive: flat(1),
    lingerDrive: null,
    driveSource: 0,
    featherIn: 0,
    featherOut: 0,
    sliceWidth: 0,
    ...over,
  };
}

describe("surfaceAt", () => {
  it("scrolls and turns the mult layer by its rates over the particle's age", () => {
    const emitter = emitterOf(0, {
      particleLifetime: flat(4),
      multUv: { ...plainUvLayer(), birthScrollRate: flat(0.2, 0), birthRotateRate: flat(-20) },
    });
    const out = surfaceDraw();

    surfaceAt(emitter, 2, surfaceCycle(emitter, 0.5), 0.5, out);

    expect(out.mult.offsetU).toBeCloseTo(0.4);
    expect(out.mult.offsetV).toBeCloseTo(0);
    expect(out.mult.turn).toBeCloseTo((-40 * Math.PI) / 180);
    expect(out.base.offsetU).toBeCloseTo(0);
  });

  it("sums an integrated scroll rate over the age", () => {
    const emitter = emitterOf(0, {
      particleLifetime: flat(4),
      uv: { ...plainUvLayer(), scrollRate: flat(0.1, 0.05) },
    });
    const out = surfaceDraw();

    surfaceAt(emitter, 3, surfaceCycle(emitter, 0.5), 0.5, out);

    expect(out.base.offsetU).toBeCloseTo(0.3);
    expect(out.base.offsetV).toBeCloseTo(0.15);
  });

  it("tints by the birth colour times the colour over life", () => {
    const emitter = emitterOf(0, {
      birthColor: flat(1, 0.5, 1, 1),
      color: flat(0.5, 1, 1, 0.5),
    });
    const out = surfaceDraw();

    surfaceAt(emitter, 1, { life: 4, linger: 0 }, 0.5, out);

    expect([...out.color]).toEqual([0.5, 0.5, 1, 0.5]);
  });

  it("scales by the birth scale times the scale over life", () => {
    const emitter = emitterOf(0, { birthScale0: flat(120, 60, 1), scale0: flat(1, 0.5, 1) });
    const out = surfaceDraw();

    surfaceAt(emitter, 1, { life: 4, linger: 0 }, 0.5, out);

    expect([...out.scale]).toEqual([120, 30, 1]);
  });

  it("reads the ramp at the particle's age and drives the erosion over its life", () => {
    const emitter = emitterOf(0, {
      lookupX: COLOR_LOOKUP.lifetime,
      lookupY: COLOR_LOOKUP.birthRandom,
      lookupScales: [0.5, 1],
      lookupOffsets: [0.25, 0],
      erosion: erosion({ drive: ramp(0, 1) }),
    });
    const out = surfaceDraw();

    surfaceAt(emitter, 1, { life: 4, linger: 0 }, 0.3, out);

    expect(out.lookup[0]).toBeCloseTo(0.375);
    expect(out.lookup[1]).toBeCloseTo(0.3);
    expect(out.lookup[2]).toBeCloseTo(0.25);
  });

  it("reads the linger's own curves once the life runs out", () => {
    const emitter = emitterOf(0, {
      lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
      color: flat(1, 1, 1, 1),
      linger: {
        rotation: null,
        scale: null,
        color: flat(1, 0, 0, 1),
        acceleration: null,
        velocity: null,
        drag: null,
      },
      erosion: erosion({ lingerDrive: ramp(0, 1) }),
    });
    const out = surfaceDraw();

    surfaceAt(emitter, 5, { life: 4, linger: 2 }, 0.5, out);

    expect([...out.color]).toEqual([1, 0, 0, 1]);
    expect(out.lookup[2]).toBeCloseTo(0.5);
  });
});

describe("surfaceCycle", () => {
  const lingering = {
    particleLifetime: flat(4),
    particleLinger: 2,
    linger: {
      rotation: null,
      scale: null,
      color: flat(1),
      acceleration: null,
      velocity: null,
      drag: null,
    },
  };

  it("adds the linger a stopped emitter extends its particles by", () => {
    const emitter = emitterOf(0, {
      ...lingering,
      lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterStops,
    });

    expect(surfaceCycle(emitter, 0.5)).toEqual({ life: 4, linger: 2 });
  });

  it("adds none where the linger only caps the life", () => {
    const emitter = emitterOf(0, {
      ...lingering,
      lingerType: LINGER_TYPE.maxLifetimeAfterEmitterDies,
    });

    expect(surfaceCycle(emitter, 0.5)).toEqual({ life: 4, linger: 0 });
  });
});

describe("fitInto", () => {
  it("fits a wide particle across the box", () => {
    const out = new Vector2();

    fitInto(120, 60, 300, 280, out);

    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(150 / 280);
  });

  it("fits a particle of no extent as a square", () => {
    const out = new Vector2();

    fitInto(0, 0, 300, 280, out);

    expect(out.x).toBeCloseTo(280 / 300);
    expect(out.y).toBeCloseTo(1);
  });
});

/** A pool holding one particle per pair, each of emitter `[0]` with serial `[1]`. */
function poolOf(...particles: readonly (readonly [number, number])[]): Pool {
  const pool = createPool(8);
  pool.count = particles.length;
  particles.forEach(([emitter, serial], at) => {
    pool.emitter[at] = emitter;
    pool.serial[at] = serial;
  });
  return pool;
}

describe("followedRow", () => {
  it("picks the emitter's newest particle when it follows none", () => {
    const followed = { serial: -1 };

    expect(followedRow(poolOf([0, 1], [1, 5], [0, 3]), 0, followed)).toBe(2);
    expect(followed.serial).toBe(3);
  });

  it("keeps the followed particle while it lives, wherever its row moved", () => {
    const followed = { serial: 1 };

    expect(followedRow(poolOf([0, 4], [0, 1]), 0, followed)).toBe(1);
    expect(followed.serial).toBe(1);
  });

  it("follows none while the emitter has no particle", () => {
    const followed = { serial: 2 };

    expect(followedRow(poolOf([1, 2]), 0, followed)).toBe(-1);
    expect(followed.serial).toBe(-1);
  });
});
