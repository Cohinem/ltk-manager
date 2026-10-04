import { m } from "@/i18n";
import type { FieldSchema } from "@/lib/tauri";

import { emitterLabel } from "../../vfx/inspector/utils/emitterLabels";
import { FIELD, JOINT_TREES, TREE_GROUPS } from "./dynamicsFields";

/**
 * The fields a name says too little for: the ones no table names, each called for what the
 * game does with it, and the two switches of a spring whose names say what the code does
 * rather than what the joint does.
 */
const LABELS: ReadonlyMap<string, () => string> = new Map([
  [FIELD.colliderFile, m.workshop_bin_physics_collider_file_label],
  [FIELD.sharedCurveLength, m.workshop_bin_physics_shared_length_label],
  [FIELD.restLengthFromPose, m.workshop_bin_physics_rest_from_pose_label],
  [FIELD.tipsWithoutRadius, m.workshop_bin_physics_tips_without_radius_label],
  [FIELD.doTranslation, m.workshop_bin_physics_spring_translation_label],
  [FIELD.doRotation, m.workshop_bin_physics_spring_rotation_label],
  [FIELD.orientationTiltAxis, m.workshop_bin_physics_orientation_tilt_axis_label],
  [FIELD.orientationAimAxis, m.workshop_bin_physics_orientation_aim_axis_label],
  [FIELD.orientationAimNegated, m.workshop_bin_physics_orientation_aim_negated_label],
  [FIELD.orientationFlipped, m.workshop_bin_physics_orientation_flipped_label],
  [FIELD.orientationMaxAngle, m.workshop_bin_physics_orientation_max_angle_label],
]);

/** What a field of a pose modifier or a socket reads as, as the VFX inspector labels its own. */
export function dynamicsLabel(hash: string, name?: string): string | undefined {
  return LABELS.get(hash.toLowerCase())?.() ?? emitterLabel(hash, name);
}

/**
 * The fields of a class as the Physics pane draws them: the ones the installed build
 * declares, a group's trees first, the embeds after the plain fields and a chain's groups
 * last.
 *
 * A field no revision covers at the installed build is one the game does not read.
 */
export function dynamicsFields(
  _classHash: string,
  fields: readonly FieldSchema[],
): readonly FieldSchema[] {
  const rank = (field: FieldSchema) => {
    if (field.hash === JOINT_TREES) return 0;
    if (field.hash === TREE_GROUPS) return 3;
    return field.declared?.kind === "embed" ? 2 : 1;
  };
  const read = fields.filter((field) => field.declared !== null);
  return [0, 1, 2, 3].flatMap((wanted) => read.filter((field) => rank(field) === wanted));
}
