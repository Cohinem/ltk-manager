import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Spinner } from "@/components";
import { useContentVisible } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { vfxQueries } from "../../hooks/useVfxSystem";
import { isMaterial, layoutGraph } from "../utils/driverLayout";
import { NO_PENDING, type PendingFields } from "../utils/emitterGraph";
import { listIds, openLists } from "../utils/entryLists";
import { embedSockets } from "../utils/socketEmbed";
import { type GraphItem, type GraphTree, systemGraph } from "../utils/systemGraph";
import { type GraphActions, GraphActionsContext } from "./graphActions";
import { GraphCanvas } from "./GraphCanvas";
import { useTextMeasure } from "./sansFace";

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
  const [pending, setPending] = useState<PendingFields>(NO_PENDING);
  /* An item `embeds` sits in its socket until the reader pops it out to a node. */
  const [popped, setPopped] = useState<ReadonlySet<string>>(NONE);
  const graph = useMemo(
    () => (query.data === undefined ? null : systemGraph(query.data.root, pending)),
    [query.data, pending],
  );
  const tree = useMemo(
    () => (graph === null ? null : embedSockets(graph, popped)),
    [graph, popped],
  );
  /* A master folds to its header and preview and a material to its header until the reader
     opens it, and every other node shows its inputs until the reader folds it. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(NONE);
  const [opened, setOpened] = useState<ReadonlySet<string>>(NONE);
  /* A material's lists open folded too, and Expand all leaves them so. */
  const lists = useMemo(() => (tree === null ? NONE : listIds(tree)), [tree]);
  const firstFolded = useMemo(
    () => (tree === null ? NONE : new Set([...foldedFirst(tree), ...lists])),
    [tree, lists],
  );
  const collapsed = useMemo(
    () => new Set([...folded, ...[...firstFolded].filter((id) => !opened.has(id))]),
    [folded, firstFolded, opened],
  );
  /* The Preview pane holds the viewport until the reader asks for it on the graph. */
  const [previewed, setPreviewed] = useState(false);
  const measure = useTextMeasure();
  const layout = useMemo(
    () =>
      tree === null ? null : layoutGraph(openLists(tree, collapsed), collapsed, previewed, measure),
    [tree, collapsed, previewed, measure],
  );

  const holds = visible && layout !== null && previewed;
  useEffect(() => {
    onPreviewShown(holds);
  }, [holds, onPreviewShown]);
  useEffect(() => () => onPreviewShown(false), [onPreviewShown]);

  const toggleCollapsed = useCallback(
    (id: string) => {
      const toggle = (held: ReadonlySet<string>) => {
        const next = new Set(held);
        if (!next.delete(id)) next.add(id);
        return next;
      };
      if (firstFolded.has(id)) setOpened(toggle);
      else setFolded(toggle);
    },
    [firstFolded],
  );
  const toggleEmbedded = useCallback((id: string) => {
    setPopped((held) => {
      const next = new Set(held);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const collapseAll = useCallback(
    (collapse: boolean) => {
      setFolded(collapse && tree !== null ? collapsible(tree) : NONE);
      setOpened(collapse ? NONE : new Set([...firstFolded].filter((id) => !lists.has(id))));
    },
    [tree, firstFolded, lists],
  );
  const collapseOthers = useCallback(
    (item: GraphItem) => {
      if (tree === null) return;

      if (item.type === "master") {
        setOpened(new Set([item.id]));
        return;
      }
      setFolded((held) => {
        const next = new Set([...held, ...collapsible(tree, item.type)]);
        next.delete(item.id);
        return next;
      });
    },
    [tree],
  );
  const addField = useCallback((master: string, field: string) => {
    setPending((held) => new Map(held).set(master, [...(held.get(master) ?? []), field]));
  }, []);
  const actions = useMemo<GraphActions>(
    () => ({
      document,
      entry,
      viewport,
      collapsed,
      toggleCollapsed,
      toggleEmbedded,
      collapseOthers,
      addField,
      reveal:
        onShowInProperties === undefined
          ? null
          : (wire: string) => onShowInProperties(`${entry}:${wire}`),
    }),
    [
      document,
      entry,
      viewport,
      collapsed,
      toggleCollapsed,
      toggleEmbedded,
      collapseOthers,
      addField,
      onShowInProperties,
    ],
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
      <GraphCanvas
        layout={layout}
        onCollapseAll={collapseAll}
        previews={visible}
        previewed={previewed}
        onPreviewedChange={setPreviewed}
      />
    </GraphActionsContext>
  );
}

/** The masters and the materials of a tree, which open folded. */
function foldedFirst(tree: GraphTree): Set<string> {
  const out = new Set<string>();
  const visit = (node: GraphTree) => {
    const { item } = node;
    if (item.type === "master" || (item.type === "struct" && isMaterial(item))) out.add(item.id);
    node.inputs.forEach((input) => visit(input.tree));
  };
  visit(tree);
  return out;
}

/** The item types that collapse their inputs. */
const FOLDING: ReadonlySet<GraphItem["type"]> = new Set([
  "emitter",
  "component",
  "master",
  "struct",
]);

/** Every item id of a type in `FOLDING` with inputs, or only those of `type`. */
function collapsible(tree: GraphTree, type?: GraphItem["type"]): Set<string> {
  const out = new Set<string>();
  const visit = (node: GraphTree) => {
    const { item } = node;
    const folds = FOLDING.has(item.type);
    if (folds && node.inputs.length > 0 && (type === undefined || item.type === type)) {
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
