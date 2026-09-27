import type { ReactFlowInstance } from "@xyflow/react";
import { use, useCallback, useEffect, useRef } from "react";

import { useEmitters } from "../../inspector/state/emitterChoice";
import { emitterKeyOf, masterIdOf, useSetHoveredEmitter } from "../state/hoveredEmitter";
import { GraphActionsContext } from "./graphActions";

/** How long the view takes to reach an emitter chosen outside the graph, in milliseconds. */
const CENTER_DURATION = 300;

interface Selectable {
  readonly id: string;
  readonly selected?: boolean;
}

/**
 * Select and center the master node of the emitter chosen elsewhere: a viewport pick, a
 * timeline lane or the outline.
 *
 * A choice the graph made itself, by selecting that node, leaves the view where it is, and so
 * does the choice the graph opens on.
 */
export function useGraphFollowsChoice<Node extends Selectable>(
  nodes: readonly Node[],
  setNodes: (update: (nodes: Node[]) => Node[]) => void,
  flow: ReactFlowInstance,
) {
  const { card } = useEmitters();
  const target = card === undefined ? null : masterIdOf(card.simple, card.index);
  const latest = useRef(nodes);
  latest.current = nodes;
  /* The choice the graph opened on, which the opening fit frames rather than this. */
  const seen = useRef(target);

  useEffect(() => {
    if (target === null || target === seen.current) return;
    seen.current = target;

    const node = latest.current.find((each) => each.id === target);
    if (node === undefined || node.selected === true) return;

    setNodes((each) =>
      each.map((held) =>
        (held.id === target) === (held.selected === true)
          ? held
          : { ...held, selected: held.id === target },
      ),
    );
    const placed = flow.getInternalNode(target);
    if (placed === undefined) return;

    const { x, y } = placed.internals.positionAbsolute;
    const { width = 0, height = 0 } = placed.measured;
    void flow.setCenter(x + width / 2, y + height / 2, {
      zoom: flow.getZoom(),
      duration: CENTER_DURATION,
    });
  }, [target, setNodes, flow]);
}

/** Tell the viewport which emitter the pointer is over, for any node of its group. */
export function useHoverReport(): (id: string | null) => void {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const setHovered = useSetHoveredEmitter();
  useEffect(() => () => setHovered(null), [setHovered]);

  return useCallback(
    (id: string | null) => setHovered(id === null ? null : emitterKeyOf(entry, id)),
    [entry, setHovered],
  );
}
