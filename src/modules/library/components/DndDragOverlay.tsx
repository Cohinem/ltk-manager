import type { Modifier } from "@dnd-kit/core";
import { DragOverlay } from "@dnd-kit/core";
import { FolderOpen } from "lucide-react";

import type { InstalledMod, LibraryFolder } from "@/lib/tauri";

const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!activatorEvent || !draggingNodeRect) return transform;

  const event = activatorEvent as { clientX?: number; clientY?: number };
  const { clientX, clientY } = event;
  if (typeof clientX !== "number" || typeof clientY !== "number") return transform;

  return {
    ...transform,
    x: transform.x + clientX - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + clientY - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

interface DndDragOverlayProps {
  activeMod: InstalledMod | null;
  activeFolder: LibraryFolder | null;
}

export function DndDragOverlay({ activeMod, activeFolder }: DndDragOverlayProps) {
  return (
    <DragOverlay dropAnimation={null} zIndex={50} modifiers={[snapCenterToCursor]}>
      {activeMod && (
        <div className="flex w-fit max-w-56 cursor-grabbing items-center gap-2 rounded-lg bg-surface-800 px-3 py-1.5 shadow-lg ring-2 ring-accent-500/30">
          <span className="truncate text-sm font-medium text-surface-100">
            {activeMod.displayName}
          </span>
        </div>
      )}
      {activeFolder && (
        <div className="flex w-fit max-w-56 cursor-grabbing items-center gap-2 rounded-lg bg-surface-800 px-3 py-1.5 shadow-lg ring-2 ring-accent-500/30">
          <FolderOpen className="size-4 shrink-0 text-accent-400" />
          <span className="truncate text-sm font-medium text-surface-100">{activeFolder.name}</span>
        </div>
      )}
    </DragOverlay>
  );
}
