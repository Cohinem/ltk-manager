import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";

import { type BakeTangentsSource, useBakeTangents } from "../hooks/useBakeTangents";

/** Tangent baking for the mesh held in the viewed skin's project layer. */
export function BakeTangentsButton(source: BakeTangentsSource) {
  const bake = useBakeTangents(source);
  if (!bake.offered) {
    return null;
  }

  return (
    <Tooltip content={bake.hint}>
      <Button
        variant="ghost"
        size="xs"
        focusableWhenDisabled
        disabled={!bake.available || bake.pending}
        onClick={bake.run}
      >
        {bake.pending && m.workshop_bin_skin_tangents_pending_label()}
        {!bake.pending && m.workshop_bin_skin_tangents_action()}
      </Button>
    </Tooltip>
  );
}
