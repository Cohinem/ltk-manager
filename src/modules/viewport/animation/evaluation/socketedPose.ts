import { resolveSocketInto, type SocketModel } from "../../dynamics/sockets";
import { bindWorld } from "../../dynamics/world";
import type { Pose } from "./pose";

/** A pose that also answers the sockets of its skin, each as a slot past the last joint. */
export interface SocketedPose extends Pose {
  /** The sockets a lookup reaches, in the order the skin lists them. */
  readonly sockets: readonly SocketModel[];
  /** The slot socket `index` of `sockets` answers under, and -1 where a joint took its name. */
  socketSlot(index: number): number;
}

/** Whether `pose` answers sockets, which a caller looking a socket up by hash asks. */
export function isSocketed(pose: Pose): pose is SocketedPose {
  return "sockets" in pose;
}

/**
 * `base` with `sockets` answered by name beside its joints.
 *
 * "A socket is a slot past the last joint" in docs/plans/pose-dynamics-preview.md. The
 * rules are the game's: a joint with the name wins, the first socket with a name wins,
 * and a socket whose joint is missing answers no slot without falling through to a later
 * one. The skeleton is `base`'s own, so anything that walks the joints sees no socket.
 */
export function socketedPose(base: Pose, sockets: readonly SocketModel[]): Pose {
  if (sockets.length === 0) return base;

  const joints = base.skeleton.joints.length;
  const bind = bindWorld(base.skeleton, base.parents);
  const parent = new Float32Array(16);

  const named = new Map<string, number>();
  sockets.forEach((socket, index) => {
    const name = socket.name.toLowerCase();
    if (name !== "" && !named.has(name)) named.set(name, index);
  });

  /* A single joint socket whose joint is missing fails its lookup, as the game's does. */
  const slotOf = (index: number | undefined): number => {
    if (index === undefined) return -1;

    const socket = sockets[index];
    return socket.kind === "singleJoint" && socket.parent < 0 ? -1 : joints + index;
  };

  const socketed: SocketedPose = {
    skeleton: base.skeleton,
    duration: base.duration,
    parents: base.parents,
    sockets,
    localsInto: (time, out) => base.localsInto(time, out),
    jointNamed(name) {
      const joint = base.jointNamed(name);
      if (joint >= 0) return joint;

      return slotOf(named.get(name.toLowerCase()));
    },
    socketSlot(index) {
      const socket = sockets[index];
      if (socket === undefined || base.jointNamed(socket.name) >= 0) return -1;

      return named.get(socket.name.toLowerCase()) === index ? slotOf(index) : -1;
    },
    worldInto(slot, time, out) {
      if (slot < joints) return base.worldInto(slot, time, out);

      const socket = sockets[slot - joints];
      const riding =
        socket.kind === "singleJoint" && socket.parent >= 0
          ? base.worldInto(socket.parent, time, parent)
          : null;

      if (!resolveSocketInto(out, socket, riding, bind)) out.set(IDENTITY);
      return out;
    },
  };

  return socketed;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
