import { ArrowCounterClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { createContext, type ReactNode, use } from "react";

import {
  DataTable,
  DataTableCells,
  type DataTableColumn,
  DataTableHeaders,
  IconButton,
} from "@/components";
import { m } from "@/i18n";
import type { BinRow, LeafValue, ValueEdit } from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  elementsOf,
  fieldsOf,
  type LayoutPages,
  None,
  TextCell,
  textOf,
  type ViewContext,
  type WidgetProps,
} from "../../classes/components/ClassCells";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { childCount, rowKey } from "../../tree/utils/binRows";
import { type DeclaredRow, declaredRows } from "../utils/declaredRows";

/** One of the lists a shader declares the rows of: where it lives and what an entry is. */
export interface ListKind {
  readonly list: string;
  readonly className: string;
  /** The field an entry is matched to its declaration by. */
  readonly nameField: string;
}

interface TableState {
  readonly pages: LayoutPages;
  readonly view: ViewContext;
  readonly kind: ListKind;
  /** How many entries the list holds, which is the index a new one lands at. */
  readonly count: number;
  /** The shader answered, so an entry it does not name is marked. */
  readonly known: boolean;
  /** What the program read warns about a row, by the row's name. */
  readonly warnings: ReadonlyMap<string, string>;
}

const NO_WARNINGS: ReadonlyMap<string, string> = new Map();

const TableContext = createContext<TableState | null>(null);

export const NAME_WIDTH = "flex w-56 shrink-0 items-center gap-1";
const RESET_WIDTH = "flex w-6 shrink-0 items-center justify-end";
const ROW_CLASS = "flex min-h-6 items-center gap-2 rounded-sm px-1.5 hover:bg-surface-veil-soft";

/** The field `field` of an entry, as the read answered it. */
export function useElementField(element: BinRow, field: string): BinRow | undefined {
  return fieldsOf(use(TableContext)?.pages.get(rowKey(element)))(field);
}

/** The object as the holder an edit of one of its own fields is addressed under. */
function objectRow(entry: string): BinRow {
  return {
    entry,
    path: "",
    label: "",
    node: "object",
    name: entry,
    unnamed: true,
    kind: null,
    value: { type: "objectLink", hash: entry, name: null },
    declared: null,
  };
}

/** Write `value` into `field` of the item at `at`, adding the field where the item lacks it. */
export function setField(at: string, field: string, value: LeafValue): ValueEdit[] {
  return [
    { type: "ensureProperty", path: at, field },
    { type: "setLeaf", path: `${at}.${field.slice(2)}`, value },
  ];
}

/**
 * Add the material's own entry for the declaration `name`, at the end of its list, with the
 * fields `fill` writes. Null where the view does not edit.
 */
export function useOverride():
  | ((name: string, fill: (at: string) => ValueEdit[]) => Promise<boolean>)
  | null {
  const edit = use(LeafEditContext);
  const table = use(TableContext);
  const editProperty = edit?.editProperty;
  if (editProperty === undefined || table === null) return null;

  return (name, fill) => {
    const at = `[${table.count}]`;
    return editProperty(objectRow(table.view.entry), table.kind.list, [
      {
        type: "insertItem",
        path: "",
        item: { index: null, key: null, class: table.kind.className },
      },
      ...setField(at, table.kind.nameField, { type: "string", value: name }),
      ...fill(at),
    ]);
  };
}

/** The `StaticMaterialDef` the table's list belongs to. */
export function useMaterialEntry(): string {
  return use(TableContext)?.view.entry ?? "";
}

/** The position of a list entry, as the last step of its path spells it. */
function itemStep(element: BinRow): string | null {
  return /\[\d+\]$/.exec(element.path)?.[0] ?? null;
}

/**
 * Write `field` of one of the list's entries, adding the field where the entry leaves it
 * unwritten. Null where the view does not edit.
 */
export function useEntryWrite():
  | ((element: BinRow, field: string, value: LeafValue) => Promise<boolean>)
  | null {
  const editProperty = use(LeafEditContext)?.editProperty;
  const table = use(TableContext);
  if (editProperty === undefined || table === null) return null;

  return async (element, field, value) => {
    const at = itemStep(element);
    if (at === null) return false;
    return editProperty(objectRow(table.view.entry), table.kind.list, setField(at, field, value));
  };
}

/** A column heading, as wide as the cells under it. */
export function Heading({ className, children }: { className: string; children: ReactNode }) {
  return <span className={twMerge(className, "select-none")}>{children}</span>;
}

function NameCell<D>({ row }: { row: DeclaredRow<D> }) {
  const table = use(TableContext);
  const nameRow =
    row.element === null
      ? undefined
      : fieldsOf(table?.pages.get(rowKey(row.element)))(table?.kind.nameField ?? "");
  const stray = table?.known === true && row.declared === null;
  const warning = table?.warnings.get(row.name);

  return (
    <span className={NAME_WIDTH}>
      {nameRow === undefined && <span className="truncate select-text">{row.name}</span>}
      {nameRow !== undefined && <TextCell row={nameRow} className="min-w-0" />}
      {stray && <RowWarning text={m.workshop_bin_material_undeclared_label()} />}
      {warning !== undefined && <RowWarning text={warning} />}
    </span>
  );
}

/* DS-TEXT */
function RowWarning({ text }: { text: string }) {
  return (
    <WarningCircleIcon aria-label={text} className="h-3.5 w-3.5 shrink-0 text-warning-text">
      <title>{text}</title>
    </WarningCircleIcon>
  );
}

/** Take one of the list's entries out, through the list as every other table edit goes. */
function useEntryRemove(): ((element: BinRow) => Promise<boolean>) | null {
  const editProperty = use(LeafEditContext)?.editProperty;
  const table = use(TableContext);
  if (editProperty === undefined || table === null) return null;

  return async (element) => {
    const at = itemStep(element);
    if (at === null) return false;
    return editProperty(objectRow(table.view.entry), table.kind.list, [
      { type: "removeItem", path: at },
    ]);
  };
}

/** Take a declared row's entry out, so the shader default draws again. */
function ResetCell<D>({ row }: { row: DeclaredRow<D> }) {
  const removeItem = useEntryRemove();
  const element = row.element;
  if (element === null || row.declared === null || removeItem === null) {
    return <span className={RESET_WIDTH} />;
  }

  return (
    <span className={RESET_WIDTH}>
      <IconButton
        variant="ghost"
        size="xs"
        compact
        aria-label={m.workshop_bin_material_reset_action()}
        title={m.workshop_bin_material_reset_action()}
        icon={<ArrowCounterClockwiseIcon weight="bold" className="h-3 w-3" />}
        onClick={() => void removeItem(element)}
      />
    </span>
  );
}

/** The name column, which marks an entry the shader does not declare. */
export function nameColumn<D>(): DataTableColumn<DeclaredRow<D>> {
  return {
    id: "name",
    header: () => <Heading className={NAME_WIDTH}>{m.workshop_bin_material_name_label()}</Heading>,
    cell: ({ row }) => <NameCell row={row.original} />,
  };
}

/** The last column, a reset on each declared row the material sets. */
export function resetColumn<D>(): DataTableColumn<DeclaredRow<D>> {
  return {
    id: "reset",
    header: () => <span className={RESET_WIDTH} />,
    cell: ({ row }) => <ResetCell row={row.original} />,
  };
}

/**
 * One list as a table of the shader's declarations and the material's entries.
 *
 * "The shader declares the rows" in docs/ux/BIN_EDITOR.md.
 */
export function DeclaredTable<D extends { readonly name: string }>({
  section,
  pages,
  view,
  kind,
  declarations,
  columns,
  warnings = NO_WARNINGS,
}: WidgetProps & {
  kind: ListKind;
  declarations: readonly D[] | null;
  columns: DataTableColumn<DeclaredRow<D>>[];
  warnings?: ReadonlyMap<string, string>;
}) {
  const rows = declaredRows(
    elementsOf(section.rows, pages),
    (element) => textOf(fieldsOf(pages.get(rowKey(element)))(kind.nameField)),
    declarations,
  );
  const list = section.rows[0];
  const state: TableState = {
    pages,
    view,
    kind,
    count: list === undefined ? 0 : childCount(list),
    known: declarations !== null,
    warnings,
  };

  return (
    <TableContext value={state}>
      <DataTable
        ariaLabel={m.workshop_bin_row_fields_action()}
        options={{ data: rows, columns, getRowId: (row) => row.key, enableSorting: false }}
      >
        {(table) => (
          <div className="flex flex-col">
            <div className="flex gap-2 px-1.5 pb-0.5 text-meta text-surface-400">
              <DataTableHeaders headers={table.getFlatHeaders()} customCells />
            </div>
            {rows.length === 0 && <None />}
            {table.getRowModel().rows.map((row) => (
              /* DS-VEIL, DS-RADIUS */
              <div
                key={row.id}
                data-row-key={row.original.element === null ? undefined : row.id}
                className={ROW_CLASS}
              >
                <DataTableCells row={row} customCells />
              </div>
            ))}
          </div>
        )}
      </DataTable>
    </TableContext>
  );
}
