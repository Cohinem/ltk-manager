import { ArrowRightIcon } from "@phosphor-icons/react";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

import type { DataTableColumn } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentId, BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  AlsoCheck,
  Cell,
  childOf,
  elementsOf,
  FieldRows,
  fieldsIn,
  fieldsOf,
  FoldCaret,
  type LayoutPages,
  None,
  TableRows,
  TextCell,
  textOf,
  TextureTile,
  type WidgetProps,
} from "../../classes/components/ClassCells";
import { CENSORED_IMAGE, EFFECT, MESH } from "../../classes/utils/classLayouts";
import { useBinDocument } from "../../documents/hooks/useBinDocument";
import { useBinRead } from "../../documents/hooks/useBinRead";
import { ObjectChip } from "../../links/components/LinkChip";
import { useLinkTargets } from "../../links/hooks/useLinkTargets";
import { declaredElsewhere } from "../../links/utils/linkDecision";
import { nameHash } from "../../shared/utils/binHash";
import { RowValue } from "../../tree/components/BinRow";
import {
  childCount,
  entryKeyHash,
  fieldHash,
  objectKey,
  PAGE_SIZE,
  rowKey,
} from "../../tree/utils/binRows";
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
      {fold !== null && <FoldCaret open={fold.open} onToggle={fold.toggle} />}
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
 * per "The skin's preview" in docs/ux/BIN_EDITOR.md.
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

/**
 * The idle effects, each joined to the system its key names through the resolver.
 *
 * "The skin view" in docs/research/bin-editor-higher-order-views.md. The resolver is a
 * link, so its object is read through this file's own handle where the file declares
 * it, and through a second one where another file does.
 */
export function EffectTable({ section, pages, view }: WidgetProps) {
  const effects = elementsOf(
    section.rows.filter((row) => fieldHash(row.path) !== EFFECT.resolver),
    pages,
  );
  const resolver = section.rows.find((row) => fieldHash(row.path) === EFFECT.resolver);
  const elsewhere = useResolverAsset(resolver, view.asset);
  const entry = resolver?.value.type === "objectLink" ? resolver.value.hash : null;

  if (elsewhere !== null && entry !== null) {
    return <ForeignResolver asset={elsewhere} entry={entry} effects={effects} pages={pages} />;
  }
  return <Resolved document={view.document} entry={entry} effects={effects} pages={pages} />;
}

/** The asset declaring the resolver, where another file declares it. Null where this one does. */
function useResolverAsset(resolver: BinRow | undefined, asset: AssetRef): AssetRef | null {
  const targets = useLinkTargets();
  if (resolver?.value.type !== "objectLink") return null;
  return declaredElsewhere(resolver.value.hash, targets, asset);
}

interface ResolvedProps {
  document: BinDocumentId;
  /** The resolver's object hash, or null where the skin names none. */
  entry: string | null;
  effects: readonly BinRow[];
  pages: LayoutPages;
}

/** The effects drawn against a resolver held open as `document`. */
function Resolved({ document, entry, effects, pages }: ResolvedProps) {
  const { rows, key } = useResourceMap(document, entry);
  const resources = new Map<string, BinRow>();
  for (const row of rows) {
    const hash = entryKeyHash(row);
    if (hash !== null) resources.set(hash, row);
  }

  const table = <EffectRows effects={effects} pages={pages} resources={resources} />;
  if (key === null) return table;
  return (
    <AlsoCheck document={document} group={{ key, rows }}>
      {table}
    </AlsoCheck>
  );
}

interface ForeignResolverProps {
  asset: AssetRef;
  entry: string;
  effects: readonly BinRow[];
  pages: LayoutPages;
}

/** The resolver another file declares, held open beside the skin's own document. */
function ForeignResolver({ asset, entry, effects, pages }: ForeignResolverProps) {
  const { state } = useBinDocument(asset, entry);
  if (state.status !== "open") {
    return <EffectRows effects={effects} pages={pages} resources={NO_RESOURCES} />;
  }
  return (
    <Resolved document={state.handle.document} entry={entry} effects={effects} pages={pages} />
  );
}

const NO_RESOURCES: ReadonlyMap<string, BinRow> = new Map();

/**
 * The entries of the resolver's `resourceMap`, and the key they were checked under.
 *
 * The object's own rows come first, because the map's row carries how many entries
 * reading it costs. A resolver the skin names none of answers nothing.
 */
function useResourceMap(
  document: BinDocumentId,
  entry: string | null,
): { rows: readonly BinRow[]; key: string | null } {
  /* The object's properties are one page, which is what reading its root costs. */
  const root = entry === null ? null : objectKey(entry);
  const roots = useBinRead(document, root === null ? [] : [{ key: root, rows: PAGE_SIZE }]);

  const map =
    root === null
      ? undefined
      : roots.get(root)?.rows.find((row) => fieldHash(row.path) === EFFECT.resourceMap);
  const key = map === undefined ? null : rowKey(map);
  const entries = useBinRead(
    document,
    map === undefined ? [] : [{ key: rowKey(map), rows: childCount(map) }],
  );

  return { rows: key === null ? [] : (entries.get(key)?.rows ?? []), key };
}

/**
 * The system an effect names, as a chip reading its last segment.
 *
 * An effect is keyed by `effectKey`, or by the hash of its `effectName` where it carries
 * no key. A name the map does not answer for draws as its text, and a key as its hash.
 * Every effect of a skin shares the folder its systems sit in, so the chip reads the name.
 */
function Resource({
  effect,
  name,
  resources,
}: {
  effect: BinRow | undefined;
  name: BinRow | undefined;
  resources: ReadonlyMap<string, BinRow>;
}) {
  const named = textOf(name);
  const hash =
    effect?.value.type === "hash"
      ? effect.value.hash
      : named === undefined
        ? null
        : nameHash(named);
  const system = hash === null ? undefined : resources.get(hash);
  if (system?.value.type === "objectLink") {
    return (
      <ObjectChip hash={system.value.hash} name={system.value.name} kind="link" reading="name" />
    );
  }
  if (system !== undefined) return <RowValue row={system} />;
  if (effect !== undefined) return <RowValue row={effect} />;
  if (named !== undefined) return <span className="truncate select-text">{named}</span>;
  return null;
}

interface EffectRowsContextValue {
  pages: LayoutPages;
  resources: ReadonlyMap<string, BinRow>;
}
const EffectRowsContext = createContext<EffectRowsContextValue | null>(null);

const EFFECT_COLUMNS: DataTableColumn<BinRow>[] = [
  { id: "effect", cell: EffectCell },
  { id: "bone", cell: BoneCell },
  { id: "target", cell: TargetCell },
];

/** A row per effect: the system it resolves to, the bone it sits on, and the bone it aims at. */
function EffectRows({
  effects,
  pages,
  resources,
}: EffectRowsContextValue & { effects: readonly BinRow[] }) {
  return (
    <EffectRowsContext value={{ pages, resources }}>
      <TableRows rows={effects} columns={EFFECT_COLUMNS} />
    </EffectRowsContext>
  );
}

function EffectCell({ row }: { row: { id: string } }) {
  const context = use(EffectRowsContext);
  if (context === null) return null;
  const fields = fieldsOf(context.pages.get(row.id));
  const key = fields(EFFECT.key);
  const name = fields(EFFECT.name);
  return (
    <Cell row={key ?? name} className="flex min-w-0 flex-1 items-center gap-2">
      <Resource effect={key} name={name} resources={context.resources} />
    </Cell>
  );
}

function BoneCell({ row }: { row: { id: string } }) {
  const context = use(EffectRowsContext);
  if (context === null) return null;
  return (
    <TextCell
      row={fieldsOf(context.pages.get(row.id))(EFFECT.bone)}
      className="w-32 shrink-0 text-surface-400"
    />
  );
}

function TargetCell({ row }: { row: { id: string } }) {
  const context = use(EffectRowsContext);
  if (context === null) return null;
  const target = fieldsOf(context.pages.get(row.id))(EFFECT.targetBone);
  if (!textOf(target)) return null;
  return (
    <span className="flex w-32 shrink-0 items-center gap-1 text-surface-400">
      <ArrowRightIcon aria-hidden className="h-3 w-3 shrink-0" />
      <TextCell row={target} className="min-w-0" />
    </span>
  );
}
