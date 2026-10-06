import { use } from "react";

import type { EmitterModel } from "../../engine/model/model";
import { VfxRunContext } from "../../playback/state/run";
import { useEmitters } from "./emitterChoice";

/** The run's model of the emitter the inspector draws, where a run holds one. */
export function useEmitterModel(): EmitterModel | undefined {
  const { card, child } = useEmitters();
  const run = use(VfxRunContext);
  if (child !== null) {
    return child.emitter;
  }

  return run?.system?.emitters.find(
    (emitter) => emitter.simple === card?.simple && emitter.listIndex === card?.index,
  );
}
