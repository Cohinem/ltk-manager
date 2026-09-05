import { SpinnerGapIcon } from "@phosphor-icons/react";

import { Button, EmptyState } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError } from "@/lib/tauri";
import { hasErrorCode } from "@/utils/errors";

import { GameWadsErrorState } from "../gameBrowser/GameBrowserStates";
import { useGameIndex } from "../gameBrowser/useGameIndex";

/**
 * The body of a view waiting on the object index: a spinner over the archive count.
 *
 * Drawn by the objects browser and by the References document, which warm the same
 * index and wait on the same build.
 */
export function ObjectIndexBuildingState() {
  const { data: game } = useGameIndex();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-meta text-surface-400 select-none">
      <SpinnerGapIcon className="h-5 w-5 animate-spin" />
      {game !== undefined && (
        <span>{m.workshop_objects_indexing_label({ count: game.archives })}</span>
      )}
      {game === undefined && <span>{m.workshop_objects_building_label()}</span>}
    </div>
  );
}

/** The build failed. The next warm retries it, and a missing install points at Settings. */
export function ObjectIndexFailedState({
  error,
  onRetry,
}: {
  error: AppError;
  onRetry: () => void;
}) {
  if (hasErrorCode(error, "LEAGUE_NOT_FOUND")) return <GameWadsErrorState error={error} />;
  return (
    <EmptyState
      size="sm"
      title={m.workshop_objects_index_failed_title()}
      description={errorSummary(error)}
      action={
        <Button variant="outline" size="xs" onClick={onRetry}>
          {m.workshop_objects_retry_action()}
        </Button>
      }
    />
  );
}

/** Every object is a bare hash, which is what an unsynced hash table leaves. */
export function ObjectIndexUnnamedHint() {
  return (
    <p className="shrink-0 border-b border-surface-700/50 px-3 py-1.5 text-xs text-surface-400 select-none">
      {m.workshop_objects_unnamed_label()}
    </p>
  );
}
