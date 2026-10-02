import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { type CompiledDriver, compileDriver } from "../drivers/compileDriver";
import type { DriverKind, DriverScope } from "../drivers/node";
import { readDriver } from "../drivers/readDriver";
import { field, flag } from "../parsing/readValue";

const SLOT = {
  lifetime: nameHash("LifetimeComponent"),
  physics: nameHash("PhysicsComponent"),
  render: nameHash("RenderComponent"),
} as const;

const LIFETIME = {
  behavior: nameHash("LifetimeBehavior"),
  spawn: nameHash("SpawnBehavior"),
  emitterDuration: nameHash("EmitterDuration"),
  particleLifetime: nameHash("particleLifetime"),
  startDelay: nameHash("startDelay"),
  loopDelay: nameHash("LoopDelay"),
} as const;

/** The lifetime behaviour that holds a `LoopDelay`, which the other two leave out. */
const LOOPING_BEHAVIOR = "0xdbb4f634";

const SPAWN = {
  emissionRate: nameHash("EmissionRate"),
  /** Unnamed in the schema. `VfxBurstSpawn` pairs it with `SpawnDuration`, so it reads as a count. */
  burstCount: "0x10498eed",
  spawnDuration: nameHash("SpawnDuration"),
} as const;

const PHYSICS = {
  modifiers: nameHash("Modifiers"),
  initialScale: nameHash("InitialScale"),
  keyedScale: nameHash("KeyedScale"),
  uniform: nameHash("IsUniform"),
  initialRotation: nameHash("InitialRotation"),
  initialVelocity: nameHash("InitialVelocity"),
  initialAcceleration: nameHash("InitialAcceleration"),
  acceleration: nameHash("acceleration"),
  worldAcceleration: nameHash("worldAcceleration"),
  localAcceleration: nameHash("LocalAcceleration"),
} as const;

const RENDER = {
  color: nameHash("Color"),
  initialColor: nameHash("InitialColor"),
  colorOverLife: nameHash("ColorOverLife"),
} as const;

/**
 * A shimmer emitter's components as the preview's runtime evaluates them, each dynamic
 * property compiled once.
 *
 * A property the emitter does not write is null, and reads as its default. Physics fields
 * are gathered across every modifier in the list, the first writer of a field winning.
 */
export interface ShimmerComponents {
  /** The lifetime behaviour starts over after `EmitterDuration` and `LoopDelay`. */
  readonly looping: boolean;
  readonly emitterDuration: CompiledDriver | null;
  readonly startDelay: CompiledDriver | null;
  readonly loopDelay: CompiledDriver | null;
  readonly particleLifetime: CompiledDriver | null;
  readonly emissionRate: CompiledDriver | null;
  readonly burstCount: CompiledDriver | null;
  readonly spawnDuration: CompiledDriver | null;
  readonly initialScale: CompiledDriver | null;
  readonly keyedScale: CompiledDriver | null;
  readonly uniformScale: boolean;
  readonly initialRotation: CompiledDriver | null;
  readonly initialVelocity: CompiledDriver | null;
  readonly acceleration: readonly CompiledDriver[];
  readonly initialColor: CompiledDriver | null;
  readonly colorOverLife: CompiledDriver | null;
}

/** The components of `VfxComponents`, read into what the runtime evaluates. */
export function shimmerComponentsOf(components: VfxValue | null): ShimmerComponents {
  const lifetime = field(components, SLOT.lifetime);
  const behavior = field(lifetime, LIFETIME.behavior);
  const spawn = field(lifetime, LIFETIME.spawn);
  const modifiers = modifiersOf(field(field(components, SLOT.physics), PHYSICS.modifiers));
  const color = field(field(components, SLOT.render), RENDER.color);

  const emitter = (holder: VfxValue | null, hash: string) =>
    graph(holder, hash, "float", "emitter");
  const particle = (hash: string, kind: DriverKind) =>
    graph(firstWriter(modifiers, hash), hash, kind, "particle");

  return {
    looping: behavior?.type === "struct" && behavior.classHash === LOOPING_BEHAVIOR,
    emitterDuration: emitter(behavior, LIFETIME.emitterDuration),
    startDelay: emitter(behavior, LIFETIME.startDelay),
    loopDelay: emitter(behavior, LIFETIME.loopDelay),
    particleLifetime: graph(behavior, LIFETIME.particleLifetime, "float", "particle"),
    emissionRate: emitter(spawn, SPAWN.emissionRate),
    burstCount: emitter(spawn, SPAWN.burstCount),
    spawnDuration: emitter(spawn, SPAWN.spawnDuration),
    initialScale: particle(PHYSICS.initialScale, "vec3"),
    keyedScale: particle(PHYSICS.keyedScale, "vec3"),
    uniformScale: flag(field(firstWriter(modifiers, PHYSICS.uniform), PHYSICS.uniform)),
    initialRotation: particle(PHYSICS.initialRotation, "vec3"),
    initialVelocity: particle(PHYSICS.initialVelocity, "vec3"),
    acceleration: [
      PHYSICS.initialAcceleration,
      PHYSICS.acceleration,
      PHYSICS.worldAcceleration,
      PHYSICS.localAcceleration,
    ].flatMap((hash) => particle(hash, "vec3") ?? []),
    initialColor: graph(color, RENDER.initialColor, "vec4", "particle"),
    colorOverLife: graph(color, RENDER.colorOverLife, "vec4", "particle"),
  };
}

function modifiersOf(list: VfxValue | null): readonly VfxValue[] {
  return list?.type === "container" ? list.items : [];
}

function firstWriter(modifiers: readonly VfxValue[], hash: string): VfxValue | null {
  return modifiers.find((modifier) => field(modifier, hash) !== null) ?? null;
}

/** The dynamic property at `hash` of `holder` compiled for `scope`, and null where none is written. */
function graph(
  holder: VfxValue | null,
  hash: string,
  kind: DriverKind,
  scope: DriverScope,
): CompiledDriver | null {
  const value = field(holder, hash);
  if (value === null) return null;
  return compileDriver(readDriver(value, kind, hash).node, { scope });
}
