import { queryOptions, useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";

import {
  api,
  type AppError,
  type BinDocumentId,
  type BinRow,
  type NewObject,
  type ValueEdit,
  type VfxObject,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { nameHash } from "../../shared/utils/binHash";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { holderRow } from "../drivers/utils/holderRow";
import { field } from "../engine/parsing/readValue";
import { vfxQueries } from "../hooks/useVfxSystem";
import { useEmitters } from "../inspector/state/emitterChoice";
import { VfxRunContext } from "../playback/state/run";
import type { SystemStart } from "../templates/SystemTemplatePicker";
import { freeName } from "../templates/templateEdits";
import { addChildEdits, boneEdits, moveChildEdits, removeChildEdits } from "./childEdits";
import { type AuthoredChildSet, authoredChildSet, CHILD_FIELD, CHILD_SET } from "./childModel";

const SYSTEM_CLASS = nameHash("VfxSystemDefinitionData");

/** The folder a new system's name starts in when no project is open, as a new object's does. */
const NO_MOD = "mod";

export const childQueries = {
  /** The systems a child of an open document can link, read again after every edit. */
  targets: (document: BinDocumentId) =>
    queryOptions<VfxObject[], AppError>({
      queryKey: ["vfx-child-targets", document],
      queryFn: queryFnWithArgs(api.bin.vfxChildTargets, document),
      staleTime: Infinity,
      retry: false,
    }),
};

/** The child set of the emitter the inspector draws, read off its system. */
export function useChildren() {
  const { card, target } = useEmitters();
  const run = use(VfxRunContext);
  const query = useQuery({
    ...vfxQueries.system(run?.document ?? (0 as BinDocumentId), card?.row.entry ?? ""),
    enabled: card !== undefined && run !== null,
  });

  return useMemo(() => {
    const list = field(
      query.data?.root ?? null,
      nameHash(card?.simple ? "simpleEmitterDefinitionData" : "complexEmitterDefinitionData"),
    );
    const emitter =
      list?.type === "container" && card !== undefined ? (list.items[card.index] ?? null) : null;

    return {
      card,
      set: card === undefined ? null : authoredChildSet(emitter, card.row.path),
      /** The path of the emitter's system, and null where no table names it. */
      systemName: query.data?.name ?? null,
      visible: run !== null && card !== undefined && target !== "system" && query.data != null,
    };
  }, [card, target, run, query.data]);
}

/** The edits of one emitter's child set, each null where the document takes no edit. */
export interface ChildActions {
  /** Add a child that links the system `entry`. */
  readonly add: ((entry: string) => Promise<boolean>) | null;
  readonly remove: ((index: number) => Promise<boolean>) | null;
  readonly move: ((from: number, to: number) => Promise<boolean>) | null;
  /** Write the bone of the child at `index`. An empty bone that leaves none removes the list. */
  readonly setBone: ((index: number, bone: string) => Promise<boolean>) | null;
  /** Create a system from `start` under a name free in the document, and add it as a child. */
  readonly create: ((start: SystemStart) => Promise<boolean>) | null;
}

const NO_ACTIONS: ChildActions = {
  add: null,
  remove: null,
  move: null,
  setBone: null,
  create: null,
};

/**
 * The edits of the child set `set` of the emitter at `holder`, each one undo step.
 *
 * Creating a system is two steps, the object and then the child that links it. `systemName` is
 * the path of the emitter's system, which a new system's name starts from, and `systems`
 * are the systems whose names it must differ from.
 */
export function useChildActions(
  holder: BinRow | null,
  set: AuthoredChildSet | null,
  systemName: string | null,
  systems: readonly VfxObject[] | undefined,
): ChildActions {
  const edit = use(LeafEditContext);
  const project = useOptionalProjectContext();
  const folder = `Mods/${project?.name ?? NO_MOD}/`;

  return useMemo(() => {
    const editProperty = edit?.editProperty;
    if (holder === null || set === null || editProperty === undefined) return NO_ACTIONS;

    const send = (edits: ValueEdit[]) => editProperty(holder, CHILD_SET, edits);
    const { removeProperty, send: call, landed } = edit ?? {};

    return {
      add: (entry) => send(addChildEdits(set, entry)),
      remove: (index) => send(removeChildEdits(set, index)),
      move: (from, to) => send(moveChildEdits(set, from, to)),
      setBone: (index, bone) => {
        const edits = boneEdits(set, index, bone);
        if (edits !== null) return send(edits);
        if (removeProperty === undefined || set.bones.length === 0) return Promise.resolve(false);

        const bones = `${set.hashPath}.${CHILD_FIELD.bones.slice(2)}`;
        return removeProperty(holderRow(holder.entry, bones));
      },
      create:
        call === undefined || systems === undefined
          ? null
          : async (start) => {
              const taken = new Set(systems.flatMap((each) => each.name ?? []));
              const name = freeName(taken, `${systemName ?? `${folder}Vfx`}_Child`);
              const origin: NewObject =
                start.kind === "template"
                  ? { type: "template", template: start.template.id }
                  : { type: "class", class: SYSTEM_CLASS };

              const { result, id } = await call((id) =>
                api.bin.edit(id, { kind: "object", edit: { kind: "create", name, origin } }),
              );
              if (!result.ok || result.value.kind !== "object") return false;

              landed?.(id);
              return send(addChildEdits(set, result.value.entry));
            },
    };
  }, [edit, holder, set, systemName, systems, folder]);
}
