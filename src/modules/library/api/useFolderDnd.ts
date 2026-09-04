import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";

import type { LibraryFolder } from "@/lib/tauri";
import {
  applyDropSlot,
  type DropSlot,
  dropSlotFor,
  hasOrderChanged,
  isSameSlot,
  parseSortableFolderId,
  toSortableFolderId,
} from "@/modules/library/utils";

import { useLingeringSlot } from "./useLingeringSlot";
import { useReorderFolders } from "./useMoveMod";

interface UseFolderDndArgs {
  folders: LibraryFolder[];
}

/**
 * Drag state for the folders, marking the gap a drop lands in.
 *
 * The row holds still for the whole drag and a line marks the gap, which is
 * how a mod drag already answers. Shuffling the folders under the pointer was
 * a second order to keep in step with the query cache as well.
 */
export function useFolderDnd({ folders }: UseFolderDndArgs) {
  const reorderFolders = useReorderFolders();

  const folderOrder = useMemo(() => folders.map((f) => toSortableFolderId(f.id)), [folders]);
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<DropSlot | null>(null);

  const activeFolder = activeFolderId ? (folderMap.get(activeFolderId) ?? null) : null;
  const dropLine = useLingeringSlot(dropSlot);

  const handleFolderDragStart = useCallback((event: DragStartEvent) => {
    const folderId = parseSortableFolderId(event.active.id as string);
    if (!folderId) return;
    setActiveFolderId(folderId);
    setDropSlot(null);
  }, []);

  const handleFolderDragOver = useCallback(
    (event: DragOverEvent) => {
      const activeId = event.active.id as string;
      if (!parseSortableFolderId(activeId)) return;

      const overId = event.over?.id as string | undefined;
      const overFolder = overId ? parseSortableFolderId(overId) : null;
      const next = overFolder ? dropSlotFor(folderOrder, activeId, overId as string) : null;

      setDropSlot((prev) => (isSameSlot(prev, next) ? prev : next));
    },
    [folderOrder],
  );

  const handleFolderDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = event.active.id as string;
      const slot = dropSlot;
      setActiveFolderId(null);
      setDropSlot(null);
      if (!slot) return;

      const next = applyDropSlot(folderOrder, activeId, slot);
      if (!hasOrderChanged(next, folderOrder)) return;

      const folderIds = next
        .map((sortableId) => parseSortableFolderId(sortableId))
        .filter(Boolean) as string[];
      reorderFolders.mutate(folderIds);
    },
    [dropSlot, folderOrder, reorderFolders],
  );

  const handleFolderDragCancel = useCallback(() => {
    setActiveFolderId(null);
    setDropSlot(null);
  }, []);

  return {
    folderOrder,
    activeFolder,
    activeFolderId,
    dropSlot,
    dropLine,
    handleFolderDragStart,
    handleFolderDragOver,
    handleFolderDragEnd,
    handleFolderDragCancel,
  };
}
