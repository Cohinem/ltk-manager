import type { Socket, ValueEdit } from "@/lib/tauri";
import {
  bindWorld,
  isSocketed,
  type PlacementMode,
  type Pose,
  type SocketPlace,
  socketOffsets,
} from "@/modules/viewport";

import { setLeafEdits } from "./dynamicsEdits";
import { FIELD } from "./dynamicsFields";

/** The decimals an offset a drag left is written with, which a file's float holds. */
const DIGITS = 4;

/**
 * Where the socket at `path` stands in the models the preview resolves, and -1 for one it
 * resolves nowhere.
 *
 * The preview leaves a socket of a class it does not know out of its models, so a
 * socket's place in the skin's list is not its place in them.
 */
export function socketModelIndex(sockets: readonly Socket[], path: string): number {
  let index = 0;
  for (const socket of sockets) {
    if (socket.kind === "other") continue;
    if (socket.path === path) return index;
    index += 1;
  }
  return -1;
}

/** Whether the gizmo can turn `socket`: it rides a joint and none of its angles is frozen. */
export function socketTurns(socket: Socket): boolean {
  return socket.kind === "singleJoint" && !socket.freezeRotation.some(Boolean);
}

/** The edits that set the parent joint of the socket at `path` to the joint named `joint`. */
export function socketParentEdits(path: string, joint: string): ValueEdit[] {
  return setLeafEdits(path, [FIELD.parentJoint], { type: "hash", text: joint });
}

/**
 * The edits that write where a drag of the gizmo left the socket at `path`.
 *
 * A move writes the position offset and a turn writes the rotation offset, each solved on
 * the pose at the time of the release. A drag the socket cannot take, a turn of a socket
 * with a frozen angle, writes nothing.
 */
export function socketDragEdits(
  pose: Pose,
  sockets: readonly Socket[],
  path: string,
  place: SocketPlace,
  mode: PlacementMode,
): ValueEdit[] {
  if (!isSocketed(pose)) return [];
  const model = pose.sockets[socketModelIndex(sockets, path)];
  if (model === undefined) return [];

  const joint =
    model.kind === "singleJoint" && model.parent >= 0
      ? pose.worldInto(model.parent, place.time, new Float32Array(16))
      : null;
  const bind = bindWorld(pose.skeleton, pose.parents);
  const offsets = socketOffsets(model, joint, bind, place.position, place.rotation);
  if (offsets === null) return [];

  if (mode === "translate") return vectorEdits(path, FIELD.positionOffset, offsets.position);
  if (offsets.rotation === null) return [];
  return vectorEdits(path, FIELD.rotationOffset, offsets.rotation);
}

function vectorEdits(path: string, field: string, values: readonly number[]): ValueEdit[] {
  const scale = 10 ** DIGITS;
  return setLeafEdits(path, [field], {
    type: "vector",
    values: values.map((value) => Math.round(value * scale) / scale + 0),
  });
}
