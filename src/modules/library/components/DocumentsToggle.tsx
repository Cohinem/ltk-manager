import { BookOpenTextIcon } from "@phosphor-icons/react";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import { useLibraryViewMode } from "@/modules/library/api";
import { useLibrarySidebarStore, useLibraryTableStore } from "@/modules/library/state";

/**
 * Show the documents panel, or hide it.
 *
 * Every tab is about one mod, so this reopens on the mod and the tab the panel
 * was left on rather than landing anywhere of its own. Beside the table it
 * collapses and restores the dock instead.
 */
export function DocumentsToggle() {
  const { viewMode } = useLibraryViewMode();
  const drawerOpen = useLibrarySidebarStore((s) => s.open);
  const toggleDrawer = useLibrarySidebarStore((s) => s.toggle);
  const dockCollapsed = useLibraryTableStore((s) => s.dockCollapsed);
  const setDockCollapsed = useLibraryTableStore((s) => s.setDockCollapsed);

  const docked = viewMode === "table";
  const open = docked ? !dockCollapsed : drawerOpen;
  const toggle = docked ? () => setDockCollapsed(!dockCollapsed) : toggleDrawer;

  return (
    <IconButton
      compact={false}
      size="sm"
      pressed={open}
      icon={<BookOpenTextIcon />}
      onClick={toggle}
      label={m.library_documents_toggle_action()}
    />
  );
}
