import type { SceneClock } from "@/modules/viewport";

import type { Driver } from "../../vfx/engine/simulation/driver";

/** The last jump of the scene's clock a follower replayed to. */
export interface Following {
  generation: number;
}

/**
 * `time` folded into the clip's first pass, and zero where the skin stands in its bind pose.
 *
 * The pose repeats every pass, so a folded clock draws the same frame, and a follower that
 * joins replays one pass at most rather than everything the clock has run.
 */
export function foldedTime(time: number, duration: number): number {
  return duration > 0 ? time % duration : 0;
}

/** A follower that has replayed nothing, so its first frame replays to wherever the clock is. */
export function following(): Following {
  return { generation: -1 };
}

/**
 * Bring `driver` to `clock`'s time: a replay across a jump of the clock, a step otherwise.
 *
 * A seek replays from zero, so a scrub of the clip reaches what playing it reaches, per
 * decision 2.6 of docs/plans/vfx-particle-renderer.md.
 */
export function followClock(
  driver: Pick<Driver, "time" | "advance" | "seek">,
  clock: Pick<SceneClock, "time" | "generation">,
  followed: Following,
): void {
  if (followed.generation !== clock.generation) {
    followed.generation = clock.generation;
    driver.seek(clock.time);
    return;
  }
  driver.advance(clock.time - driver.time);
}

/**
 * Bring `driver` to where a cue firing `at` seconds into a pass of `duration` stands at
 * `clock`'s time, and answer whether the cue has fired this pass.
 *
 * The run's own time is the pass's time past the cue, so the pass starting over stands
 * the driver back before its first frame, and a clock that lands past the cue replays
 * to it as [`followClock`] replays a jump. A driver that has not fired is put back to
 * zero once and left there.
 */
export function followCue(
  driver: Pick<Driver, "time" | "advance" | "seek" | "restart">,
  clock: Pick<SceneClock, "time" | "generation">,
  followed: Following,
  at: number,
  duration: number,
): boolean {
  const local = foldedTime(clock.time, duration) - at;
  if (local < 0) {
    if (driver.time > 0) driver.restart();
    /* The next fire replays to its frame, so the first step is the seek's own and not the
       whole wait spent in one. */
    followed.generation = following().generation;
    return false;
  }
  if (followed.generation !== clock.generation || local < driver.time) {
    followed.generation = clock.generation;
    driver.seek(local);
    return true;
  }
  driver.advance(local - driver.time);
  return true;
}
