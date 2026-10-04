import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { m } from "@/i18n";
import type { BinDocumentId, SkinModel } from "@/lib/tauri";
import { createPose, type Pose, viewportQueries } from "@/modules/viewport";

import { skinQueries } from "../api/skinQueries";

/** The bind pose of each skeleton read, so the panes of one skin read joints off one pose. */
const BIND = new WeakMap<Pose["skeleton"], Pose>();

function bindPose(skeleton: Pose["skeleton"]): Pose {
  let pose = BIND.get(skeleton);
  if (pose === undefined) {
    pose = createPose(skeleton, null);
    BIND.set(skeleton, pose);
  }

  return pose;
}

/** A skin and the bind pose of its skeleton, or what a pane says in their place. */
export type SkinBind =
  | { readonly skin: SkinModel; readonly pose: Pose; readonly notice: null }
  | { readonly skin: null; readonly pose: null; readonly notice: string };

/** The skin `entry` of `document` with its skeleton in the bind pose, for a pane's joints. */
export function useSkinBind(document: BinDocumentId, entry: string): SkinBind {
  const skin = useQuery(skinQueries.skin(document, entry));
  const skeleton = useQuery(viewportQueries.skeleton(skin.data?.skeleton?.asset ?? null));
  const failed = skin.isError || skeleton.isError;
  const model = skin.data;
  const joints = skeleton.data;

  return useMemo<SkinBind>(() => {
    if (failed) {
      return { skin: null, pose: null, notice: m.workshop_bin_mesh_preview_failed_empty() };
    }
    if (model !== undefined && !model.skeleton?.asset) {
      return { skin: null, pose: null, notice: m.workshop_bin_skeleton_empty() };
    }
    if (model === undefined || joints === undefined) {
      return { skin: null, pose: null, notice: m.workshop_bin_mesh_preview_loading_label() };
    }

    return { skin: model, pose: bindPose(joints), notice: null };
  }, [failed, model, joints]);
}
