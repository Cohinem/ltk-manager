/**
 * The rig: how the world carries a system, which its definition does not say.
 *
 * Decision 2.9 in docs/plans/vfx-particle-renderer.md, and ADR-0057.
 */

/* The numbers alone rather than the module barrel, for the reason basis.ts gives. */
// eslint-disable-next-line no-restricted-imports -- the chunk the comment above names
import { CHAMPION_HEIGHT, FORWARD } from "@/modules/viewport/shared/utils/space";

import {
  type FlightTrack,
  flightTrack,
  type MissileFlight,
  type MissileMovementKind,
  trackDirectionAt,
  trackPositionAt,
} from "./missile";

/** A motion and the lifecycle over it, which is what drives one system's origin. */
export interface RigModel {
  readonly motion: Motion;
  readonly life: RigLife;
  /**
   * How far off the ground the origin stands, in engine units.
   *
   * Zero for a rig that stands still, as every other preview stands a system on the ground,
   * so a ground-layer emitter and its siblings share one origin. ADR-0057.
   */
  readonly height: number;
  /**
   * Seconds into the run the system is soft-stopped, as `VfxSystem_Stop` does, and
   * none for a run that plays out.
   *
   * A stop is what the game issues when a buff ends, and it is what the linger of
   * `kMaxLifetimeAfterEmitterDies` and `kFixedLifetimeAfterEmitterDies` waits on.
   */
  readonly stopAt?: number | null;
  /** The skeleton a set's `boneToSpawnAt` resolves on, and none for a rig carrying no character. */
  readonly joints?: Joints | null;
}

/** A point in the engine's own space and units, which is the space the pool holds. */
export type Point = readonly [number, number, number];

/**
 * Something outside the system that moves and turns with time, such as a posed joint.
 *
 * Both reads are pure functions of time, so a seek that replays the run reaches the same
 * places a play did.
 */
export interface Anchor {
  /** Where the anchor stands at `time`, in the engine's space. */
  originAt(time: number): Point;
  /** How the anchor is turned at `time`, a row-major basis, into `out`. */
  basisInto(time: number, out: Float32Array): Float32Array;
}

/** A lookup from a bone name to its anchor, null for a name the skeleton has no joint for. */
export type Joints = (name: string) => Anchor | null;

/**
 * Where the system's origin stands over one run.
 *
 * A bone rides its anchor at the run's own phase, so it runs once beside the clock that
 * poses the anchor.
 */
export type Motion =
  | {
      readonly kind: "still";
      /** Where the beam target stands, before the rig's height, and `TARGET_REACH` along `FORWARD` where unset. */
      readonly target?: Point;
    }
  | {
      readonly kind: "missile";
      /** Where the missile launches, on the ground. The rig's height lifts it. */
      readonly from: Point;
      /** Where it aims, on the ground: the target point, or the centre a circle turns about. */
      readonly to: Point;
      readonly flight: MissileFlight;
    }
  | {
      readonly kind: "bone";
      readonly anchor: Anchor;
      readonly target: Anchor | null;
      /** The clip the joint plays, in seconds, which a run on it replays on, and none for the system's own span. */
      readonly period?: number | null;
    };

/**
 * Whether a run plays through once, starts over from its beginning, or plays on for as
 * long as a seek reaches without ever starting over.
 */
export type RigLife = "once" | "loop" | "continuous";

/** How long a continuous run lasts, in seconds, which is as far as a seek replays. */
export const CONTINUOUS_RUN = 60;

/** The world's own origin, where a system that nothing moves stands. */
const ORIGIN: Point = [0, 0, 0];

/** How far a missile rig travels, and how far from its centre a circling one turns, in engine units. */
export const FLIGHT_RANGE = CHAMPION_HEIGHT * 6;

/** How fast a missile rig flies, in engine units a second: the median `mSpeed` of shipped missiles. */
export const FLIGHT_SPEED = 1800;

/** How high a missile rig launches its system, where a cast leaves the caster's hand. */
export const FLIGHT_HEIGHT = CHAMPION_HEIGHT / 2;

/** How far ahead a rig that flies nowhere aims, in engine units. */
const TARGET_REACH = CHAMPION_HEIGHT * 3;

/**
 * A missile motion over `distance` units, laid out for `flight`'s movement.
 *
 * A straight or curved flight crosses the origin, so an effect that is only itself in flight
 * is on screen for the whole run. A circle turns about the origin at `distance`.
 */
export function missileMotion(flight: MissileFlight, distance = FLIGHT_RANGE): Motion {
  if (circles(flight.movement.kind)) {
    return { kind: "missile", from: [distance, 0, 0], to: [0, 0, 0], flight };
  }

  return { kind: "missile", from: [-distance / 2, 0, 0], to: [distance / 2, 0, 0], flight };
}

/** Returns true if a movement of `kind` turns about its target rather than flying to it. */
export function circles(kind: MissileMovementKind): boolean {
  return kind === "circle" || kind === "syncCircle";
}

/** The flight a missile rig starts on: a straight line at `FLIGHT_SPEED`, pitched along its travel. */
export const FIRST_FLIGHT: MissileFlight = {
  movement: { kind: "fixedSpeed", speed: FLIGHT_SPEED },
  height: null,
  facing: "matchVelocity",
  endAtLaunchHeight: true,
  targetOffset: 0,
};

/** What carries a system, the half of a rig that places its origin. ADR-0057. */
export type Carrier = "ground" | "bone" | "missile";

/** When a run starts over, the other half of a rig. */
export type Playback = "once" | "replay" | "continuous";

/** The carriers an author picks between. Bone comes only from a skin, which holds its joints. */
export const PICKED_CARRIERS: readonly Exclude<Carrier, "bone">[] = ["ground", "missile"];

export const PLAYBACKS: readonly Playback[] = ["once", "replay", "continuous"];

/** Where a rig came from, which the pill names. */
export type RigSource =
  | {
      readonly kind: "auto";
      /** The spell whose missile the system flies, and none for a rig picked from the system alone. */
      readonly spell?: string | null;
    }
  | { readonly kind: "template"; readonly name: string }
  | { readonly kind: "context"; readonly label: string }
  | { readonly kind: "custom" };

/** A rig and where it came from. */
export interface RigChoice {
  readonly source: RigSource;
  readonly rig: RigModel;
}

/** The rig that stands on the ground and plays once, which a driver starts on. */
export const GROUND_RIG: RigModel = { motion: { kind: "still" }, life: "once", height: 0 };

/** The rig a driver starts on and a thumbnail draws with. */
export const FIRST_RIG: RigChoice = { source: { kind: "auto" }, rig: GROUND_RIG };

/** The carrier a motion is. */
export function carrierOf(motion: Motion): Carrier {
  switch (motion.kind) {
    case "still":
      return "ground";
    case "missile":
      return "missile";
    case "bone":
      return "bone";
  }
}

/** The playback a lifecycle is. */
export function playbackOf(life: RigLife): Playback {
  return life === "loop" ? "replay" : life;
}

/** The motion and the height a carrier starts on when an author picks it. */
function carried(carrier: Exclude<Carrier, "bone">): Pick<RigModel, "motion" | "height"> {
  switch (carrier) {
    case "ground":
      return { motion: { kind: "still" }, height: 0 };
    case "missile":
      return { motion: missileMotion(FIRST_FLIGHT), height: FLIGHT_HEIGHT };
  }
}

/** The height a rig's own carrier starts on, zero for a bone, which its joint places. */
function carriedHeight(motion: Motion): number {
  const carrier = carrierOf(motion);
  return carrier === "bone" ? 0 : carried(carrier).height;
}

/**
 * `rig` moved onto `carrier`, keeping its playback, its stop and any height the author tuned
 * away from its old carrier's own.
 */
export function withCarrier(rig: RigModel, carrier: Exclude<Carrier, "bone">): RigModel {
  const next = carried(carrier);
  const tuned = rig.height !== carriedHeight(rig.motion);

  return {
    motion: next.motion,
    life: rig.life,
    height: tuned ? rig.height : next.height,
    stopAt: rig.stopAt ?? null,
    joints: rig.joints ?? null,
  };
}

/** `rig` played back as `playback`. */
export function withPlayback(rig: RigModel, playback: Playback): RigModel {
  return { ...rig, life: playback === "replay" ? "loop" : playback };
}

/**
 * Where the origin stands `time` seconds into a run, `height` off the ground.
 *
 * A missile launches at `height` and its flight sets every height after that.
 */
export function originAt(motion: Motion, time: number, height = 0): Point {
  if (motion.kind === "missile") return trackPositionAt(trackOf(motion, height), time);
  return lifted(pathAt(motion, time), height);
}

const TRACKS = new WeakMap<Motion, Map<number, FlightTrack>>();

/** Returns the simulated flight of `motion` launched at `height`, made once per motion and height. */
export function trackOf(motion: MissileMotion, height: number): FlightTrack {
  let byHeight = TRACKS.get(motion);
  if (byHeight === undefined) {
    byHeight = new Map();
    TRACKS.set(motion, byHeight);
  }

  let track = byHeight.get(height);
  if (track === undefined) {
    const { flight, from, to } = motion;
    track = flightTrack({ flight, from, to, launchHeight: height });
    byHeight.set(height, track);
  }
  return track;
}

/** A missile motion. */
export type MissileMotion = Extract<Motion, { kind: "missile" }>;

/** Returns where `motion`'s missile aims, at the height its flight resolves the target to. */
function missileTarget(motion: MissileMotion, height: number): Point {
  const { flight, to } = motion;
  const ground = flight.endAtLaunchHeight ? height : 0;
  return [to[0], ground + to[1] + flight.targetOffset, to[2]];
}

/** `point` raised by `height` on the up axis. */
function lifted(point: Point, height: number): Point {
  return height === 0 ? point : [point[0], point[1] + height, point[2]];
}

function pathAt(motion: Motion, time: number): Point {
  switch (motion.kind) {
    case "still":
    case "missile":
      return ORIGIN;

    case "bone":
      return motion.anchor.originAt(time);
  }
}

/**
 * Where the system aims `time` seconds into a run, which is what a beam reaches for.
 *
 * A missile aims at its target, which a circling one turns about, and a bone at its target
 * joint. A still rig aims at its `target` if it has one. Otherwise a still rig, and a bone
 * with no target, aim `TARGET_REACH` along [`facingAt`], so a beam has a length and runs
 * along the system's local `+Z`.
 */
export function targetAt(motion: Motion, time: number, height = 0): Point {
  switch (motion.kind) {
    case "still":
      return lifted(motion.target ?? ahead(ORIGIN, FORWARD), height);
    case "missile":
      return missileTarget(motion, height);
    case "bone": {
      if (motion.target !== null) return lifted(motion.target.originAt(time), height);
      return lifted(ahead(motion.anchor.originAt(time), facingAt(motion, time)), height);
    }
  }
}

/** Returns the point `TARGET_REACH` from `from` along the unit vector `facing`. */
function ahead(from: Point, facing: Point): Point {
  return [
    from[0] + facing[0] * TARGET_REACH,
    from[1] + facing[1] * TARGET_REACH,
    from[2] + facing[2] * TARGET_REACH,
  ];
}

/**
 * Which way the system faces `time` seconds into a run, a unit vector in the ground plane.
 *
 * A missile faces along its travel, as the engine turns a missile's system. A bone faces
 * along its joint's own `+Z`. A still rig faces its `target`, and [`FORWARD`] if it has none.
 */
export function facingAt(motion: Motion, time: number, height = 0): Point {
  switch (motion.kind) {
    case "still":
      return motion.target === undefined ? FORWARD : flat(motion.target);
    case "missile":
      return flat(missileDirectionAt(motion, time, height));
    case "bone": {
      const basis = motion.anchor.basisInto(time, ANCHOR_BASIS);
      return flat([basis[2], basis[5], basis[8]]);
    }
  }
}

const ANCHOR_BASIS = new Float32Array(9);

/** Returns the unit direction `motion`'s missile travels `time` seconds into its flight, pitch included. */
export function missileDirectionAt(motion: MissileMotion, time: number, height: number): Point {
  return trackDirectionAt(trackOf(motion, height), time);
}

/** Returns whether `motion` has a target that the target handle moves: a still rig or a missile. */
export function retargetable(motion: Motion): boolean {
  return motion.kind === "still" || motion.kind === "missile";
}

/** Returns `motion` aimed at `target`, or null if `motion` is not [`retargetable`]. */
export function retargeted(motion: Motion, target: Point): Motion | null {
  switch (motion.kind) {
    case "still":
      return { kind: "still", target };
    case "missile":
      return { ...motion, to: [target[0], 0, target[2]] };
    default:
      return null;
  }
}

/**
 * Returns the ground point `reach` from the world origin in the direction of `point`.
 *
 * Uses the direction of `point` in the ground plane and drops its height. Returns null if
 * `point` lies on the up axis through the origin.
 */
export function aimedAt(point: Point, reach: number): Point | null {
  const length = Math.hypot(point[0], point[2]);
  if (length === 0) return null;

  return [(point[0] / length) * reach, 0, (point[2] / length) * reach];
}

/** The motion carries its system on a missile's frame. */
export function fliesAsMissile(motion: Motion): boolean {
  return motion.kind === "missile";
}

/** `direction` laid flat as a unit vector, and [`FORWARD`] for one with no reach in the plane. */
function flat(direction: Point): Point {
  const length = Math.hypot(direction[0], direction[2]);
  if (length === 0) return FORWARD;
  return [direction[0] / length, 0, direction[2] / length];
}

/**
 * How far into its own run the rig stands `time` seconds into the simulation.
 *
 * A looping rig wraps rather than counting from wherever it was bound, so the phase is a
 * function of the clock alone and a seek reaches what a play reaches. Anything the rig
 * remembers about when it was picked would be a recording the replay of decision 2.6
 * cannot reproduce.
 */
export function phaseAt(rig: RigModel, time: number, span: number, tail = 0): number {
  if (rig.life !== "loop") return time;

  const length = runLength(rig.motion, span, tail, rig.height);
  return length > 0 ? time % length : time;
}

/**
 * How long one run lasts, which is when a looping rig starts over and what a scrub spans.
 *
 * A missile ends on arrival plus `tail`, because a missile's system is stopped where the
 * missile lands and its particles play out for their linger. A bone on a clip runs one pass of
 * the clip, so a replay lands on the frame it fired on. Every other motion runs for
 * as long as the system itself takes to play out, and so does a missile that never arrives,
 * or that arrives the moment it sets off and would otherwise be a run of no length that a
 * looping rig restarts on every step.
 */
export function runLength(motion: Motion, span: number, tail = 0, height = 0): number {
  if (motion.kind === "missile") {
    const flight = flightTime(motion, height);
    return flight > 0 ? flight + tail : span;
  }
  if (motion.kind === "bone" && motion.period != null && motion.period > 0) return motion.period;

  return span;
}

/**
 * How long one run of `rig` lasts, which the scrub spans: [`runLength`], and for a continuous
 * run the whole of [`CONTINUOUS_RUN`], since it never starts over.
 */
export function runSpan(rig: RigModel, span: number, tail = 0): number {
  const length = runLength(rig.motion, span, tail, rig.height);
  return rig.life === "continuous" ? Math.max(length, CONTINUOUS_RUN) : length;
}

/** How long a missile takes to arrive, and zero for a motion that never arrives. */
export function flightTime(motion: Motion, height = 0): number {
  if (motion.kind !== "missile") return 0;
  return trackOf(motion, height).arrival ?? 0;
}

/** The missile has arrived `time` seconds into its run, which is where the engine stops it. */
export function landed(motion: Motion, time: number, height = 0): boolean {
  const flight = flightTime(motion, height);
  return flight > 0 && time >= flight;
}

/** How far apart two points stand. */
export function distance(from: Point, to: Point): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
}

/** How far, and which way, `to` lies from `from`. */
export function displacement(from: Point, to: Point): Point {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}
