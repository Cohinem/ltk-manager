import type { SceneClock } from "@/modules/viewport";

import type { Driver, RunEvent } from "../../vfx/engine/simulation/driver";

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
 * Brings `driver` to where a cue firing `at` seconds into a pass of `duration` stands at
 * `clock`'s time, and returns the events that the driver's forward play reported.
 *
 * Returns null if the cue has not fired this pass, which stands the driver back at zero once.
 * The time of the run is the pass's time past the cue. A jump of the clock replays to it as
 * [`followClock`] replays one and returns no event. Forward play across the cue, and a pass that
 * wraps under a cue at zero, start the run over and step it, so the driver reports the start.
 */
export function followCue(
  driver: Pick<Driver, "time" | "advance" | "seek" | "restart">,
  clock: Pick<SceneClock, "time" | "generation">,
  followed: Following,
  at: number,
  duration: number,
): readonly RunEvent[] | null {
  const local = foldedTime(clock.time, duration) - at;
  if (local < 0) {
    if (driver.time > 0) driver.restart();
    followed.generation = clock.generation;
    return null;
  }

  if (followed.generation !== clock.generation) {
    followed.generation = clock.generation;
    driver.seek(local);
    return NO_EVENTS;
  }

  if (local < driver.time) driver.restart();
  return driver.advance(local - driver.time);
}

const NO_EVENTS: readonly RunEvent[] = [];
