import { GearIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { Button, EmptyState } from "@/components";
import { errorSummary } from "@/i18n";
import type { AppError } from "@/lib/tauri";
import { hasErrorCode } from "@/utils/errors";

import { PaneHint } from "../../shared/components/PaneHint";

/** Why the archive listing failed: no League path yet, or a real error. */
export function GameWadsErrorState({ error }: { error: AppError }) {
  if (hasErrorCode(error, "LEAGUE_NOT_FOUND")) {
    return (
      <EmptyState
        size="sm"
        title="League path not set"
        description="Point the manager at your League install to browse its archives."
        action={
          <Link to="/settings" search={{ focus: "general.leaguePath" }}>
            <Button variant="outline" size="sm" left={<GearIcon className="size-4" />}>
              Open Settings
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState size="sm" title="Failed to read game archives" description={errorSummary(error)} />
  );
}

/** Every entry is a bare hash, which is what an unsynced hash table leaves. */
export function UnknownHashHint() {
  return (
    <PaneHint>
      Hash tables are not downloaded, so files show as hashes. Settings → Cache syncs them.
    </PaneHint>
  );
}
