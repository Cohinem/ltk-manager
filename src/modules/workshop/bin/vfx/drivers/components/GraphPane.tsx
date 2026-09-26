import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Spinner } from "@/components";
import { useContentVisible } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { vfxQueries } from "../../hooks/useVfxSystem";
import { layoutGraph } from "../utils/driverLayout";
import { type GraphTree, systemGraph } from "../utils/systemGraph";
import { type GraphActions, GraphActionsContext } from "./graphActions";
import { GraphCanvas } from "./GraphCanvas";

interface GraphPaneProps {
  document: BinDocumentId;
  /** The system object's entry hash, empty until the view has its roots. */
  entry: string;
  /** What the preview node draws in its viewport box. */
  viewport: ReactNode;
  /** Report whether the pane shows the preview node, which is when it holds the viewport. */
  onPreviewShown: (shown: boolean) => void;
  /** Show a row in Properties, by its row key. Absent where the view offers no Properties. */
  onShowInProperties?: (key: string) => void;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * The shimmer emitters of the open system as one node graph into its live preview.
 *
 * Decision 2.8 of docs/plans/shimmer-driver-graph.md. The graph is read out of the resolved
 * system that `readVfxSystem` answers, the same read the viewport makes.
 */
export function GraphPane({
  document,
  entry,
  viewport,
  onPreviewShown,
  onShowInProperties,
}: GraphPaneProps) {
  const visible = useContentVisible();
  const query = useQuery({ ...vfxQueries.system(document, entry), enabled: entry !== "" });
  const tree = useMemo(
    () => (query.data === undefined ? null : systemGraph(query.data.root)),
    [query.data],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NONE);
  const layout = useMemo(
    () => (tree === null ? null : layoutGraph(tree, collapsed)),
    [tree, collapsed],
  );

  const holds = visible && layout !== null;
  useEffect(() => {
    onPreviewShown(holds);
  }, [holds, onPreviewShown]);
  useEffect(() => () => onPreviewShown(false), [onPreviewShown]);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((held) => {
      const next = new Set(held);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const collapseAll = useCallback(
    (collapse: boolean) => setCollapsed(collapse && tree !== null ? collapsible(tree) : NONE),
    [tree],
  );
  const actions = useMemo<GraphActions>(
    () => ({
      document,
      entry,
      viewport,
      collapsed,
      toggleCollapsed,
      reveal:
        onShowInProperties === undefined
          ? null
          : (wire: string) => onShowInProperties(`${entry}:${wire}`),
    }),
    [document, entry, viewport, collapsed, toggleCollapsed, onShowInProperties],
  );

  if (query.isPending && entry !== "") {
    return (
      <div data-ui="GraphPane" className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (query.error !== null) {
    return (
      <p data-ui="GraphPane" className="p-2 text-meta text-danger-text select-text">
        {errorSummary(query.error)}
      </p>
    );
  }
  if (layout === null) {
    return (
      <p data-ui="GraphPane" className="p-2 text-meta text-surface-400 select-none">
        {m.workshop_bin_graph_empty()}
      </p>
    );
  }

  return (
    <GraphActionsContext value={actions}>
      <GraphCanvas layout={layout} onCollapseAll={collapseAll} />
    </GraphActionsContext>
  );
}

/** Every emitter and component id with inputs, which Collapse all folds. */
function collapsible(tree: GraphTree): Set<string> {
  const out = new Set<string>();
  const visit = (node: GraphTree) => {
    const { item } = node;
    if ((item.type === "emitter" || item.type === "component") && node.inputs.length > 0) {
      out.add(item.id);
    }
    node.inputs.forEach((input) => visit(input.tree));
  };
  visit(tree);
  return out;
}

/** What the Preview pane says while the Graph pane holds the viewport. */
export function PreviewInGraph() {
  return (
    <p
      data-ui="PreviewInGraph"
      className="flex flex-1 items-center justify-center p-2 text-center text-meta text-surface-400 select-none"
    >
      {m.workshop_bin_graph_preview_moved()}
    </p>
  );
}
