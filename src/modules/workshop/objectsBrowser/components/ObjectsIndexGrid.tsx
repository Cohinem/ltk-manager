import { ArrowUpIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { Breadcrumb, Count, EmptyState, IconButton, LoadingState } from "@/components";
import { m } from "@/i18n";

import { GameWadsErrorState } from "../../gameBrowser/components/GameBrowserStates";
import { useObjectsReveal, useSettleObjectsReveal } from "../../state";
import { useObjectDir } from "../api/useObjectDir";
import { useWarmOnAbsent } from "../api/useObjectIndex";
import { useLayerDeclarations } from "../hooks/useLayerDeclarations";
import { ancestorPrefixes } from "../utils/objectTree";
import { holdsOnlyUnnamed, objectListingNodes } from "../utils/objectTree";
import {
  ObjectIndexBuildingState,
  ObjectIndexFailedState,
  ObjectIndexUnnamedHint,
} from "./ObjectIndexStates";
import { ObjectsGrid } from "./ObjectsGrid";

interface ObjectsIndexGridProps {
  prefix: string;
  size: number;
  thumbnails: boolean;
  onDescend: (path: string) => void;
  onUp: () => void;
  canGoUp: boolean;
}

/** One lazily loaded prefix of the object index as a grid. */
export function ObjectsIndexGrid({
  prefix,
  size,
  thumbnails,
  onDescend,
  onUp,
  canGoUp,
}: ObjectsIndexGridProps) {
  const root = useObjectDir(prefix);
  const reveal = useObjectsReveal();
  const settle = useSettleObjectsReveal();
  const target =
    reveal !== null && (ancestorPrefixes(reveal.id).at(-1) ?? "") === prefix ? reveal : null;
  const retry = useWarmOnAbsent(root.data?.status);
  const layers = useLayerDeclarations();
  const nodes = useMemo(
    () => (root.data?.status === "ready" ? objectListingNodes(root.data.value, layers) : []),
    [root.data, layers],
  );
  const segments = prefix.split("/").filter(Boolean);
  const crumbs = [
    { id: "", label: m.workshop_objects_title() },
    ...segments.map((label, index) => ({ id: segments.slice(0, index + 1).join("/"), label })),
  ];

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-surface-veil-strong px-2">
        <IconButton
          disabled={!canGoUp}
          onClick={onUp}
          icon={<ArrowUpIcon />}
          aria-label={m.workshop_objects_up_action()}
        />
        <Breadcrumb
          items={crumbs}
          onNavigate={onDescend}
          aria-label={m.workshop_explorer_location_label()}
          className="flex-1"
        />
        {root.data?.status === "ready" && (
          <Count>{m.workshop_objects_items_label({ count: nodes.length })}</Count>
        )}
      </div>
      {root.isPending && <LoadingState />}
      {root.isError && <GameWadsErrorState error={root.error} />}
      {root.data?.status === "failed" && (
        <ObjectIndexFailedState error={root.data.error} onRetry={retry} />
      )}
      {(root.data?.status === "building" || root.data?.status === "absent") && (
        <ObjectIndexBuildingState />
      )}
      {root.data?.status === "ready" && holdsOnlyUnnamed(root.data.value) && (
        <ObjectIndexUnnamedHint />
      )}
      {root.data?.status === "ready" && nodes.length === 0 && (
        <EmptyState
          size="sm"
          title={m.workshop_objects_none_title()}
          description={m.workshop_objects_none_description()}
        />
      )}
      {root.data?.status === "ready" && (
        <ObjectsGrid
          key={prefix}
          nodes={nodes}
          size={size}
          thumbnails={thumbnails}
          onDescend={onDescend}
          onUp={onUp}
          reveal={target}
          onRevealed={settle}
        />
      )}
    </>
  );
}
