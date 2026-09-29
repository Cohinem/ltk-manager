import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { autoRig, autoRigKey } from "../../engine/model/autoRig";
import type { SystemModel } from "../../engine/model/model";
import type { RigModel } from "../../engine/model/rig";

/**
 * The rig `system` picks for itself, taken when the system first lands and afterwards only
 * when the run starts over, so an edit never moves the run under the author.
 *
 * `take` adopts a rig an edit asked for, which a restart and a wrap call, and `reset` adopts
 * the one the system asks for now, which Reset to auto calls.
 */
export function useAutoRig(system: SystemModel | null) {
  const wanted = useMemo(() => autoRig(system), [system]);
  const [rig, setRig] = useState<RigModel>(wanted);
  const latest = useRef(wanted);
  latest.current = wanted;

  const landed = system !== null;
  const opened = useRef(false);
  useEffect(() => {
    if (!landed || opened.current) return;

    opened.current = true;
    setRig(latest.current);
  }, [landed]);

  const take = useCallback(() => {
    if (!opened.current) return;

    setRig((held) => (autoRigKey(held) === autoRigKey(latest.current) ? held : latest.current));
  }, []);
  const reset = useCallback(() => setRig(latest.current), []);

  return { rig, take, reset };
}
