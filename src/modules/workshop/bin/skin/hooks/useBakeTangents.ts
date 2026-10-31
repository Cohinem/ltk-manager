import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components";
import { m } from "@/i18n";
import { api, type AssetRef, type BinDocumentId } from "@/lib/tauri";
import { viewportQueries } from "@/modules/viewport";
import { unwrapForQuery } from "@/utils/query";

import { previewKeys } from "../../../preview/api/queries";
import { workshopKeys } from "../../../shared/api/keys";

export interface BakeTangentsSource {
  readonly document: BinDocumentId;
  readonly entry: string;
  readonly asset: AssetRef;
  readonly mesh: AssetRef | null;
}

/** The tangent bake of one skin, as the rail's button and the File menu offer it. */
export interface BakeTangents {
  /** `false` outside a project layer, where neither surface offers the bake. */
  readonly offered: boolean;
  /** `true` if the skin's mesh sits in the same layer as the skin. */
  readonly available: boolean;
  readonly pending: boolean;
  readonly hint: string;
  readonly run: () => void;
}

/**
 * Returns the tangent bake of the mesh in the viewed skin's project layer.
 *
 * Every caller for one skin shares the pending state through the mutation key, so the rail and the
 * File menu cannot start a second bake.
 */
export function useBakeTangents({
  document,
  entry,
  asset,
  mesh,
}: BakeTangentsSource): BakeTangents {
  const client = useQueryClient();
  const toast = useToast();
  const mutationKey = ["skin-bake-tangents", document, entry];
  const bake = useMutation({
    mutationKey,
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
  const pending = useIsMutating({ mutationKey }) > 0;

  const available =
    asset.kind === "layer" &&
    mesh?.kind === "layer" &&
    mesh.project === asset.project &&
    mesh.layer === asset.layer;

  return {
    offered: asset.kind === "layer",
    available,
    pending,
    hint: available
      ? m.workshop_bin_skin_tangents_hint()
      : m.workshop_bin_skin_tangents_layer_hint(),
    run: () => bake.mutate(),
  };
}
