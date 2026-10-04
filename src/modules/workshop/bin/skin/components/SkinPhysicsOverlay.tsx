import { use, useMemo } from "react";

import type { SkinModel } from "@/lib/tauri";
import { DynamicsOverlay, type DynamicsOverlayProps } from "@/modules/viewport";
import {
  usePreviewColliders,
  usePreviewPhysics,
  usePreviewSimulatedJoints,
  usePreviewSockets,
} from "@/stores";

import { SkinTintContext } from "../state/skinTint";
import { parameterTint } from "../utils/dynamicsModel";

export interface SkinPhysicsOverlayProps extends Pick<
  DynamicsOverlayProps,
  "pose" | "clock" | "scale" | "colors" | "rig"
> {
  readonly skin: SkinModel;
  /** The pose modifiers the preview leaves out, by hash path. */
  readonly muted: ReadonlySet<string>;
  /** The collision shapes of every chain, each placed on its joints. */
  readonly shapes: NonNullable<DynamicsOverlayProps["colliders"]>;
}

/**
 * The dynamics overlay of a skin's viewport: what the Physics menu's switches leave on,
 * tinted by the chain parameter under the pointer in the Physics pane.
 */
export function SkinPhysicsOverlay({
  skin,
  muted,
  shapes,
  rig,
  ...drawn
}: SkinPhysicsOverlayProps) {
  const overlay = usePreviewPhysics();
  const joints = usePreviewSimulatedJoints();
  const colliders = usePreviewColliders();
  const sockets = usePreviewSockets();
  const tinted = use(SkinTintContext)?.tinted ?? null;
  const tint = useMemo(() => parameterTint(skin, muted, rig, tinted), [skin, muted, rig, tinted]);
  if (!overlay) return null;

  return (
    <DynamicsOverlay
      {...drawn}
      rig={joints ? rig : null}
      colliders={colliders ? shapes : undefined}
      sockets={sockets}
      tint={tint}
    />
  );
}
