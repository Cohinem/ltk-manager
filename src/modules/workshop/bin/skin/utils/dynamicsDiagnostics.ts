import type { ScaledCurve, SkinModel } from "@/lib/tauri";
import { CHAIN_PARAMETERS, type ChainParameter, type Pose } from "@/modules/viewport";

import { jointSlot } from "./skinScene";

/**
 * A state of a pose modifier or a socket the game takes without complaint and a reader
 * would not expect, per "Diagnostics" in docs/plans/pose-dynamics-preview.md.
 */
export type DynamicsDiagnosticCode =
  /** A tree's root names no joint of the skeleton, so the game skips the tree. */
  | "treeRootMissing"
  /** A tree's root stands under another tree's root. */
  | "treeOverlap"
  /** A tree's joints all stand on one point, so no parameter is applied. */
  | "treeNoLength"
  /** A curve holds a key outside 0 to 1, which the game clamps. */
  | "curveClamped"
  /** A rod parameter is set where rod physics is off, which nothing reads. */
  | "rodUnread"
  /** Stretch is set where rod physics is on, which nothing reads. */
  | "stretchUnread"
  /** Lateral links are on in a group of one tree, which links nothing. */
  | "linksAlone"
  /** A socket's name is a joint's, so the joint is found and the socket never is. */
  | "socketNamedJoint"
  /** A socket's name is an earlier socket's, so the earlier one is found. */
  | "socketDuplicate"
  /** A socket's parent names no joint, so a lookup of the socket fails. */
  | "socketParentMissing"
  /** A spring names no joint of the skeleton. */
  | "springJointMissing";

/** One diagnostic, on the struct at `path`. */
export interface DynamicsDiagnostic {
  readonly path: string;
  readonly code: DynamicsDiagnosticCode;
  /** The chain parameter the diagnostic is about, where it is about one. */
  readonly parameter?: ChainParameter;
}

const ROD_PARAMETERS: readonly ChainParameter[] = ["rodBend", "rodTwist", "rodStretch", "rodShear"];

/** What each chain parameter stands at where a group sets nothing. */
const PARAMETER_DEFAULT: Record<ChainParameter, number> = {
  damping: 0.5,
  attraction: 0.5,
  radius: 5,
  envelope: 1,
  limitAngle: 180,
  stretch: 0,
  rodBend: 1,
  rodTwist: 1,
  rodStretch: 1,
  rodShear: 1,
};

function curveLeavesRange(curve: ScaledCurve): boolean {
  if (!curve.useCurve || curve.curve === null) return false;
  /* A cubic span keeps its slopes among the values, so only a curve without one is read. */
  if (curve.curve.modes.includes(2)) return false;
  return curve.curve.values.some((value) => value !== null && (value < 0 || value > 1));
}

/** Every diagnostic of `skin`'s pose modifiers and sockets, on the skeleton `pose` stands on. */
export function dynamicsDiagnostics(skin: SkinModel, pose: Pose): DynamicsDiagnostic[] {
  const found: DynamicsDiagnostic[] = [];
  const roots: number[] = [];
  const under = (slot: number, root: number) => {
    for (let at = pose.parents[slot]; at >= 0; at = pose.parents[at]) {
      if (at === root) return true;
    }
    return false;
  };

  for (const modifier of skin.poseModifiers) {
    if (modifier.kind === "spring" && jointSlot(pose, modifier.joint) < 0) {
      found.push({ path: modifier.path, code: "springJointMissing" });
    }
    if (modifier.kind !== "dynamicsChain") continue;

    for (const group of modifier.groups) {
      const { properties } = group;
      for (const parameter of CHAIN_PARAMETERS) {
        if (curveLeavesRange(properties[parameter])) {
          found.push({ path: group.path, code: "curveClamped", parameter });
        }
      }
      for (const parameter of ROD_PARAMETERS) {
        const set = properties[parameter].value !== PARAMETER_DEFAULT[parameter];
        if (!properties.useRodPhysics && set) {
          found.push({ path: group.path, code: "rodUnread", parameter });
        }
      }
      if (properties.useRodPhysics && properties.stretch.value !== PARAMETER_DEFAULT.stretch) {
        found.push({
          path: group.path,
          code: "stretchUnread",
          parameter: "stretch",
        });
      }
      if (group.lateralLinks && group.trees.length < 2) {
        found.push({ path: group.path, code: "linksAlone" });
      }

      for (const tree of group.trees) {
        const root = jointSlot(pose, tree.root);
        if (root < 0) {
          found.push({ path: tree.path, code: "treeRootMissing" });
          continue;
        }
        if (roots.some((other) => other === root || under(root, other) || under(other, root))) {
          found.push({ path: tree.path, code: "treeOverlap" });
        }
        roots.push(root);

        const long = pose.skeleton.joints.some(
          (joint, slot) => under(slot, root) && Math.hypot(...joint.translation) > 1e-9,
        );
        if (!long) found.push({ path: tree.path, code: "treeNoLength" });
      }
    }
  }

  const seen = new Set<string>();
  for (const socket of skin.sockets) {
    const name = socket.name.toLowerCase();
    if (pose.jointNamed(socket.name) >= 0) {
      found.push({ path: socket.path, code: "socketNamedJoint" });
    } else if (seen.has(name)) {
      found.push({ path: socket.path, code: "socketDuplicate" });
    }
    seen.add(name);

    if (socket.kind === "singleJoint" && jointSlot(pose, socket.parent) < 0) {
      found.push({ path: socket.path, code: "socketParentMissing" });
    }
  }
  return found;
}
