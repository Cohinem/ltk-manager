import { AnchorIcon, type Icon, QuestionIcon } from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { PoseModifier, Socket } from "@/lib/tauri";
import type { Pose } from "@/modules/viewport";

import { jointLabel } from "./dynamicsModel";
import { modifierKind } from "./poseModifiers";

/** One pose modifier or socket as the Physics pane lists it and heads its fields. */
export interface PhysicsItem {
  /** The hash path the item is read at, which is also how its row is found. */
  readonly path: string;
  readonly icon: Icon;
  readonly title: string;
  /** What the item is about, after its title: a joint, a chain of joints, a class. */
  readonly detail: string | null;
  /** The preview simulates the item, so it carries the preview eye. */
  readonly previewed: boolean;
}

/** The kinds the preview leaves out of a bake where the reader mutes them. */
const PREVIEWED: ReadonlySet<PoseModifier["kind"]> = new Set([
  "dynamicsChain",
  "spring",
  "conformToPath",
  "jointOrientation",
]);

/**
 * A pose modifier as the pane lists it. A class the pane has no name for reads as its
 * class, so a modifier a later patch adds can still be picked, edited and removed.
 */
export function modifierItem(modifier: PoseModifier, pose: Pose): PhysicsItem {
  const kind = modifierKind(modifier.kind);

  return {
    path: modifier.path,
    icon: kind?.icon ?? QuestionIcon,
    title: kind?.title() ?? className(modifier),
    detail: modifierDetail(modifier, pose),
    previewed: PREVIEWED.has(modifier.kind),
  };
}

/** A socket as the pane lists it: its name, and what it rides. */
export function socketItem(socket: Socket, pose: Pose): PhysicsItem {
  return {
    path: socket.path,
    icon: AnchorIcon,
    title: socket.name,
    detail: ridden(socket, pose),
    previewed: false,
  };
}

function className(modifier: PoseModifier): string {
  return modifier.kind === "other" ? modifier.class : modifier.kind;
}

/** The joints a modifier works on, and null for a kind that names none. */
function modifierDetail(modifier: PoseModifier, pose: Pose): string | null {
  if (modifier.kind === "spring") return jointLabel(pose, modifier.joint);
  if (modifier.kind === "conformToPath") {
    const start = jointLabel(pose, modifier.start) ?? "-";
    const end = jointLabel(pose, modifier.end) ?? "-";
    return `${start} - ${end}`;
  }
  if (modifier.kind === "jointOrientation") {
    const joints = modifier.joints.map((joint) => jointLabel(pose, joint));
    return joints.length === 0 ? null : joints.join(", ");
  }
  return null;
}

/** What a socket rides: its joint, the world, or the class of a socket the preview does not resolve. */
function ridden(socket: Socket, pose: Pose): string | null {
  if (socket.kind === "other") return socket.class;
  if (socket.kind === "world") return m.workshop_bin_physics_socket_world_label();
  return jointLabel(pose, socket.parent);
}
