import { use, useEffect, useLayoutEffect, useRef } from "react";

import type { BinRow } from "@/lib/tauri";

import { useCurveChain, useCurveDock } from "../../../curves/state/curveTarget";
import { useEmitters } from "../../inspector/state/emitterChoice";
import type { MasterItem } from "../utils/graphItems";
import { GraphActionsContext, useSolePick } from "./graphActions";

/** Open a master node's emitter in the inspector and the outline once it is the sole pick. */
export function useCardFollowsPick(item: MasterItem) {
  const picked = useSolePick(item.id);
  const entry = use(GraphActionsContext)?.entry ?? "";
  const { cards, chooseCard } = useEmitters();

  useOnPick(picked, () => {
    const key = `${entry}:${item.wire}`;
    if (cards.some((each) => each.key === key)) chooseCard(key);
  });
}

/** Aim the curve pane at a value node's row once the node is the sole pick. */
export function useCurveFollowsPick(id: string, row: BinRow | undefined) {
  const { aim } = useCurveDock();
  const chain = useCurveChain(row?.name ?? "");

  /* A pick made before the row is read aims once the read answers. */
  useOnPick(useSolePick(id) && row !== undefined, () => {
    if (row !== undefined) aim({ row, chain });
  });
}

/** Run the latest `act` each time `picked` turns true, and not on the renders between. */
function useOnPick(picked: boolean, act: () => void) {
  const latest = useRef(act);
  useLayoutEffect(() => {
    latest.current = act;
  });

  useEffect(() => {
    if (picked) latest.current();
  }, [picked]);
}
