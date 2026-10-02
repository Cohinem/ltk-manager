import { useCallback } from "react";

import type { EmitterModel } from "../../engine/model/model";
import { useEmitters } from "../../inspector/state/emitterChoice";
import type { LanePick } from "../utils/selection";

/** Select what a lane head selects: the emitter's card, or the child lane under its parent's. */
export function useLaneSelect(): (pick: LanePick) => void {
  const { cards, chooseCard, chooseChild } = useEmitters();

  return useCallback(
    (pick: LanePick) => {
      const cardOf = (emitter: EmitterModel) =>
        cards.find((card) => card.simple === emitter.simple && card.index === emitter.listIndex);

      if (pick.kind === "child") {
        chooseChild({
          path: pick.lane.path,
          parent: cardOf(pick.parent)?.key ?? null,
          system: pick.lane.system,
          emitter: pick.lane.emitter,
        });
        return;
      }

      const card = cardOf(pick.emitter);
      if (card !== undefined) chooseCard(card.key);
    },
    [cards, chooseCard, chooseChild],
  );
}
