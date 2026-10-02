import {
  ARRANGED_HEADER_HEIGHT,
  type ArrangedHeaderColumn,
  type ArrangedSorting,
  ArrangedTableHeader,
  Checkbox,
} from "@/components";
import { m } from "@/i18n";

import {
  type SortField,
  type TableColumnId,
  useLibraryFilterActions,
  useLibrarySelectionStore,
  useLibrarySort,
  useLibraryTableStore,
} from "../../state";
import { GROUP_BY_LABELS, type TableColumnSpec } from "./columns";

/** Height of the sticky header row. */
export const HEADER_HEIGHT = ARRANGED_HEADER_HEIGHT;

const LOAD_ORDER = { field: "priority", direction: "desc" } as const;

interface ModTableHeaderProps {
  columns: ArrangedHeaderColumn<TableColumnSpec>[];
  /** The mods the header checkbox picks, each once, in drawn order. */
  modIds: string[];
  onMoveColumn: (id: TableColumnId, before: TableColumnId) => void;
}

/** The library table's header, whose way back from any sort is the load order. */
export function ModTableHeader({ columns, modIds, onMoveColumn }: ModTableHeaderProps) {
  const sort = useLibrarySort();
  const { setSort } = useLibraryFilterActions();

  const sorting: ArrangedSorting<SortField> = {
    sort,
    onSort: setSort,
    defaultSort: LOAD_ORDER,
    defaultLabel: m.library_table_sort_clear_action(),
    natural: "priority",
  };

  return (
    <ArrangedTableHeader
      columns={columns}
      store={useLibraryTableStore}
      sorting={sorting}
      groupLabels={GROUP_BY_LABELS}
      ungrouped="none"
      onMoveColumn={onMoveColumn}
      renderCell={(spec) => {
        if (spec.id !== "select") return undefined;
        return <SelectAll modIds={modIds} />;
      }}
    />
  );
}

/** The header checkbox: every drawn mod, or none of them. */
function SelectAll({ modIds }: { modIds: string[] }) {
  const picked = useLibrarySelectionStore(
    (s) => modIds.filter((id) => s.selectedIds.has(id)).length,
  );
  const addMany = useLibrarySelectionStore((s) => s.addMany);
  const removeMany = useLibrarySelectionStore((s) => s.removeMany);
  const all = modIds.length > 0 && picked === modIds.length;

  return (
    <Checkbox
      size="sm"
      checked={all}
      indeterminate={picked > 0 && !all}
      onCheckedChange={() => (all ? removeMany(modIds) : addMany(modIds))}
      aria-label={m.library_table_select_all_label()}
    />
  );
}
