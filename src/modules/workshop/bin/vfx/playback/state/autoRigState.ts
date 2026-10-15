import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import { type AutoRig, autoRig, autoRigKey } from "../../engine/model/autoRig";
import type { SystemModel } from "../../engine/model/model";
import { vfxQueries } from "../../hooks/useVfxSystem";

/**
 * The rig `system` picks for itself, taken when the system and the spells that fire it first
 * land and afterwards only when the run starts over, so an edit never moves the run under the
 * author.
 *
 * `take` adopts a rig an edit asked for, which a restart and a wrap call, and `reset` adopts
 * the one the system asks for now, which Reset to auto calls. A failed spell lookup counts as
 * no spell.
 */
export function useAutoRig(system: SystemModel | null, document: BinDocumentId, entry: string) {
  const spells = useQuery(vfxQueries.missileSpells(document, entry));
  const wanted = useMemo(() => autoRig(system, spells.data), [system, spells.data]);
  const [held, setHeld] = useState<AutoRig>(wanted);
  const latest = useRef(wanted);
  latest.current = wanted;

  const landed = system !== null && !spells.isPending;
  const opened = useRef(false);
  useEffect(() => {
    if (!landed || opened.current) return;

    opened.current = true;
    setHeld(latest.current);
  }, [landed]);

  const take = useCallback(() => {
    if (!opened.current) return;

    setHeld((kept) => (autoRigKey(kept) === autoRigKey(latest.current) ? kept : latest.current));
  }, []);
  const reset = useCallback(() => setHeld(latest.current), []);

  return { rig: held.rig, spell: held.spell, take, reset };
}
