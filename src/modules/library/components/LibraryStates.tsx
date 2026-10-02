import { DownloadSimpleIcon } from "@phosphor-icons/react";

import { Button, EmptyState, ErrorState, Skeleton } from "@/components";
import { m } from "@/i18n";
import type { AppError } from "@/lib/tauri";
import { useLibraryActions } from "@/modules/library/api";
import { hasErrorCode } from "@/utils/errors";

export function LibraryLoadingState() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-min-w,240px),var(--card-max-w,320px)))] justify-center gap-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-surface-700 bg-surface-800 p-4"
        >
          <Skeleton height="10rem" rounded />
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="0.75rem" width="40%" />
        </div>
      ))}
    </div>
  );
}

export function LibraryErrorState({ error }: { error: AppError }) {
  if (hasErrorCode(error, "SCHEMA_VERSION_TOO_NEW")) {
    return <ErrorState error={error} tone="warning" showCode={false} />;
  }

  return <ErrorState error={error} title={m.library_load_failed_title()} />;
}

interface LibraryEmptyStateProps {
  hasSearch: boolean;
  hasFilters: boolean;
}

export function LibraryEmptyState({ hasSearch, hasFilters }: LibraryEmptyStateProps) {
  const actions = useLibraryActions();

  if (hasSearch || hasFilters) {
    return (
      <EmptyState
        title="No mods found"
        description={hasFilters ? "Try adjusting your filters" : "Try adjusting your search query"}
      />
    );
  }

  return (
    <EmptyState
      icon={<DownloadSimpleIcon className="size-16" />}
      title="No mods installed"
      description="Get started by importing your first mod"
      action={
        <Button
          variant="filled"
          onClick={actions.handleImportMods}
          left={<DownloadSimpleIcon weight="bold" className="size-4" />}
        >
          Import Mods
        </Button>
      }
    />
  );
}
