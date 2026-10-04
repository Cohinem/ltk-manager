import { useMemo } from "react";

import type { Mask, SkinModel } from "@/lib/tauri";
import {
  type Colliders,
  type DynamicsRig,
  isSocketed,
  NO_DYNAMICS,
  type PlacementMode,
  type Pose,
  socketedPose,
} from "@/modules/viewport";

import type { TimedStep } from "../utils/clipEvents";
import { dynamicsCues, dynamicsModelOf, socketModelsOf } from "../utils/dynamicsModel";
import { socketModelIndex, socketTurns } from "../utils/socketEdits";
import { useColliderFiles, usePlacedColliders } from "./useColliders";
import { type DriveLive, useSimulatedPose } from "./useSimulatedPose";

export interface SkinDynamicsOptions {
  /** The clip's events, placed on the pass. */
  readonly timed: readonly TimedStep[];
  /** The masks of the skin's animation graph, which a conform weighs its joints by. */
  readonly masks: readonly Mask[] | undefined;
  /** Steps a second. */
  readonly rate: number;
  /** The pose modifiers the preview leaves out, by hash path. */
  readonly muted: ReadonlySet<string>;
  /** The reader moves the unit by hand, so the simulation steps live under it. */
  readonly live: boolean;
  /** The socket picked in the Physics pane, by hash path, and null for none. */
  readonly socket: string | null;
  readonly socketMode: PlacementMode;
}

/** The socket the viewport's gizmo stands on. */
export interface SocketHandle {
  /** The hash path of the socket. */
  readonly path: string;
  /** The socket's slot on the pose. */
  readonly slot: number;
  readonly mode: PlacementMode;
}

export interface SkinDynamics {
  /** The pose a viewport draws: the clip's, simulated, with the skin's sockets past its joints. */
  readonly pose: Pose | null;
  /** The modifiers as they were built, which the overlay draws, and null for none. */
  readonly rig: DynamicsRig | null;
  /** The collision shapes of every chain, placed on the skeleton. */
  readonly shapes: readonly Colliders[];
  /** The live simulation's step, and null while none runs. */
  readonly drive: DriveLive | null;
  /** The picked socket as the gizmo holds it, and null where the pose holds no such socket. */
  readonly handle: SocketHandle | null;
}

/**
 * The pose modifiers and the sockets of `skin` over the clip's pose, as a viewport draws them.
 *
 * "A simulated pose is a baked pass" and "A socket is a slot past the last joint" in
 * docs/plans/pose-dynamics-preview.md. A socket rides the simulated pose, so one on a
 * simulated joint follows the simulation.
 */
export function useSkinDynamics(
  skin: SkinModel,
  clipPose: Pose | null,
  { timed, masks, rate, muted, live, socket, socketMode }: SkinDynamicsOptions,
): SkinDynamics {
  const colliders = usePlacedColliders(useColliderFiles(skin), clipPose);
  const shapes = useMemo(() => [...colliders.values()], [colliders]);

  const model = useMemo(
    () =>
      clipPose === null ? NO_DYNAMICS : dynamicsModelOf(skin, clipPose, muted, colliders, masks),
    [skin, clipPose, muted, colliders, masks],
  );
  const cues = useMemo(() => dynamicsCues(timed, masks, clipPose), [timed, masks, clipPose]);
  const simulated = useSimulatedPose(clipPose, model, {
    scale: skin.scale ?? 1,
    rate,
    cues,
    live,
  });

  const pose = useMemo(() => {
    if (simulated.pose === null) return null;

    return socketedPose(simulated.pose, socketModelsOf(skin.sockets, simulated.pose));
  }, [simulated.pose, skin.sockets]);

  const handle = useMemo(() => {
    if (socket === null || pose === null || !isSocketed(pose)) return null;

    const held = skin.sockets.find((each) => each.path === socket);
    const index = socketModelIndex(skin.sockets, socket);
    const slot = index < 0 ? -1 : pose.socketSlot(index);
    if (held === undefined || slot < 0) return null;

    const mode: PlacementMode = socketTurns(held) ? socketMode : "translate";
    return { path: socket, slot, mode };
  }, [socket, socketMode, pose, skin.sockets]);

  return { pose, rig: simulated.rig, shapes, drive: simulated.drive, handle };
}
