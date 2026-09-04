import { useEffect, useRef, useState } from "react";

import type { DropSlot } from "@/modules/library/utils";

/** Matches the drop line's own transition, so it is gone once it has faded. */
const EXIT_MS = 120;

export interface LingeringSlot {
  /** The gap to draw the line in, held past the moment it stops being the target. */
  slot: DropSlot | null;
  /** False while the line is leaving, which is what fades it out. */
  visible: boolean;
}

/**
 * Hold the last drop gap so the line can fade rather than cut.
 *
 * One list holds one line. Letting each card linger on its own put two on
 * screen at once whenever the pointer crossed between them, which read as a
 * second target rather than as one handing over to the next.
 */
export function useLingeringSlot(slot: DropSlot | null): LingeringSlot {
  const [held, setHeld] = useState<DropSlot | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (slot) {
      shown.current = true;
      setHeld(slot);
      return;
    }
    if (!shown.current) return;

    shown.current = false;
    const timer = setTimeout(() => setHeld(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [slot]);

  return { slot: held, visible: slot !== null };
}
