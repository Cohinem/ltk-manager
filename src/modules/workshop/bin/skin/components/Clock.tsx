import { useFrame } from "@react-three/fiber";

import type { SceneClock } from "@/modules/viewport";

/** `useFrame` runs the lowest priority first, so the clock moves before anything samples it. */
export const BEFORE_THE_SCENE = -1;

/** The scene's clock, spending each frame's time before the scene is sampled. */
export function Clock({
  clock,
  playing,
  speed,
}: {
  clock: SceneClock;
  playing: boolean;
  speed: number;
}) {
  useFrame((_, delta) => {
    if (playing) clock.advance(delta * speed);
  }, BEFORE_THE_SCENE);
  return null;
}
