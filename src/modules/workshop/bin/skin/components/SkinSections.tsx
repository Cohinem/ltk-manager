import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

import type { DataTableColumn } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  Cell,
  childOf,
  elementsOf,
  FieldRows,
  fieldsIn,
  fieldsOf,
  type LayoutPages,
  None,
  TableRows,
  TextCell,
  textOf,
  TextureTile,
  type WidgetProps,
} from "../../classes/components/ClassCells";
import { CENSORED_IMAGE, MESH } from "../../classes/utils/classLayouts";
import { ObjectChip } from "../../links/components/LinkChip";
import { FoldCaret } from "../../shared/components/FoldCaret";
import { nameHash } from "../../shared/utils/binHash";
import { fieldHash, rowKey } from "../../tree/utils/binRows";
import { RowValue } from "../../values/components/RowValue";
import { sameSubmesh, SkinChoiceContext } from "../state/skinChoice";

/** The icons a skin carries, each as a tile under its own field's name. */
export function IconRow({ section, pages }: WidgetProps) {
  return (
    <div className="flex flex-wrap gap-3 px-1.5">
      {section.rows.map((row) => (
        <Tile key={rowKey(row)} name={row.name} row={iconChunk(row, pages)} />
      ))}
    </div>
  );
}

/**
 * The row holding the icon's chunk: the field itself, or the one under it.
 *
 * An `iconAvatar` is a `file`. An `iconCircle` holds one in an option, and a
 * `loadscreen` holds one under `image` beside the uncensored map.
 */
function iconChunk(row: BinRow, pages: LayoutPages): BinRow | undefined {
  if (row.value.type === "wadChunkLink") return row;
  const image = childOf(pages, row, CENSORED_IMAGE);
  if (image !== undefined) return image;
  return pages.get(rowKey(row))?.rows.find((child) => child.value.type === "wadChunkLink");
}

/** One texture at tile size, named under it, which is how an icon draws. */
function Tile({ name, row }: { name: string; row: BinRow | undefined }) {
  return (
    <span className="flex flex-col items-center gap-1" data-row-key={row && rowKey(row)}>
      <TextureTile row={row} />
      <span className="max-w-24 truncate text-meta text-surface-400">{name}</span>
    </span>
  );
}

/** The mesh's fields in the order a modder reads them: its files, its textures, its material. */
const MESH_FIELDS = [
  MESH.simpleSkin,
  MESH.skeleton,
  MESH.texture,
  MESH.emissive,
  MESH.normalMap,
  MESH.gloss,
  MESH.roughness,
  MESH.material,
] as const;

/** The mesh: what it is built out of and its textures, each a field row. */
export function MeshCard({ section, pages }: WidgetProps) {
  const byField = fieldsIn(elementsOf(section.rows, pages));
  const drawn = MESH_FIELDS.map(byField).filter((row): row is BinRow => row !== undefined);

  return <FieldRows rows={drawn} owner={structClass(section.rows[0])} />;
}

/** The class a struct row holds, which its fields are read on. */
function structClass(row: BinRow | undefined): string | null {
  return row?.value.type === "struct" ? row.value.classHash : null;
}

/** The fields of one material override the table draws. The rest fold under its row. */
const OVERRIDE = {
  submesh: MESH.submesh,
  material: nameHash("material"),
} as const;

const COLUMN_FIELDS: ReadonlySet<string> = new Set(Object.values(OVERRIDE));

const NO_ROWS: readonly BinRow[] = [];

const OverridePages = createContext<LayoutPages | null>(null);

/** The fold of the override row a cell sits in. Null where the row has nothing to fold. */
const OverrideFold = createContext<{ open: boolean; toggle: () => void } | null>(null);

/** The field `field` of an override, as the read answered it. */
function useOverrideField(element: BinRow, field: string): BinRow | undefined {
  return fieldsOf(use(OverridePages)?.get(rowKey(element)))(field);
}

const SUBMESH_WIDTH = "w-40 shrink-0";
const VALUE_WIDTH = "flex min-w-0 flex-1 items-center";

function SubmeshCell({ element }: { element: BinRow }) {
  const fold = use(OverrideFold);
  return (
    <span className={twMerge(SUBMESH_WIDTH, "flex min-w-0 items-center gap-1")}>
      {fold !== null && (
        <FoldCaret
          open={fold.open}
          onToggle={fold.toggle}
          label={m.workshop_bin_row_fields_action()}
        />
      )}
      {fold === null && <span aria-hidden className="w-4 shrink-0" />}
      <TextCell
        row={useOverrideField(element, OVERRIDE.submesh)}
        className="min-w-0 font-medium text-surface-100"
      />
    </span>
  );
}

/** The editable value of `field`, or an empty cell where the override leaves it unwritten. */
function OverrideValue({ element, field }: { element: BinRow; field: string }) {
  const row = useOverrideField(element, field);
  if (row === undefined) return <span className={VALUE_WIDTH} />;
  return (
    <Cell row={row} className={VALUE_WIDTH}>
      <RowValue row={row} />
    </Cell>
  );
}

/** The override's material as a chip reading its name, which opens the material. */
function MaterialCell({ element }: { element: BinRow }) {
  const row = useOverrideField(element, OVERRIDE.material);
  if (row?.value.type !== "objectLink") {
    return <OverrideValue element={element} field={OVERRIDE.material} />;
  }
  return (
    <Cell row={row} className={VALUE_WIDTH}>
      <ObjectChip hash={row.value.hash} name={row.value.name} kind="link" reading="name" />
    </Cell>
  );
}

const OVERRIDE_COLUMNS: DataTableColumn<BinRow>[] = [
  {
    id: "submesh",
    header: () => (
      /* The caret's gutter and gap, so the heading lines up with the submesh under it. */
      <span className={twMerge(SUBMESH_WIDTH, "pl-5 select-none")}>
        {m.workshop_bin_override_submesh_label()}
      </span>
    ),
    cell: ({ row }) => <SubmeshCell element={row.original} />,
  },
  {
    id: "material",
    header: () => (
      <span className={twMerge(VALUE_WIDTH, "select-none")}>
        {m.workshop_bin_override_material_label()}
      </span>
    ),
    cell: ({ row }) => <MaterialCell element={row.original} />,
  },
];

/** The mesh's material overrides as a table of submesh and material, each row folding open. */
export function OverrideRows({ section, pages }: WidgetProps) {
  const lists = section.rows
    .map((row) => childOf(pages, row, MESH.override))
    .filter((row): row is BinRow => row !== undefined);
  const overrides = elementsOf(lists, pages);

  if (overrides.length === 0) return <None />;
  return (
    <OverridePages value={pages}>
      <TableRows rows={overrides} columns={OVERRIDE_COLUMNS} showHeader Row={OverrideRow} />
    </OverridePages>
  );
}

/**
 * One override's row, which folds open to its other fields, textures among them, and
 * points the character at its submesh under the pointer.
 *
 * The row and the character's submesh point at each other through the skin choice,
 * per "The preview" in docs/ux/SKIN_EDITOR.md.
 */
function OverrideRow({
  element,
  className,
  children,
}: {
  element: BinRow;
  className: string;
  children: ReactNode;
}) {
  const choice = use(SkinChoiceContext);
  const submesh = textOf(useOverrideField(element, OVERRIDE.submesh)) ?? null;
  const pointed = sameSubmesh(choice?.submesh ?? null, submesh);
  const root = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const fields = use(OverridePages)?.get(rowKey(element))?.rows ?? NO_ROWS;
  const rest = fields.filter((row) => !COLUMN_FIELDS.has(fieldHash(row.path)));
  const fold = rest.length === 0 ? null : { open, toggle: () => setOpen((shown) => !shown) };

  const picks = choice?.picks ?? 0;
  const seen = useRef(picks);
  useEffect(() => {
    if (picks === seen.current) return;
    seen.current = picks;
    if (pointed) root.current?.scrollIntoView?.({ block: "nearest" });
  }, [picks, pointed]);

  return (
    <div
      ref={root}
      data-ui="OverrideRows:override"
      /* DS-RADIUS */
      className={twMerge("flex flex-col rounded-sm", pointed && "bg-accent-500/10")}
      onPointerEnter={() => submesh !== null && choice?.setSubmesh(submesh)}
      onPointerLeave={() => pointed && choice?.setSubmesh(null)}
    >
      <OverrideFold value={fold}>
        <div data-row-key={rowKey(element)} className={className}>
          {children}
        </div>
      </OverrideFold>
      {fold?.open && <FieldRows rows={rest} owner={structClass(element)} depth={1} />}
    </div>
  );
}
