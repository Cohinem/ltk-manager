import { create } from "zustand";

import type { MediaRepeat } from "../player/soundPlayer";
import { PREVIEW_VOLUME } from "../player/useSoundChannel";

/** The change of the preview volume that one key makes. */
export const VOLUME_STEP = 0.05;

interface PreviewTransportStore {
  /** The gain of the media table, the event tree and the Voice lines view, from 0 to 1. */
  volume: number;
  /** `true` if a preview loops its media until it stops. */
  loop: boolean;
  nudgeVolume: (steps: number) => void;
  toggleLoop: () => void;
}

/*
 * Held for the session and not persisted. The viewport keeps its own volume in the settings, and
 * this one returns to `PREVIEW_VOLUME` on the next start.
 */
const usePreviewTransportStore = create<PreviewTransportStore>()((set) => ({
  volume: PREVIEW_VOLUME,
  loop: false,
  nudgeVolume: (steps) =>
    set((state) => ({
      volume: Math.min(
        1,
        Math.max(0, Math.round((state.volume + steps * VOLUME_STEP) * 100) / 100),
      ),
    })),
  toggleLoop: () => set((state) => ({ loop: !state.loop })),
}));

/** Returns the preview volume, from 0 to 1. */
export const usePreviewVolume = () => usePreviewTransportStore((state) => state.volume);

/** Returns how a preview plays its media: once, or looped while Loop is on. */
export const usePreviewRepeat = (): MediaRepeat =>
  usePreviewTransportStore((state) => (state.loop ? "loop" : "once"));

/** Returns the action that moves the preview volume by a count of `VOLUME_STEP`. */
export const useNudgeVolume = () => usePreviewTransportStore((state) => state.nudgeVolume);

/** Returns the action that turns Loop on or off. */
export const useToggleLoop = () => usePreviewTransportStore((state) => state.toggleLoop);
