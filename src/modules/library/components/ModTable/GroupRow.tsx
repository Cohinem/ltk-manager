import {
  CheckCircleIcon,
  FolderSimpleIcon,
  QuestionIcon,
  WarningIcon,
  WrenchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { memo, type ReactNode } from "react";

import { ARRANGED_GROUP_HEIGHT, ArrangedGroupHeading, Checkbox, Switch } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod, LibraryFolder } from "@/lib/tauri";
import { ChampionPortrait, useChampionRoster } from "@/modules/champions";
import { useFolderToggle, useSetModsEnabled } from "@/modules/library/api";
import { twMerge } from "@/utils";

import { type TableGroupBy, useLibrarySelectionStore } from "../../state";
import { FolderContextMenu } from "../FolderContextMenu";
import type { TableColumnSpec } from "./columns";
import type { GroupRow as GroupRowModel } from "./rows";

/** Height of a group heading, which does not follow the row density. */
export const GROUP_ROW_HEIGHT = ARRANGED_GROUP_HEIGHT;

interface GroupRowProps {
  row: GroupRowModel;
  groupBy: TableGroupBy;
  columns: TableColumnSpec[];
  isCurrent: boolean;
  /** Whether a search or a filter stands, which holds every group open on its matches. */
  narrowed: boolean;
  /** Whether a dragged row would be filed into this folder on release. */
  isDropTarget: boolean;
  /** Offset from the top of the rows, from the virtualizer. */
  top: number;
  onPress: (rowKey: string) => void;
  onToggle: (rowKey: string) => void;
}

/**
 * A group heading in the library table.
 *
 * A folder carries its own switch, because it exists apart from the table. Any
 * other group is a view of the library, so it offers a pick of its mods
 * instead. Both reach only the mods drawn under the heading. Per "Grouping" in
 * docs/ux/LIBRARY.md.
 */
export const GroupRow = memo(function GroupRow({
  row,
  groupBy,
  columns,
  isCurrent,
  narrowed,
  isDropTarget,
  top,
  onPress,
  onToggle,
}: GroupRowProps) {
  const enabledCount = row.mods.filter((mod) => mod.enabled).length;
  const { folder } = row;

  return (
    <ArrangedGroupHeading
      columns={columns}
      label={row.label}
      count={m.library_table_group_count_label({ count: row.mods.length })}
      expanded={row.expanded}
      foldable={!narrowed}
      isCurrent={isCurrent}
      isDropTarget={isDropTarget}
      top={top}
      pick={<GroupPick row={row} onToggle={onToggle} />}
      control={folder && <FolderSwitch folder={folder} mods={row.mods} narrowed={narrowed} />}
      mark={<GroupMark row={row} groupBy={groupBy} />}
      extra={
        groupBy !== "enabled" &&
        enabledCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-surface-400 tabular-nums">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-500" />
            {m.library_table_group_on_count_label({ on: enabledCount })}
          </span>
        )
      }
      onPress={() => onPress(row.key)}
      wrap={
        folder &&
        ((content) => (
          <FolderContextMenu folderId={folder.id} folderName={folder.name}>
            {content}
          </FolderContextMenu>
        ))
      }
    />
  );
});

/** The heading's checkbox, which opens a folded group so every mod it picks is drawn. */
function GroupPick({ row, onToggle }: { row: GroupRowModel; onToggle: (rowKey: string) => void }) {
  const { mods, label } = row;
  const picked = useLibrarySelectionStore(
    (s) => mods.filter((mod) => s.selectedIds.has(mod.id)).length,
  );
  const hasSelection = useLibrarySelectionStore((s) => s.selectedIds.size > 0);
  const addMany = useLibrarySelectionStore((s) => s.addMany);
  const removeMany = useLibrarySelectionStore((s) => s.removeMany);
  const all = picked === mods.length;

  function handleChange() {
    const ids = mods.map((mod) => mod.id);
    if (all) {
      removeMany(ids);
      return;
    }

    addMany(ids);
    if (!row.expanded) onToggle(row.key);
  }

  return (
    <span
      data-no-row
      className={twMerge(
        "flex",
        picked === 0 &&
          !hasSelection &&
          "opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100",
      )}
    >
      <Checkbox
        size="sm"
        checked={all}
        indeterminate={picked > 0 && !all}
        onCheckedChange={handleChange}
        aria-label={m.library_table_group_select_label({ group: label })}
      />
    </span>
  );
}

interface FolderSwitchProps {
  folder: LibraryFolder;
  mods: InstalledMod[];
  narrowed: boolean;
}

/** The folder's switch, over the matches alone while a search or a filter hides the rest. */
function FolderSwitch({ folder, mods, narrowed }: FolderSwitchProps) {
  const whole = useFolderToggle(folder, mods);
  const { setEnabled } = useSetModsEnabled();
  const { checked, indeterminate } = whole;
  const handleToggle = narrowed ? () => setEnabled(mods, !checked) : whole.handleToggle;

  return (
    <span data-no-row className="flex">
      <Switch
        checked={checked}
        onCheckedChange={handleToggle}
        aria-label={folder.name}
        className={twMerge(indeterminate && "bg-accent-500/45")}
      />
    </span>
  );
}

const HEALTH_MARKS: Record<string, ReactNode> = {
  broken: <XCircleIcon weight="bold" className="size-4 shrink-0 text-danger-text" />,
  repairable: <WrenchIcon weight="bold" className="size-4 shrink-0 text-warning-text" />,
  flagged: <WarningIcon weight="bold" className="size-4 shrink-0 text-warning-text" />,
  healthy: <CheckCircleIcon weight="bold" className="size-4 shrink-0 text-success-text" />,
  unchecked: <QuestionIcon weight="bold" className="size-4 shrink-0 text-surface-400" />,
};

/** The glyph a group heading leads with, where its grouping has one. */
function GroupMark({ row, groupBy }: { row: GroupRowModel; groupBy: TableGroupBy }) {
  const roster = useChampionRoster();

  if (row.folder) {
    return <FolderSimpleIcon weight="fill" className="size-4 shrink-0 text-accent-400" />;
  }
  if (row.value === null) return null;
  if (groupBy === "champion") {
    return <ChampionPortrait champion={roster.find(row.value)} className="size-4 shrink-0" />;
  }
  if (groupBy === "health") return HEALTH_MARKS[row.value] ?? null;
  if (groupBy === "enabled") {
    return (
      <span
        aria-hidden="true"
        className={twMerge(
          "size-2 shrink-0 rounded-full",
          row.value === "on" ? "bg-accent-500" : "bg-surface-500",
        )}
      />
    );
  }
  return null;
}
