import { ArrowUpIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { Breadcrumb, Count, EmptyState, IconButton, LoadingState } from "@/components";
import { m } from "@/i18n";
import type { ObjectDirListing } from "@/lib/tauri";

import { GameWadsErrorState } from "../../gameBrowser/components/GameBrowserStates";
import { useObjectsReveal, useSettleObjectsReveal } from "../../state";
import { useObjectDir } from "../api/useObjectDir";
import { useWarmOnAbsent } from "../api/useObjectIndex";
import { useLayerDeclarations } from "../hooks/useLayerDeclarations";
import { useProjectObjects } from "../hooks/useProjectObjects";
import { ancestorPrefixes } from "../utils/objectTree";
import { holdsOnlyUnnamed, objectListingNodes } from "../utils/objectTree";
import { holdsProjectObjects, withProjectObjects } from "../utils/projectObjects";
import {
  ObjectIndexBuildingState,
  ObjectIndexFailedState,
  ObjectIndexUnnamedHint,
} from "./ObjectIndexStates";
import { ObjectsGrid } from "./ObjectsGrid";

const NO_LISTING: ObjectDirListing = { prefixes: [], objects: [] };

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
  const projectObjects = useProjectObjects();
  /* A prefix only the project holds fails to read from the index, and lists the project's alone. */
  const projectOnly = root.isError && holdsProjectObjects(prefix, projectObjects);
  const installed = root.data?.status === "ready" ? root.data.value : undefined;
  const listing = installed ?? (projectOnly ? NO_LISTING : undefined);
  const nodes = useMemo(
    () =>
      listing === undefined
        ? []
        : objectListingNodes(withProjectObjects(prefix, listing, projectObjects), layers),
    [listing, prefix, projectObjects, layers],
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
        {listing !== undefined && (
          <Count>{m.workshop_objects_items_label({ count: nodes.length })}</Count>
        )}
      </div>
      {root.isPending && <LoadingState />}
      {root.isError && !projectOnly && <GameWadsErrorState error={root.error} />}
      {root.data?.status === "failed" && (
        <ObjectIndexFailedState error={root.data.error} onRetry={retry} />
      )}
      {(root.data?.status === "building" || root.data?.status === "absent") && (
        <ObjectIndexBuildingState />
      )}
      {installed !== undefined && holdsOnlyUnnamed(installed) && <ObjectIndexUnnamedHint />}
      {listing !== undefined && nodes.length === 0 && (
        <EmptyState
          size="sm"
          title={m.workshop_objects_none_title()}
          description={m.workshop_objects_none_description()}
        />
      )}
      {listing !== undefined && (
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
