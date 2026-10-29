import { useFrame } from "@react-three/fiber";
import { useEffect, useState } from "react";

import type { SceneClock } from "@/modules/viewport";

import type { SoundCue } from "../../../audio/utils/soundCue";
import { createSoundFollower, type SoundOutput } from "../../../audio/utils/soundFollower";

export interface SoundCuesProps {
  readonly clock: SceneClock;
  readonly cues: readonly SoundCue[];
  /** Seconds one pass lasts, which the cues fire once in. */
  readonly duration: number;
  readonly output: SoundOutput;
}

/**
 * The sound events of a viewport, fired as its clock plays across them.
 *
 * Mounted inside the canvas, so its frame callback reads the clock after `Clock` spends the
 * frame. A change of the cues stops every kill sound, and an unmount stops them too.
 */
export function SoundCues({ clock, cues, duration, output }: SoundCuesProps) {
  const [follower] = useState(() => createSoundFollower(output, cues, duration));

  useEffect(() => follower.setCues(cues, duration), [follower, cues, duration]);
  useEffect(() => () => follower.stopKills(), [follower]);
  useFrame(() => follower.follow(clock));

  return null;
}
