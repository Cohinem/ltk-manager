import { useQuery } from "@tanstack/react-query";
import { type RefObject, useMemo, useRef } from "react";

import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";

import {
  fieldsOf,
  type LayoutPages,
  textOf,
  type ViewContext,
} from "../../classes/components/ClassCells";
import { EFFECT } from "../../classes/utils/classLayouts";
import { usePaneCommands } from "../../menus/state/paneCommands";
import { nameHash } from "../../shared/utils/binHash";
import type { LeafEdit } from "../../tree/hooks/useLeafEdit";
import { rowKey } from "../../tree/utils/binRows";
import { ChildAddPicker } from "../../vfx/children/ChildAddPicker";
import { childQueries } from "../../vfx/children/useChildren";
import { useEffectAdd } from "../hooks/useEffectAdd";
import { type EffectListPath, IDLE_LIST, resolverKey } from "../utils/effectEdits";
import {
  listCommands,
  SKIN_ADD_EFFECT_COMMAND,
  SKIN_REMOVE_EFFECT_LIST,
} from "../utils/skinCommands";
import { EffectRows } from "./EffectRows";
import type { EffectScope, ResourceTarget } from "./ResolverScope";

export interface EffectListProps {
  view: ViewContext;
  scope: EffectScope;
  /** Where the list sits, which an add appends to. */
  path: EffectListPath;
  /** The list's elements. */
  effects: readonly BinRow[];
  /** The fields of each element, by the element's row key. */
  pages: LayoutPages;
  /** The number of effects the list holds. */
  count: number;
}

/**
 * A list of effects of the skin: one row per effect, and the picker that adds one where the
 * effects take edits.
 *
 * The idle effects of the VFX section and the effects of a persistent condition are both one,
 * per "The VFX section" and "The Conditions section" in docs/ux/SKIN_EDITOR.md.
 */
export function EffectList({ view, scope, path, effects, pages, count }: EffectListProps) {
  const { resources, edit, resolver, joints } = scope;
  const addHost = useRef<HTMLDivElement>(null);

  return (
    <>
      {path === IDLE_LIST && (
        <IdleEffectCommands
          effects={effects}
          pages={pages}
          resources={resources}
          removeItem={edit?.removeItem ?? null}
          addHost={resolver === null ? null : addHost}
        />
      )}
      <EffectRows
        effects={effects}
        pages={pages}
        resources={resources}
        edit={edit}
        joints={joints}
      />
      {resolver !== null && (
        <AddEffect
          host={addHost}
          view={view}
          path={path}
          count={count}
          resolver={resolver}
          resources={resources}
          bone={joints[0] ?? ""}
        />
      )}
    </>
  );
}

/** Returns the words of `effect` in a menu: its system's last path segment, its name or its key. */
function effectTitle(
  effect: BinRow,
  pages: LayoutPages,
  resources: ReadonlyMap<string, ResourceTarget>,
): string {
  const fields = fieldsOf(pages.get(rowKey(effect)));
  const key = fields(EFFECT.key);
  const named = textOf(fields(EFFECT.name));
  const hash = key?.value.type === "hash" ? key.value.hash : named && nameHash(named);
  const system = hash ? resources.get(hash) : undefined;

  return system?.name?.split("/").at(-1) ?? system?.hash ?? named ?? hash ?? "";
}

interface IdleEffectCommandsProps {
  readonly effects: readonly BinRow[];
  readonly pages: LayoutPages;
  readonly resources: ReadonlyMap<string, ResourceTarget>;
  readonly removeItem: NonNullable<LeafEdit["removeItem"]> | null;
  /** The box of the picker that adds an effect, and null where the effects take none. */
  readonly addHost: RefObject<HTMLDivElement | null> | null;
}

/** Offers the add and the removes of the idle effects to the bar, which the Skin menu lists. */
function IdleEffectCommands({
  effects,
  pages,
  resources,
  removeItem,
  addHost,
}: IdleEffectCommandsProps) {
  usePaneCommands("skin.effects.idle", {
    [SKIN_ADD_EFFECT_COMMAND]: {
      run:
        addHost === null
          ? null
          : () => requestAnimationFrame(() => addHost.current?.querySelector("input")?.focus()),
      reason: m.workshop_bin_menu_skin_resolver_reason(),
    },
    ...listCommands(
      SKIN_REMOVE_EFFECT_LIST,
      effects.map((effect) => ({
        title: effectTitle(effect, pages, resources),
        run: removeItem === null ? null : () => void removeItem(effect),
      })),
    ),
  });

  return null;
}

interface AddEffectProps {
  /** The box around the picker, which the Skin menu focuses the input of. */
  host: RefObject<HTMLDivElement | null>;
  view: ViewContext;
  path: EffectListPath;
  count: number;
  /** The resolver object, which this file declares. */
  resolver: string;
  resources: ReadonlyMap<string, ResourceTarget>;
  /** The joint a new effect sits on. */
  bone: string;
}

/**
 * The combobox that adds an effect on the skeleton's first joint, listing the systems that the
 * file declares or that its resolvers map. The resolver takes a key for a system that has none.
 */
function AddEffect({ host, view, path, count, resolver, resources, bone }: AddEffectProps) {
  const systems = useQuery(childQueries.targets(view.document)).data;
  const add = useEffectAdd();
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
                path,
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
  }, [add, systems, view.entry, path, count, resolver, resources, bone]);

  return (
    <div ref={host} data-ui="EffectList:add" className="flex min-h-6 items-center px-1.5 pt-1">
      <ChildAddPicker
        actions={actions}
        systems={systems}
        holder=""
        label={m.workshop_bin_skin_effect_add_action()}
      />
    </div>
  );
}
