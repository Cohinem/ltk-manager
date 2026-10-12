import { use, useEffect, useLayoutEffect, useRef } from "react";

import type { BinRow } from "@/lib/tauri";

import { useCurveChain, useCurveDock } from "../../../curves/state/curveTarget";
import { useEmitters } from "../../inspector/state/emitterChoice";
import type { GraphItem, MasterItem } from "../utils/graphItems";
import { inspectorAim } from "../utils/inspectorAim";
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

/**
 * Show the node picked alone in the inspector: open its emitter's card, unfold the group of
 * the field it is under, and scroll to its row.
 *
 * An emitter node is left to `useCardFollowsPick`. `picked` is null while no node, or more
 * than one, is selected.
 */
export function useInspectorFollowsPick(picked: GraphItem | null, masters: readonly MasterItem[]) {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const { cards, chooseGroup, revealRows } = useEmitters();

  useOnPick(
    picked !== null,
    () => {
      const aim = picked === null ? null : inspectorAim(entry, picked, masters);
      if (aim === null || !cards.some((each) => each.key === aim.card)) return;

      chooseGroup({ key: aim.card, group: aim.group });
      revealRows(aim.rows);
    },
    picked?.id,
  );
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

/**
 * Run the latest `act` each time `picked` turns true, and not on the renders between. `which`
 * names what is picked, for a caller whose pick moves from one thing to another while true.
 */
function useOnPick(picked: boolean, act: () => void, which?: string) {
  const latest = useRef(act);
  useLayoutEffect(() => {
    latest.current = act;
  });

  useEffect(() => {
    if (picked) latest.current();
  }, [picked, which]);
}
