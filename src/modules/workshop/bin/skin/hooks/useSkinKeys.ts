import type { RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ignoredKey } from "../../vfx/playback/utils/ignoredKey";
import { SKIN_KEYS, skinKeyOf, type SkinKeyTarget } from "../utils/skinKeys";

const HOTKEYS = Object.values(SKIN_KEYS)
  .map((key) => key.hotkey)
  .join(", ");

/**
 * Answers the keys of `SKIN_KEYS` while focus is inside the box the returned ref is on.
 *
 * The box contains the preview and its transport, and takes focus, so a click on bare preview
 * arms the keys and a press on a transport control keeps them.
 */
export function useSkinKeys(target: SkinKeyTarget): RefObject<HTMLDivElement | null> {
  return useHotkeys<HTMLDivElement>(
    HOTKEYS,
    (_, handler) => skinKeyOf(handler.hotkey)?.run(target),
    { preventDefault: true, ignoreEventWhen: ignoredKey },
    [target],
  );
}
