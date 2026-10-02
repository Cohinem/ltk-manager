import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { PageInset } from "@/components";
import { usePlatformSupport } from "@/hooks";
import { m } from "@/i18n";
import type { InstalledMod } from "@/lib/tauri";
import { PlayButton } from "@/modules/launcher";
import {
  DocumentsSidebar,
  DragDropOverlay,
  ImportProgressDialog,
  LibraryContent,
  LibraryDialogs,
  LibraryToolbar,
  ModHealthSweep,
  SelectionActionBar,
  clampDockWidth,
  clampDrawerWidth,
  useBulkUninstallDialog,
  useFilterOptions,
  useInstalledMods,
  useLibraryActions,
  useLibraryHotkeys,
  useLibrarySelectionStore,
  useLibrarySidebarStore,
  useLibraryTableStore,
  useLibraryViewMode,
  useModFileDrop,
  useOpenedModFiles,
  useVisibleMods,
} from "@/modules/library";
import { PatcherUnsupported } from "@/modules/patcher";

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
  useOpenedModFiles(actions.handleBulkInstallFiles);
  useLibraryHotkeys(actions.handleImportMods);

  const filterOptions = useFilterOptions(mods);
  const filteredMods = useVisibleMods(mods, searchQuery, folderId);

  const { viewMode } = useLibraryViewMode();
  const hasSelection = useLibrarySelectionStore((s) => s.selectedIds.size > 0);
  const orderedIds = useLibrarySelectionStore((s) => s.orderedIds);
  const setOrderedIds = useLibrarySelectionStore((s) => s.setOrderedIds);

  /* The table draws its own order, groups and all, and hands that over itself.
     A mod in a collapsed group is not drawn, so it is not visible either. */
  const visibleMods = useMemo(() => {
    if (viewMode !== "table") return filteredMods;
    const drawn = new Set(orderedIds);
    return filteredMods.filter((mod) => drawn.has(mod.id));
  }, [viewMode, filteredMods, orderedIds]);

  useEffect(() => {
    if (viewMode === "table") return;
    setOrderedIds(filteredMods.map((m) => m.id));
  }, [viewMode, filteredMods, setOrderedIds]);

  /* A selection carried off this page would let Uninstall N act on mods the
     reader can no longer see, and a confirmation left standing would come back
     over a list that has moved on. */
  useEffect(
    () => () => {
      useLibrarySelectionStore.getState().clear();
      useBulkUninstallDialog.getState().close();
    },
    [],
  );

  const isInstalling = actions.installMod.isPending || actions.bulkInstallMods.isPending;

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
        filterOptions={filterOptions}
        visibleMods={visibleMods}
        playButton={<PlayButton disabled={isInstalling} />}
      />
      <LibraryBody mods={mods} docked={viewMode === "table"}>
        <LibraryContent
          mods={mods}
          searchQuery={searchQuery}
          isLoading={isLoading}
          error={error}
          folderId={folderId}
        />
        {hasSelection && <SelectionActionBar visibleMods={visibleMods} />}
        <ModHealthSweep />
      </LibraryBody>
      <LibraryDialogs />
      <ImportProgressDialog
        open={actions.importDialogOpen}
        onClose={actions.handleCloseImportDialog}
        progress={actions.installProgress}
        result={actions.importResult}
      />
    </div>
  );
}

/** How far one arrow key moves the edge. */
const KEY_STEP = 16;

/**
 * The library's content, with the documents panel over the grid or beside the table.
 *
 * Over the grid it is a drawer, so the cards keep the positions they were being
 * read in. Beside the table it is a dock that is always open, so the table never
 * reflows under the reader either. Per "The drawer, and what its width does" and
 * "The panel follows the pointer" in `docs/ux/LIBRARY.md`.
 */
function LibraryBody({
  mods,
  docked,
  children,
}: {
  mods: InstalledMod[];
  docked: boolean;
  children: ReactNode;
}) {
  const open = useLibrarySidebarStore((s) => s.open);
  const dockCollapsed = useLibraryTableStore((s) => s.dockCollapsed);

  if (docked) {
    return (
      <div className="flex min-h-0 flex-1">
        <PageInset>{children}</PageInset>
        {!dockCollapsed && <DocumentsDock mods={mods} />}
      </div>
    );
  }

  return <PageInset overlay={open && <DocumentsDrawer mods={mods} />}>{children}</PageInset>;
}

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * The dock beside the table, and the edge a reader drags to share the width.
 *
 * The stored width is what the reader asked for, and a narrower window draws
 * less of it without writing that back.
 */
function DocumentsDock({ mods }: { mods: InstalledMod[] }) {
  const viewport = useSyncExternalStore(subscribeResize, () => window.innerWidth);
  const stored = useLibraryTableStore((s) => s.dockWidth);
  const setWidth = useLibraryTableStore((s) => s.setDockWidth);
  const width = clampDockWidth(stored, viewport);
  const edge = useEdgeDrag(width, (next) => setWidth(clampDockWidth(next, viewport)));

  return (
    <div data-ui="DocumentsDock" style={{ width }} className="relative mr-2 shrink-0">
      <DocumentsSidebar mods={mods} docked />
      <ResizeEdge {...edge} />
    </div>
  );
}

/** Pointer and key handlers for a left edge that resizes the panel to its right. */
function useEdgeDrag(width: number, resize: (next: number) => void) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    drag.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    resize(drag.current.startWidth - (event.clientX - drag.current.startX));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(width + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP));
  }

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onKeyDown: handleKeys,
  };
}

/** The drawer, and the edge a reader drags to decide how much it covers. */
function DocumentsDrawer({ mods }: { mods: InstalledMod[] }) {
  const width = useLibrarySidebarStore((s) => s.width);
  const setWidth = useLibrarySidebarStore((s) => s.setWidth);
  const edge = useEdgeDrag(width, (next) => setWidth(clampDrawerWidth(next, window.innerWidth)));

  return (
    <div
      data-ui="DocumentsDrawer"
      style={{ width }}
      className="animate-drawer-in absolute inset-y-0 right-0 z-20 max-w-full shadow-xl"
    >
      <DocumentsSidebar mods={mods} />
      <ResizeEdge {...edge} />
    </div>
  );
}

/**
 * The draggable left edge of a documents panel.
 *
 * Drawn last, so the tab order is the panel's own content before the one control
 * that only changes the shape of it.
 */
function ResizeEdge(handlers: ReturnType<typeof useEdgeDrag>) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={m.library_documents_resize_action()}
      tabIndex={0}
      {...handlers}
      className="group/handle absolute inset-y-6 left-0 z-10 w-1.5 cursor-col-resize outline-none"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover/handle:bg-accent-500/60 group-focus-visible/handle:bg-accent-500"
      />
    </div>
  );
}
