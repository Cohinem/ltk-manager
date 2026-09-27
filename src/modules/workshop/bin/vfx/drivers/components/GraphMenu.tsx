import {
  ArrowCounterClockwiseIcon,
  ArrowsInIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CopyIcon,
  CornersOutIcon,
  HashIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { use } from "react";

import { ContextMenu } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";

import { itemClass } from "../utils/nodeText";
import type { GraphItem } from "../utils/systemGraph";
import { EmitterMenuItems } from "./EmitterMenuItems";
import { GraphActionsContext } from "./graphActions";

interface GraphMenuProps {
  /** The item the menu opened on, and null for the canvas around the nodes. */
  item: GraphItem | null;
  onFit: () => void;
  /** Fit the view to an item and everything that feeds it. */
  onFrame: (id: string) => void;
  onCollapseAll: (collapsed: boolean) => void;
  /** Put every node back where the layout placed it. */
  onResetLayout: () => void;
}

/**
 * The Graph pane's context menu: a node's own actions, or the canvas's.
 *
 * A node offers Show in properties, framing, collapse and its class, and a master node the
 * emitter clipboard. The canvas offers fitting, collapse for every node, the layout's reset
 * and Paste emitter.
 */
export function GraphMenu(props: GraphMenuProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup data-ui="GraphMenu">
          <MenuItems {...props} />
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

function MenuItems({ item, onFit, onFrame, onCollapseAll, onResetLayout }: GraphMenuProps) {
  if (item !== null) return <ItemActions item={item} onFrame={onFrame} />;

  return (
    <>
      <ContextMenu.Item icon={<CornersOutIcon />} onClick={onFit}>
        {m.workshop_bin_graph_fit_action()}
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item icon={<ArrowsInSimpleIcon />} onClick={() => onCollapseAll(true)}>
        {m.workshop_bin_graph_collapse_all_action()}
      </ContextMenu.Item>
      <ContextMenu.Item icon={<ArrowsOutSimpleIcon />} onClick={() => onCollapseAll(false)}>
        {m.workshop_bin_graph_expand_all_action()}
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item icon={<ArrowCounterClockwiseIcon />} onClick={onResetLayout}>
        {m.workshop_bin_graph_reset_layout_action()}
      </ContextMenu.Item>
      <EmitterMenuItems item={null} />
    </>
  );
}

/** The item types that collapse their inputs. */
const FOLDING: ReadonlySet<GraphItem["type"]> = new Set([
  "emitter",
  "component",
  "master",
  "struct",
]);

function ItemActions({ item, onFrame }: { item: GraphItem; onFrame: (id: string) => void }) {
  const actions = use(GraphActionsContext);
  const copy = useCopyToClipboard();

  const reveal = item.wire === "" ? null : (actions?.reveal ?? null);
  const folds = item.type === "master" || (FOLDING.has(item.type) && item.ports.length > 0);
  const collapsed = actions?.collapsed.has(item.id) ?? false;
  const toggleLabel = collapsed
    ? m.workshop_bin_graph_expand_action()
    : m.workshop_bin_graph_collapse_action();
  const toggleIcon = collapsed ? <ArrowsOutSimpleIcon /> : <ArrowsInSimpleIcon />;
  const held = itemClass(item);
  const className = held?.name ?? null;

  return (
    <>
      {reveal !== null && (
        <ContextMenu.Item icon={<TreeStructureIcon />} onClick={() => reveal(item.wire)}>
          {m.workshop_bin_show_in_properties_action()}
        </ContextMenu.Item>
      )}
      <ContextMenu.Item icon={<CornersOutIcon />} onClick={() => onFrame(item.id)}>
        {m.workshop_bin_graph_frame_action()}
      </ContextMenu.Item>
      {folds && (
        <>
          <ContextMenu.Separator />
          <ContextMenu.Item icon={toggleIcon} onClick={() => actions?.toggleCollapsed(item.id)}>
            {toggleLabel}
          </ContextMenu.Item>
          <ContextMenu.Item icon={<ArrowsInIcon />} onClick={() => actions?.collapseOthers(item)}>
            {m.workshop_bin_graph_collapse_others_action()}
          </ContextMenu.Item>
        </>
      )}
      {item.type === "master" && <EmitterMenuItems item={item} />}
      {held !== null && (
        <>
          <ContextMenu.Separator />
          {className !== null && (
            <ContextMenu.Item
              icon={<CopyIcon />}
              onClick={() => void copy(className, m.workshop_bin_name_label())}
            >
              {m.workshop_bin_copy_class_name_action()}
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            icon={<HashIcon />}
            onClick={() => void copy(held.hash, m.workshop_bin_hash_label())}
          >
            {m.workshop_bin_copy_class_hash_action()}
          </ContextMenu.Item>
        </>
      )}
    </>
  );
}
