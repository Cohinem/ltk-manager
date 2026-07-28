import { CheckCheck, CheckSquare, Grid3X3, List, Plus, Search, X } from "lucide-react";

import { Button, IconButton, Kbd, Tooltip } from "@/components";
import type { InstalledMod } from "@/lib/tauri";
import type { FilterOptions } from "@/modules/library/api";
import type { useLibraryActions } from "@/modules/library/api";
import { useLibraryViewMode } from "@/modules/library/api";
import { useLibrarySelectionStore } from "@/stores";

import { ActiveFilterChips } from "./ActiveFilterChips";
import { AnalyzeUncategorizedButton } from "./AnalyzeUncategorizedButton";
import { FilterPopover } from "./FilterPopover";
import { PlayButton } from "./PlayButton";
import { SortDropdown } from "./SortDropdown";

interface LibraryToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  actions: ReturnType<typeof useLibraryActions>;
  isLoading: boolean;
  isPatcherActive: boolean;
  filterOptions: FilterOptions;
  visibleMods: InstalledMod[];
}

export function LibraryToolbar({
  searchQuery,
  onSearchChange,
  actions,
  isLoading,
  isPatcherActive,
  filterOptions,
  visibleMods,
}: LibraryToolbarProps) {
  const { viewMode, setViewMode } = useLibraryViewMode();
  const selectMode = useLibrarySelectionStore((s) => s.selectMode);
  const enterSelectMode = useLibrarySelectionStore((s) => s.enterSelectMode);
  const exitSelectMode = useLibrarySelectionStore((s) => s.exitSelectMode);
  const visibleEnabledCount = visibleMods.reduce((n, m) => n + (m.enabled ? 1 : 0), 0);
  const canEnableAll = visibleMods.length > 0 && visibleEnabledCount < visibleMods.length;
  const canDisableAll = visibleEnabledCount > 0;
  const bulkDisabled = isPatcherActive || isLoading || actions.toggleMod.isPending;

  return (
    <div className="border-b border-surface-600 bg-surface-800/50 px-4 py-3" data-tauri-drag-region>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Search */}
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Search mods..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-full rounded-lg border border-surface-600 bg-surface-800 pr-4 pl-10 text-sm text-surface-100 transition-colors duration-150 placeholder:text-surface-500 focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-0 focus-visible:outline-none"
          />
        </div>

        <FilterPopover filterOptions={filterOptions} />

        <SortDropdown />

        {/* View toggle */}
        <div className="flex items-center gap-1">
          <Tooltip content="Grid view">
            <IconButton
              icon={<Grid3X3 className="h-4 w-4" />}
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
            />
          </Tooltip>
          <Tooltip content="List view">
            <IconButton
              icon={<List className="h-4 w-4" />}
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
            />
          </Tooltip>
        </div>

        {/* Bulk toggle */}
        <div className="flex items-center gap-1">
          <Tooltip content="Enable every mod matching the current search/filters">
            <IconButton
              icon={<CheckCheck className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={() => actions.handleSetEnabledForMods(visibleMods, true)}
              disabled={bulkDisabled || !canEnableAll}
              aria-label="Enable all visible mods"
            />
          </Tooltip>
          <Tooltip content="Disable every mod matching the current search/filters">
            <IconButton
              icon={<X className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={() => actions.handleSetEnabledForMods(visibleMods, false)}
              disabled={bulkDisabled || !canDisableAll}
              aria-label="Disable all visible mods"
            />
          </Tooltip>
          <AnalyzeUncategorizedButton disabled={isPatcherActive || isLoading} />
        </div>

        {/* Select mode toggle */}
        <Tooltip
          content={
            selectMode
              ? "Exit select mode"
              : "Select mods to bulk-uninstall (combine with search/filters to narrow down)"
          }
        >
          <Button
            variant={selectMode ? "filled" : "outline"}
            size="sm"
            onClick={selectMode ? exitSelectMode : enterSelectMode}
            disabled={isPatcherActive || isLoading}
            left={<CheckSquare className="h-4 w-4" />}
          >
            Select
          </Button>
        </Tooltip>

        {/* Actions */}
        <Tooltip
          content={
            <>
              Add mod <Kbd shortcut="Ctrl+I" />
            </>
          }
        >
          <Button
            variant="filled"
            size="sm"
            onClick={actions.handleInstallMod}
            loading={actions.installMod.isPending || actions.bulkInstallMods.isPending}
            disabled={isPatcherActive}
            left={<Plus className="h-4 w-4" />}
          >
            {actions.installMod.isPending || actions.bulkInstallMods.isPending
              ? "Installing..."
              : "Add Mod"}
          </Button>
        </Tooltip>

        <PlayButton disabled={actions.installMod.isPending || actions.bulkInstallMods.isPending} />
      </div>
      <ActiveFilterChips />
    </div>
  );
}
