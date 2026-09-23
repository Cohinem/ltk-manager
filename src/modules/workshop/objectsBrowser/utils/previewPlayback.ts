import type { Driver } from "../../bin/vfx/engine/simulation/driver";

const EMPTY_PAUSE_SECONDS = 0.25;

/** Repeated preview runs with a short empty pause after every emitter has had time to start. */
export function createPreviewPlayback(
  driver: Pick<Driver, "advance" | "restart" | "time" | "elapsed" | "pool" | "liveChildren">,
  span: number,
  lastEmissionStart: number,
) {
  let seen = false;
  let empty = 0;

  return (delta: number) => {
    driver.advance(delta);
    const alive = driver.pool.count > 0 || driver.liveChildren() > 0;
    seen ||= alive;
    empty = !alive && seen && driver.elapsed >= lastEmissionStart ? empty + delta : 0;

    if (driver.time >= span || empty >= EMPTY_PAUSE_SECONDS) {
      driver.restart();
      seen = false;
      empty = 0;
    }
  };
}
