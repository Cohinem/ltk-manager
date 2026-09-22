import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";

import { nameHash } from "../../shared/utils/binHash";
import { field } from "../engine/parsing/readValue";
import { vfxQueries } from "../hooks/useVfxSystem";
import { useEmitters } from "../inspector/state/emitterChoice";
import { VfxRunContext } from "../playback/state/run";
import { authoredForces, FORCE_COLLECTION, forceRow } from "./forceModel";

/** Authored force instances for the selected emitter, with addresses into the source document. */
export function useForces() {
  const { card, child, target } = useEmitters();
  const run = use(VfxRunContext);
  const system = run?.system;
  const query = useQuery({
    ...vfxQueries.system(run?.document ?? 0, card?.row.entry ?? ""),
    enabled: card !== undefined && run !== null,
  });

  return useMemo(() => {
    const list = field(
      query.data?.root ?? null,
      nameHash(card?.simple ? "simpleEmitterDefinitionData" : "complexEmitterDefinitionData"),
    );
    const emitterNode =
      list?.type === "container" && card !== undefined ? list.items[card.index] : null;
    const collection = field(emitterNode ?? null, FORCE_COLLECTION);
    const emitter = system?.emitters.find(
      (emitter) => emitter.simple === card?.simple && emitter.listIndex === card?.index,
    );
    const parent =
      card === undefined
        ? null
        : forceRow(
            card.row.entry,
            `${card.row.path}.${FORCE_COLLECTION.slice(2)}`,
            "fieldCollectionDefinition",
            collection ?? { type: "null" },
          );
    const forces = parent === null ? [] : authoredForces(collection, parent, emitter?.index ?? -1);

    return {
      card,
      forces,
      collection,
      emitterNode,
      pending: query.isPending,
      error: query.error,
      visible: run !== null && card !== undefined && target !== "system",
      hosted: child === null && emitter !== undefined,
    };
  }, [card, child, target, system, run, query.data, query.isPending, query.error]);
}
