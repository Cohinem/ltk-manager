import { useQuery } from "@tanstack/react-query";
import { type ReactNode, use, useMemo } from "react";

import { m } from "@/i18n";
import type { AssetRef, BinDocumentId, BinRow } from "@/lib/tauri";

import {
  AlsoCheck,
  elementsOf,
  type LayoutPages,
  type ViewContext,
  type WidgetProps,
} from "../../classes/components/ClassCells";
import { EFFECT } from "../../classes/utils/classLayouts";
import { useBinDocument } from "../../documents/hooks/useBinDocument";
import { useBinRead } from "../../documents/hooks/useBinRead";
import { useLinkTargets } from "../../links/hooks/useLinkTargets";
import { declaredElsewhere } from "../../links/utils/linkDecision";
import { type LeafEdit, LeafEditContext } from "../../tree/hooks/useLeafEdit";
import {
  childCount,
  entryKeyHash,
  fieldHash,
  objectKey,
  PAGE_SIZE,
  rowKey,
} from "../../tree/utils/binRows";
import { ChildAddPicker } from "../../vfx/children/ChildAddPicker";
import { childQueries } from "../../vfx/children/useChildren";
import { useIdleEffectAdd } from "../hooks/useIdleEffectAdd";
import { useSkinBind } from "../hooks/useSkinBind";
import { IDLE_EFFECTS, resolverKey } from "../utils/idleEffectEdits";
import { EffectRows } from "./EffectRows";

/**
 * The idle effects, each joined to the system its key names through the resolver.
 *
 * "The skin view" in docs/research/bin-editor-higher-order-views.md, and "The VFX section" in
 * docs/ux/SKIN_EDITOR.md. The resolver is a link, so its object is read through this file's own
 * handle where the file declares it, and through a second one where another file does. The
 * effects take edits only where this file declares the resolver.
 */
export function EffectTable({ section, pages, view }: WidgetProps) {
  const effects = elementsOf(
    section.rows.filter((row) => fieldHash(row.path) !== EFFECT.resolver),
    pages,
  );
  const resolver = section.rows.find((row) => fieldHash(row.path) === EFFECT.resolver);
  const list = section.rows.find((row) => fieldHash(row.path) === IDLE_EFFECTS);
  const elsewhere = useResolverAsset(resolver, view.asset);
  const entry = resolver?.value.type === "objectLink" ? resolver.value.hash : null;

  if (elsewhere !== null && entry !== null) {
    return <ForeignResolver asset={elsewhere} entry={entry} effects={effects} pages={pages} />;
  }
  return (
    <Resolved
      document={view.document}
      entry={entry}
      effects={effects}
      pages={pages}
      owner={{ view, count: list?.value.type === "container" ? list.value.len : 0 }}
    />
  );
}

/** The asset declaring the resolver, where another file declares it. Null where this one does. */
function useResolverAsset(resolver: BinRow | undefined, asset: AssetRef): AssetRef | null {
  const targets = useLinkTargets();
  if (resolver?.value.type !== "objectLink") return null;
  return declaredElsewhere(resolver.value.hash, targets, asset);
}

/** The skin view whose effects take edits, and the number of effects its list holds. */
interface EffectOwner {
  readonly view: ViewContext;
  readonly count: number;
}

interface ResolvedProps {
  document: BinDocumentId;
  /** The resolver's object hash, or null where the skin names none. */
  entry: string | null;
  effects: readonly BinRow[];
  pages: LayoutPages;
  /** The skin view, where the effects take edits. */
  owner?: EffectOwner;
}

/** The effects drawn against a resolver held open as `document`. */
function Resolved({ document, entry, effects, pages, owner }: ResolvedProps) {
  const { rows, key } = useResourceMap(document, entry);
  const resources = new Map<string, BinRow>();
  for (const row of rows) {
    const hash = entryKeyHash(row);
    if (hash !== null) resources.set(hash, row);
  }

  const edit = use(LeafEditContext);
  let table: ReactNode = (
    <EffectRows
      effects={effects}
      pages={pages}
      resources={resources}
      edit={null}
      joints={NO_JOINTS}
    />
  );
  if (edit !== null && owner !== undefined && entry !== null) {
    table = (
      <EditableEffects
        effects={effects}
        pages={pages}
        resources={resources}
        edit={edit}
        owner={owner}
        resolver={entry}
      />
    );
  }

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
    return (
      <EffectRows
        effects={effects}
        pages={pages}
        resources={NO_RESOURCES}
        edit={null}
        joints={NO_JOINTS}
      />
    );
  }
  return (
    <Resolved document={state.handle.document} entry={entry} effects={effects} pages={pages} />
  );
}

const NO_RESOURCES: ReadonlyMap<string, BinRow> = new Map();
const NO_JOINTS: readonly string[] = [];

interface EditableEffectsProps {
  effects: readonly BinRow[];
  pages: LayoutPages;
  resources: ReadonlyMap<string, BinRow>;
  edit: LeafEdit;
  owner: EffectOwner;
  /** The resolver object, which this file declares. */
  resolver: string;
}

/** The effects with their edits: a bone picker and a remove button per row, and the add line. */
function EditableEffects({ owner, resolver, ...rows }: EditableEffectsProps) {
  const joints = useJoints(owner.view);

  return (
    <>
      <EffectRows {...rows} joints={joints} />
      <EffectAdd
        owner={owner}
        resolver={resolver}
        resources={rows.resources}
        bone={joints[0] ?? ""}
      />
    </>
  );
}

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

/** Returns the joint names of the skin's skeleton, and none while the skeleton loads. */
function useJoints(view: ViewContext): readonly string[] {
  const { pose } = useSkinBind(view.document, view.entry);
  return useMemo(() => pose?.skeleton.joints.map((joint) => joint.name) ?? NO_JOINTS, [pose]);
}

interface EffectAddProps {
  owner: EffectOwner;
  /** The resolver object, which this file declares. */
  resolver: string;
  resources: ReadonlyMap<string, BinRow>;
  /** The joint a new effect sits on. */
  bone: string;
}

/**
 * The combobox that adds an idle effect on the skeleton's first joint, listing the systems that
 * the file declares or that its resolvers map. The resolver takes a key for a system that has
 * none.
 */
function EffectAdd({ owner, resolver, resources, bone }: EffectAddProps) {
  const { view, count } = owner;
  const systems = useQuery(childQueries.targets(view.document)).data;
  const add = useIdleEffectAdd();
  const actions = useMemo(() => {
    const system = (entry: string) => systems?.find((each) => each.entry === entry);
    return {
      add:
        add === null
          ? null
          : async (entry: string) => {
              const picked = system(entry);
              if (picked === undefined) return false;

              add({
                skin: view.entry,
                count,
                resolver,
                key: resolverKey(resources, picked),
                system: entry,
                bone,
              });
              return true;
            },
      create: null,
    };
  }, [add, systems, view.entry, count, resolver, resources, bone]);

  return (
    <div data-ui="EffectTable:add" className="flex min-h-6 items-center px-1.5 pt-1">
      <ChildAddPicker
        actions={actions}
        systems={systems}
        holder=""
        label={m.workshop_bin_skin_effect_add_action()}
      />
    </div>
  );
}
