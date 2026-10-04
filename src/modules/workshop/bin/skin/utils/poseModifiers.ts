import {
  CompassIcon,
  type Icon,
  LockIcon,
  MagnetIcon,
  PathIcon,
  SpiralIcon,
  UsersIcon,
  VibrateIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { PoseModifier } from "@/lib/tauri";

/** One class of `BaseRigPoseModifierData` as the pane names it. */
export interface ModifierKind {
  /** What the typed read calls an entry of the class. */
  readonly kind: PoseModifier["kind"];
  readonly class: string;
  readonly icon: Icon;
  readonly title: () => string;
  /** What the modifier does and what the preview shows of it, and null for a kind whose fields say it. */
  readonly hint: (() => string) | null;
}

/** Every class of `BaseRigPoseModifierData`, in the order the add menu lists them. */
export const MODIFIER_KINDS: readonly ModifierKind[] = [
  {
    kind: "dynamicsChain",
    class: "DynamicsChainRigPoseModifierData",
    icon: WaveSineIcon,
    title: m.workshop_bin_physics_chain_title,
    hint: null,
  },
  {
    kind: "spring",
    class: "SpringPhysicsRigPoseModifierData",
    icon: SpiralIcon,
    title: m.workshop_bin_physics_spring_title,
    hint: null,
  },
  {
    kind: "conformToPath",
    class: "ConformToPathRigPoseModifierData",
    icon: PathIcon,
    title: m.workshop_bin_physics_conform_title,
    hint: null,
  },
  {
    kind: "jointOrientation",
    class: "JointOrientationRigPoseModifierData",
    icon: CompassIcon,
    title: m.workshop_bin_physics_orientation_title,
    hint: m.workshop_bin_physics_orientation_hint,
  },
  {
    kind: "lockRootOrientation",
    class: "LockRootOrientationRigPoseModifierData",
    icon: LockIcon,
    title: m.workshop_bin_physics_lock_root_title,
    hint: m.workshop_bin_physics_lock_root_hint,
  },
  {
    kind: "jointSnap",
    class: "JointSnapRigPoseModifilerData",
    icon: MagnetIcon,
    title: m.workshop_bin_physics_joint_snap_title,
    hint: m.workshop_bin_physics_joint_snap_hint,
  },
  {
    kind: "syncedAnimation",
    class: "SyncedAnimationRigPoseModifierData",
    icon: UsersIcon,
    title: m.workshop_bin_physics_synced_animation_title,
    hint: m.workshop_bin_physics_synced_animation_hint,
  },
  {
    kind: "vertexAnimation",
    class: "VertexAnimationRigPoseModifierData",
    icon: VibrateIcon,
    title: m.workshop_bin_physics_vertex_animation_title,
    hint: m.workshop_bin_physics_vertex_animation_hint,
  },
];

/**
 * The classes of `ILogicVector3Driver` a source is offered where the document names none:
 * the three the game ships a joint orientation with, by hash since no table names them,
 * and the named ones.
 */
export const ORIENTATION_SOURCES: readonly string[] = [
  "0x19da44b2",
  "0x4f92775c",
  "0x06a97ad3",
  "MoveVelocityVector3Driver",
  "RawVector3ConceptLogicDriver",
  "EasedVector3ConceptLogicDriver",
  "BoundingBoxSizeVector3Driver",
  "EmptyLogicVector3Driver",
];

/** The kind the typed read calls `kind`, and undefined for a class the pane has no name for. */
export function modifierKind(kind: PoseModifier["kind"]): ModifierKind | undefined {
  return MODIFIER_KINDS.find((each) => each.kind === kind);
}
