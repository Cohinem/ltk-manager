import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useRef } from "react";

import { IconButton, SearchField } from "@/components";
import { m } from "@/i18n";
import { DocumentToolbar, ToolbarOverflow } from "@/modules/editor";
import { twMerge } from "@/utils";

import { GAME_EXPLORER_ID, GameIndexTree, useRefreshGameIndex } from "../../gameBrowser";
import { CollapseAllButton } from "../../shared/components/CollapseAllButton";
import { focusRows } from "../../shared/utils/focusRows";
import { useExplorerFilter, useSetExplorerFilter, useCollapseAllGameDirs } from "../../state";

/**
 * The install's own directories, as the tree the panel is wide enough for.
 *
 * The grid and the details list of the same browser want a surface, so the
 * document keeps them and the panel narrows to what a tree needs. The box here
 * filters the rows already read, where Search reads the whole index.
 */
export function GameIndexView() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const collapseAllGameDirs = useCollapseAllGameDirs();

  return (
    <>
      <DocumentToolbar active>
        <FilterField onCommit={() => focusRows(bodyRef.current)} />
        <ToolbarOverflow>
          <CollapseAllButton onCollapse={collapseAllGameDirs} />
          <RebuildAction />
        </ToolbarOverflow>
      </DocumentToolbar>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        <GameIndexTree />
      </div>
    </>
  );
}

function FilterField({ onCommit }: { onCommit: () => void }) {
  const filter = useExplorerFilter(GAME_EXPLORER_ID);
  const setFilter = useSetExplorerFilter();

  return (
    <SearchField
      value={filter.text}
      onChange={(text) => setFilter(GAME_EXPLORER_ID, { ...filter, text })}
      label={m.workshop_game_files_tree_label()}
      clearLabel={m.workshop_explorer_clear_box_action()}
      onCommit={onCommit}
    />
  );
}

function RebuildAction() {
  const rebuild = useRefreshGameIndex();

  return (
    <IconButton
      icon={
        <ArrowsClockwiseIcon className={twMerge("size-4", rebuild.isPending && "animate-spin")} />
      }
      onClick={() => rebuild.mutate()}
      disabled={rebuild.isPending}
      aria-label={m.workshop_game_rebuild_action()}
      tooltip={m.workshop_game_rebuild_label()}
    />
  );
}
