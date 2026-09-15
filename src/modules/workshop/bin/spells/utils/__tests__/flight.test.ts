import { describe, expect, it } from "vitest";

import type { MissileSpec, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { originAt } from "../../../vfx/engine/model/rig";
import { readVfxSystem } from "../../../vfx/engine/parsing/readVfxSystem";
import { createDriver } from "../../../vfx/engine/simulation/driver";
import { compileFlight, FLIGHT_STEP, flightSampler, measureFlight } from "../flight";

const SPEC: MissileSpec = {
  movement: { kind: "fixedSpeed", speed: 5000 },
  startDelay: null,
  startBone: null,
  targetBone: "r_hand",
  targetHeight: 100,
  initialTargetHeight: 100,
};

function struct(name: string, fields: Record<string, VfxValue>): VfxValue {
  return {
    type: "struct",
    classHash: nameHash(name),
    class: name,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, hash: nameHash(name), value })),
  };
}

function simulation() {
  const emitter = struct("VfxEmitterDefinitionData", {
    rate: struct("ValueFloat", { constantValue: { type: "number", value: 120 } }),
    particleLifetime: struct("ValueFloat", { constantValue: { type: "number", value: 1 } }),
  });
  const root = struct("VfxSystemDefinitionData", {
    complexEmitterDefinitionData: { type: "container", items: [emitter] },
  });
  const parsed = readVfxSystem({
    entry: "0x1",
    name: null,
    classHash: nameHash("VfxSystemDefinitionData"),
    class: "VfxSystemDefinitionData",
    root,
  });
  const system = {
    ...parsed,
    emitters: parsed.emitters.map((emitter) => ({ ...emitter, particleLinger: 100 })),
  };
  const driver = createDriver(1337);
  driver.swap(system);
  const flight = compileFlight(
    { ...SPEC, movement: { kind: "fixedSpeed", speed: 1000 } },
    [0, 100, 0],
    [1000, 100, 0],
  )!;
  driver.steer(flight.rig);
  return { driver, system, flight, sample: flightSampler(driver) };
}

function snapshot(driver: ReturnType<typeof createDriver>) {
  const pool = driver.pool;
  return {
    origin: driver.origin,
    count: pool.count,
    born: pool.born,
    position: [...pool.position.slice(0, pool.count * 3)],
    birthTime: [...pool.birthTime.slice(0, pool.count)],
  };
}

describe("missile flight", () => {
  it("ends when the last particles die instead of waiting through the linger allowance", async () => {
    const { system, flight, driver, sample } = simulation();
    const end = await measureFlight(system, flight, new AbortController().signal);
    expect(end.limited).toBe(false);
    expect(end.duration).toBeGreaterThan(1);
    expect(end.duration).toBeLessThan(2.1);
    sample(end.duration - FLIGHT_STEP);
    expect(driver.pool.count).toBeGreaterThan(0);
    sample(end.duration);
    expect(driver.pool.count).toBe(0);
  });

  it("keeps launch delay on the timeline and cancels obsolete duration scans", async () => {
    const { system, flight } = simulation();
    const signal = new AbortController().signal;
    const end = await measureFlight(system, flight, signal);
    const delayed = await measureFlight(system, { ...flight, delay: 0.5 }, signal);
    expect(delayed.duration).toBeCloseTo(end.duration + 0.5);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(measureFlight(system, flight, cancelled.signal)).rejects.toThrow();
  });
  it("uses Sejuani's written speed between explicit anchors without applying bone heights twice", () => {
    const flight = compileFlight(SPEC, [0, 100, 0], [1000, 100, 0])!;
    expect(flight.duration).toBeCloseTo(0.2);
    expect(flight.delay).toBe(0);
    expect(originAt(flight.rig.motion, 0.1)).toEqual([500, 100, 0]);
    expect(originAt(flight.rig.motion, 1)).toEqual([1000, 100, 0]);
    expect(flight.rig.stopAt).toBeCloseTo(0.2);
  });

  it("uses fixed time and preserves launch delay and a zero-distance endpoint", () => {
    const flight = compileFlight(
      { ...SPEC, movement: { kind: "fixedTime", duration: 2 }, startDelay: 0.5 },
      [0, 0, 0],
      [100, 0, 0],
    )!;
    expect(flight.duration).toBe(2);
    expect(flight.delay).toBe(0.5);
    expect(originAt(flight.rig.motion, 1)).toEqual([50, 0, 0]);
    expect(compileFlight(SPEC, [0, 0, 0], [0, 0, 0])?.rig.stopAt).toBe(0);
  });

  it("rejects missing or invalid rates, unimplemented motion, unbounded runs and tilted paths", () => {
    for (const speed of [null, 0, -1, NaN, Infinity, 0.001])
      expect(
        compileFlight(
          { ...SPEC, movement: { kind: "fixedSpeed", speed } },
          [0, 0, 0],
          [1000, 0, 0],
        ),
      ).toBeNull();
    expect(
      compileFlight({ ...SPEC, movement: { kind: "missing" } }, [0, 0, 0], [1, 0, 0]),
    ).toBeNull();
    expect(compileFlight(SPEC, [0, 1, 0], [1, 0, 0])).toBeNull();
    expect(compileFlight(SPEC, [NaN, 0, 0], [1, 0, 0])).toBeNull();
  });

  it("reconstructs the same particles after irregular frames, backwards seeking and replay", () => {
    const played = simulation();
    for (const time of [0.01, 0.037, 0.21, 0.5, 0.71]) played.sample(time);
    const sought = simulation();
    sought.sample(0.71);
    expect(played.driver.pool.count).toBeGreaterThan(0);
    expect(snapshot(played.driver)).toEqual(snapshot(sought.driver));
    played.sample(0.1);
    played.sample(0.71);
    expect(snapshot(played.driver)).toEqual(snapshot(sought.driver));
    played.sample(0);
    played.sample(0.71);
    expect(snapshot(played.driver)).toEqual(snapshot(sought.driver));
  });

  it("stops emission on arrival even when a frame skips over it", () => {
    const { driver, sample } = simulation();
    sample(1 + FLIGHT_STEP);
    const born = driver.pool.born;
    sample(1.8);
    expect(driver.origin).toEqual([1000, 100, 0]);
    expect(driver.pool.born).toBe(born);
    sample(0.5);
    expect(driver.pool.born).toBeLessThan(born);
  });
});
