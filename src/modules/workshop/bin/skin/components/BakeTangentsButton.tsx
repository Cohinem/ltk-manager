import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, Tooltip, useToast } from "@/components";
import { m } from "@/i18n";
import { api, type AssetRef, type BinDocumentId } from "@/lib/tauri";
import { viewportQueries } from "@/modules/viewport";
import { unwrapForQuery } from "@/utils/query";

import { previewKeys } from "../../../preview/api/queries";
import { workshopKeys } from "../../../shared/api/keys";

interface BakeTangentsButtonProps {
  document: BinDocumentId;
  entry: string;
  asset: AssetRef;
  mesh: AssetRef | null;
}

/** Tangent baking for the mesh held in the viewed skin's project layer. */
export function BakeTangentsButton({ document, entry, asset, mesh }: BakeTangentsButtonProps) {
  const client = useQueryClient();
  const toast = useToast();
  const bake = useMutation({
    mutationFn: async () => unwrapForQuery(await api.bin.bakeSkinTangents(document, entry)),
    onSuccess: async (saved) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: viewportQueries.mesh(saved).queryKey }),
        client.invalidateQueries({ queryKey: previewKeys.info(saved) }),
        ...(saved.kind === "layer"
          ? [client.invalidateQueries({ queryKey: workshopKeys.project(saved.project) })]
          : []),
      ]);

      toast.success(m.workshop_bin_skin_tangents_success_title());
    },
  });

  if (asset.kind !== "layer") {
    return null;
  }

  const available =
    mesh?.kind === "layer" && mesh.project === asset.project && mesh.layer === asset.layer;
  const hint = available
    ? m.workshop_bin_skin_tangents_hint()
    : m.workshop_bin_skin_tangents_layer_hint();

  return (
    <Tooltip content={hint}>
      <Button
        variant="ghost"
        size="xs"
        compact
        focusableWhenDisabled
        disabled={!available || bake.isPending}
        onClick={() => bake.mutate()}
      >
        {bake.isPending && m.workshop_bin_skin_tangents_pending_label()}
        {!bake.isPending && m.workshop_bin_skin_tangents_action()}
      </Button>
    </Tooltip>
  );
}
