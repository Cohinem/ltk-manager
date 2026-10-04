import { sampleTakeInto, type Take, TAKE_FLOATS } from "../../dynamics/take";
import { LOCAL_FLOATS, type Pose, poseOf } from "./pose";

/** The joints a live simulation holds: their slots, and the local transform of every joint. */
export interface LiveJoints {
  readonly slots: Int32Array;
  /** `LOCAL_FLOATS` a joint, which the simulation writes anew at each step. */
  readonly locals: Float32Array;
}

/** A pose whose simulated joints are read from a baked pass, which its owner swaps. */
export interface SimulatedPose extends Pose {
  /** The pose the pass was baked over, which the joints outside the take keep. */
  readonly base: Pose;
  /** The pass sampled, and null while none is baked, which leaves `base` as it is. */
  readonly take: Take | null;
  /**
   * Sample `take` from now on. The pose stays the same object, so a clock that follows it
   * does not start over and an effect riding one of its joints is not rebuilt.
   */
  setTake(take: Take | null): void;
  /**
   * Read the simulated joints from `live` in place of the take, and from the take again
   * for null. A live simulation answers one moment, the last it stepped to, whatever time
   * is asked.
   */
  setLive(live: LiveJoints | null): void;
  /** Say that the live joints were stepped, so the pose composes them again. */
  touch(): void;
}

/**
 * `base` with the joints a baked pass holds read from that pass.
 *
 * "A simulated pose is a baked pass" in docs/plans/pose-dynamics-preview.md. Every read is
 * a sample of the pass, so the pose stays a function of time as ADR-0035 asks of one: a
 * seek, a scrub and a particle that poses by age all read the same frames. A live
 * simulation is the one exception, and it holds only while a reader moves the unit.
 */
export function simulatedPose(base: Pose): SimulatedPose {
  let take: Take | null = null;
  let live: LiveJoints | null = null;
  let revision = 0;

  const localsInto = (time: number, out: Float32Array): Float32Array => {
    base.localsInto(time, out);

    if (live !== null) {
      const { slots, locals } = live;

      for (let index = 0; index < slots.length; index += 1) {
        const from = slots[index] * LOCAL_FLOATS;

        for (let at = from; at < from + TAKE_FLOATS; at += 1) {
          out[at] = locals[at];
        }
      }

      return out;
    }

    return take === null ? out : sampleTakeInto(take, time, out);
  };

  const pose = poseOf(base.skeleton, base.duration, localsInto, () => revision);

  return {
    ...pose,
    base,
    get take() {
      return take;
    },
    setTake(next) {
      take = next;
      revision += 1;
    },
    setLive(next) {
      live = next;
      revision += 1;
    },
    touch() {
      revision += 1;
    },
  };
}
