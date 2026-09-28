import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { list, number, struct, valueCurve, vector } from "../../drivers/__tests__/driverFixture";
import { shimmerComponentsOf } from "../shimmerComponents";
import { MAX_SHIMMER_PARTICLES, shimmerCapacity, shimmerParticles } from "../shimmerRun";

function float(value: number): VfxValue {
  return struct("VfxFloatDynamicProperty", {
    Float: struct("VfxFloatConstantDriver", { Float: number(value) }),
  });
}

function vec3(...values: number[]): VfxValue {
  return struct("VfxVector3DynamicProperty", {
    Vector3: struct("VfxVector3ConstantDriver", { Vector3: vector(...values) }),
  });
}

interface Timing {
  readonly behavior?: string;
  readonly duration?: number;
  readonly lifetime?: number;
  readonly delay?: number;
  readonly loopDelay?: number;
  readonly rate?: number;
  readonly burst?: number;
}

function components(timing: Timing, physics: Record<string, VfxValue> = {}): VfxValue {
  const behavior: Record<string, VfxValue> = {
    EmitterDuration: float(timing.duration ?? -1),
    particleLifetime: float(timing.lifetime ?? -1),
  };
  if (timing.delay !== undefined) behavior.startDelay = float(timing.delay);
  if (timing.loopDelay !== undefined) behavior.LoopDelay = float(timing.loopDelay);

  const spawn: Record<string, VfxValue> = {};
  if (timing.rate !== undefined) spawn.EmissionRate = float(timing.rate);
  if (timing.burst !== undefined) spawn["0x10498eed"] = float(timing.burst);

  return struct("VfxComponents", {
    LifetimeComponent: struct("VfxLifetimeComponent", {
      LifetimeBehavior: struct(timing.behavior ?? "0x7015f762", behavior),
      SpawnBehavior: struct("0x31beb841", spawn),
    }),
    PhysicsComponent: struct("VfxModularPhysicsComponent", {
      Modifiers: list(struct("VfxPhysicsSimpleModifier", physics)),
    }),
  });
}

function run(value: VfxValue, time: number) {
  return shimmerParticles(shimmerComponentsOf(value), time, 7);
}

describe("shimmerParticles", () => {
  it("keeps the Hall of Legends burst of one for ever", () => {
    const grid = components({ burst: 1, rate: 0 }, { InitialScale: vec3(10, 10, 10) });

    expect(run(grid, 0)).toHaveLength(1);
    expect(run(grid, 3600)).toHaveLength(1);
    expect(run(grid, 3600)[0]).toMatchObject({ age: 3600, age01: 0, scale: [10, 10, 10] });
  });

  it("spawns one resting particle for an emitter that writes no spawn", () => {
    const [particle] = shimmerParticles(shimmerComponentsOf(null), 2, 7);

    expect(particle).toMatchObject({ position: [0, 0, 0], scale: [1, 1, 1], color: [1, 1, 1, 1] });
  });

  it("streams at its rate and lets each particle die at its lifetime", () => {
    const stream = components({ rate: 2, lifetime: 1, duration: 10 });

    expect(run(stream, 0.25).map((each) => each.age)).toEqual([0.25]);
    expect(run(stream, 2.25).map((each) => each.age)).toEqual([0.75, 0.25]);
    expect(run(stream, 11.5)).toEqual([]);
  });

  it("waits for its start delay", () => {
    const late = components({ burst: 1, delay: 1 });

    expect(run(late, 0.5)).toEqual([]);
    expect(run(late, 1.5)[0]?.age).toBeCloseTo(0.5);
  });

  it("starts over after its duration and loop delay", () => {
    const looping = components({
      behavior: "0xdbb4f634",
      burst: 1,
      duration: 1,
      lifetime: 0.5,
      loopDelay: 1,
    });

    expect(run(looping, 0.25)[0]?.age).toBeCloseTo(0.25);
    expect(run(looping, 1.25)).toEqual([]);
    expect(run(looping, 2.25)[0]?.age).toBeCloseTo(0.25);
  });

  it("moves by its initial velocity under its acceleration", () => {
    const thrown = components(
      { burst: 1 },
      { InitialVelocity: vec3(10, 0, 0), acceleration: vec3(0, -2, 0) },
    );

    expect(run(thrown, 2)[0]?.position).toEqual([20, -4, 0]);
  });

  it("tints by its initial colour times its colour over life", () => {
    const color = (value: VfxValue) =>
      struct("VfxVector4DynamicProperty", {
        Vector4: struct("0x7cc5a312", { colors: value, frequency: number(1) }),
      });
    const tinted = struct("VfxComponents", {
      LifetimeComponent: struct("VfxLifetimeComponent", {
        LifetimeBehavior: struct("0x7015f762", { particleLifetime: float(2) }),
        SpawnBehavior: struct("0x31beb841", { "0x10498eed": float(1) }),
      }),
      RenderComponent: struct("VfxMaterialRenderComponent", {
        Color: struct("VfxColorContainer", {
          InitialColor: color(valueCurve("ValueColor", vector(0.5, 1, 1, 1))),
          ColorOverLife: color(
            valueCurve("ValueColor", vector(1, 1, 1, 1), [
              [0, vector(1, 1, 1, 1)],
              [1, vector(1, 0, 1, 0)],
            ]),
          ),
        }),
      }),
    });

    const [particle] = run(tinted, 1);
    expect(particle?.color[0]).toBeCloseTo(0.5);
    expect(particle?.color[1]).toBeCloseTo(0.5);
    expect(particle?.color[3]).toBeCloseTo(0.5);
  });

  it("caps an endless stream at its newest particles", () => {
    const endless = components({ rate: 100 });

    expect(run(endless, 60)).toHaveLength(MAX_SHIMMER_PARTICLES);
    expect(shimmerCapacity(shimmerComponentsOf(endless))).toBe(MAX_SHIMMER_PARTICLES);
  });

  it("draws the same frame for the same time", () => {
    const stream = components({ rate: 5, lifetime: 2 });

    expect(run(stream, 4.3)).toEqual(run(stream, 4.3));
  });
});
