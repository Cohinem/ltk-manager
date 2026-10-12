import type { ReactFlowInstance } from "@xyflow/react";
import { use, useCallback, useEffect, useRef } from "react";

import type { SystemModel } from "../../engine/model/model";
import { childSteps } from "../../engine/simulation/children";
import { useEmitters } from "../../inspector/state/emitterChoice";
import type { ChildChoice } from "../../inspector/utils/emitterTypes";
import { VfxRunContext } from "../../playback/state/run";
import { emitterKeyOf, masterIdOf, useSetHoveredEmitter } from "../state/hoveredEmitter";
import { childSystemIdOf } from "../utils/graphEmitter";
import { GraphActionsContext } from "./graphActions";

/** How long the view takes to reach an emitter chosen outside the graph, in milliseconds. */
const CENTER_DURATION = 300;

interface Selectable {
  readonly id: string;
  readonly selected?: boolean;
}

/**
 * Select and center the master node of the emitter chosen elsewhere: a viewport pick, a
 * timeline lane or the outline. A child lane selects its child system's node.
 *
 * A choice the graph made itself, by selecting that node or a node under it, leaves the view
 * where it is, and so does the choice the graph opens on.
 */
export function useGraphFollowsChoice<Node extends Selectable>(
  nodes: readonly Node[],
  setNodes: (update: (nodes: Node[]) => Node[]) => void,
  flow: ReactFlowInstance,
) {
  const { root, child } = useEmitters();
  const system = use(VfxRunContext)?.system ?? null;
  const master = root === undefined ? null : masterIdOf(root.simple, root.index);
  const wanted = childNodeOf(system, child) ?? master;
  const latest = useRef(nodes);
  latest.current = nodes;
  /* The choice the graph opened on, which the opening fit frames rather than this. */
  const seen = useRef(wanted);

  useEffect(() => {
    if (wanted === null || wanted === seen.current) return;
    seen.current = wanted;

    /* A child system under a folded emitter has no node, and selecting its emitter's node
       instead would open that emitter's card over the child the reader chose. */
    const target = wanted;
    const node = latest.current.find((each) => each.id === target);
    if (node === undefined || node.selected === true) return;

    /* A node picked under the emitter opened its card, which is the graph's own choice. */
    const own = latest.current.some(
      (each) => each.selected === true && each.id.startsWith(`${target}/`),
    );
    if (own) return;

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
  }, [wanted, setNodes, flow]);
}

/** The node of the child system a child lane's emitter belongs to, and null for no child lane. */
function childNodeOf(system: SystemModel | null, child: ChildChoice | null): string | null {
  const [first] = child === null ? [] : childSteps(child.path);
  const parent = system?.emitters.find((each) => each.index === first?.emitter);
  if (first === undefined || parent === undefined) return null;

  return childSystemIdOf(masterIdOf(parent.simple, parent.listIndex), first.slot);
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
