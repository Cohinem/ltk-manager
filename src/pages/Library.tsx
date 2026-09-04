import { useEffect, useState } from "react";

import { usePlatformSupport } from "@/hooks";
import {
  DragDropOverlay,
  ImportProgressDialog,
  LibraryContent,
  LibraryToolbar,
  ModHealthSweep,
  SelectionActionBar,
  useFilteredMods,
  useFilterOptions,
  useInstalledMods,
  useLibraryActions,
  useLibraryHotkeys,
  useModFileDrop,
} from "@/modules/library";
import { PatcherUnsupported, usePatcherStatus } from "@/modules/patcher";
import { useLibrarySelectionStore } from "@/stores";

interface LibraryProps {
  folderId?: string;
}

export function Library({ folderId }: LibraryProps = {}) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: platform } = usePlatformSupport();
  const patcherAvailable = platform?.patcherAvailable ?? true;

  const { data: mods = [], isLoading, error } = useInstalledMods();
  const actions = useLibraryActions();
  const isDragOver = useModFileDrop(actions.handleBulkInstallFiles);
  useLibraryHotkeys(actions.handleImportMods);

  const { data: patcherStatus } = usePatcherStatus();
  const isPatcherActive = patcherStatus?.running ?? false;

  const filterOptions = useFilterOptions(mods);
  const visibleMods = useFilteredMods(mods, searchQuery);

  const selectMode = useLibrarySelectionStore((s) => s.selectMode);
  const setOrderedIds = useLibrarySelectionStore((s) => s.setOrderedIds);
  useEffect(() => {
    setOrderedIds(visibleMods.map((m) => m.id));
  }, [visibleMods, setOrderedIds]);

  return (
    <div className="relative flex h-full flex-col">
      <DragDropOverlay visible={isDragOver} />
      {!patcherAvailable && (
        <div className="px-4 pt-3">
          <PatcherUnsupported />
        </div>
      )}
      <LibraryToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        actions={actions}
        isLoading={isLoading}
        isPatcherActive={isPatcherActive}
        filterOptions={filterOptions}
        visibleMods={visibleMods}
      />
      <div className="relative mx-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-900/40">
        <LibraryContent
          mods={mods}
          searchQuery={searchQuery}
          isLoading={isLoading}
          error={error}
          folderId={folderId}
        />
        {selectMode && <SelectionActionBar visibleMods={visibleMods} />}
        <ModHealthSweep />
      </div>
      <ImportProgressDialog
        open={actions.importDialogOpen}
        onClose={actions.handleCloseImportDialog}
        progress={actions.installProgress}
        result={actions.importResult}
      />
    </div>
  );
}
