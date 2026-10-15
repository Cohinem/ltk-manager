import { useMemo } from "react";

import { m } from "@/i18n";
import { CHAMPION_HEIGHT } from "@/modules/viewport";

import { SliderRow } from "../../../shared/preview/SliderRow";
import type {
  MissileFacing,
  MissileFlight,
  MissileHeight,
  MissileHeightKind,
  MissileMovement,
  MissileMovementKind,
  MissileSpline,
} from "../../engine/model/missile";
import {
  circles,
  distance,
  FLIGHT_SPEED,
  missileMotion,
  type MissileMotion,
  type Motion,
} from "../../engine/model/rig";
import { HeightFields, MovementFields } from "./MissileFields";
import { ChoiceRow, NumberRow, SwitchRow } from "./RigRows";

/** What the distance slider spans, in engine units. */
const DISTANCE = { least: CHAMPION_HEIGHT, most: CHAMPION_HEIGHT * 20, step: CHAMPION_HEIGHT / 4 };

/** The movements an author picks between, in the order the menu lists them. */
const MOVEMENTS: readonly MissileMovementKind[] = [
  "fixedSpeed",
  "fixedTime",
  "accelerating",
  "decelToLocation",
  "fixedSpeedSpline",
  "fixedTimeSpline",
  "physics",
  "circle",
  "syncCircle",
];

const MOVEMENT_LABEL: Record<MissileMovementKind, () => string> = {
  fixedSpeed: m.workshop_bin_preview_rig_movement_fixed_speed_label,
  fixedTime: m.workshop_bin_preview_rig_movement_fixed_time_label,
  accelerating: m.workshop_bin_preview_rig_movement_accelerating_label,
  decelToLocation: m.workshop_bin_preview_rig_movement_decel_label,
  fixedSpeedSpline: m.workshop_bin_preview_rig_movement_fixed_speed_spline_label,
  fixedTimeSpline: m.workshop_bin_preview_rig_movement_fixed_time_spline_label,
  physics: m.workshop_bin_preview_rig_movement_physics_label,
  circle: m.workshop_bin_preview_rig_movement_circle_label,
  syncCircle: m.workshop_bin_preview_rig_movement_sync_circle_label,
};

/** The height solvers, with none first. */
const HEIGHTS: readonly (MissileHeightKind | "none")[] = [
  "none",
  "blendedLinear",
  "gravity",
  "followTerrain",
  "sinusoidal",
  "curveTheDifference",
];

const HEIGHT_LABEL: Record<MissileHeightKind | "none", () => string> = {
  none: m.workshop_bin_preview_rig_height_solver_none_label,
  blendedLinear: m.workshop_bin_preview_rig_height_solver_blended_label,
  gravity: m.workshop_bin_preview_rig_height_solver_gravity_label,
  followTerrain: m.workshop_bin_preview_rig_height_solver_follow_terrain_label,
  sinusoidal: m.workshop_bin_preview_rig_height_solver_sinusoidal_label,
  curveTheDifference: m.workshop_bin_preview_rig_height_solver_curve_label,
};

const FACINGS: readonly MissileFacing[] = ["none", "matchVelocity", "faceTarget"];

const FACING_LABEL: Record<MissileFacing, () => string> = {
  none: m.workshop_bin_preview_rig_facing_none_label,
  matchVelocity: m.workshop_bin_preview_rig_facing_match_velocity_label,
  faceTarget: m.workshop_bin_preview_rig_facing_face_target_label,
};

/** The spline a spline movement starts on: `HermiteSplineInfo`'s defaults. */
const FIRST_SPLINE: MissileSpline = {
  startOffset: [0, 0, 0],
  control1: [-1, 0, 0],
  control2: [1, 0, 0],
  fromMissile: true,
};

/** Returns the movement of `kind` an author switches to, with sensible starting values. */
function movementOf(kind: MissileMovementKind): MissileMovement {
  switch (kind) {
    case "fixedSpeed":
      return { kind, speed: FLIGHT_SPEED };
    case "fixedTime":
      return { kind, travelTime: 0.75 };
    case "accelerating":
    case "decelToLocation":
      return { kind, initialSpeed: 600, acceleration: 3000, minSpeed: 600, maxSpeed: 2400 };
    case "fixedSpeedSpline":
      return { kind, speed: FLIGHT_SPEED, spline: FIRST_SPLINE };
    case "fixedTimeSpline":
      return { kind, travelTime: 0.75, spline: FIRST_SPLINE };
    case "physics":
      return { kind, initialSpeed: 2000, drag: 2, lifetime: 2 };
    case "circle":
      return { kind, angularVelocity: Math.PI, linearVelocity: 0, radialVelocity: 0, lifetime: 0 };
    case "syncCircle":
      return { kind, angularVelocity: Math.PI, lifetime: 0, axis: 1 };
  }
}

/** Returns the height solver of `kind` an author switches to, and null for none. */
function heightOf(kind: MissileHeightKind | "none"): MissileHeight | null {
  switch (kind) {
    case "none":
      return null;
    case "blendedLinear":
      return { kind };
    case "gravity":
      return { kind, gravity: 5000 };
    case "followTerrain":
      return { kind, heightOffset: 70, maxSlope: 10 };
    case "sinusoidal":
      return { kind, amplitude: 50, periods: 0.7, verticalOffset: 0, phase: 0 };
    case "curveTheDifference":
      return { kind, initialTargetHeightOffset: 300 };
  }
}

/**
 * The missile rig's controls: the movement and its fields, the distance, the height solver and
 * the vertical facing, each named for the `MissileSpecification` field it stands for.
 */
export function MissileRows({
  motion,
  onMotionChange,
}: {
  motion: MissileMotion;
  onMotionChange: (next: Motion) => void;
}) {
  const { flight } = motion;
  const span = useMemo(() => distance(motion.from, motion.to), [motion.from, motion.to]);
  const fly = (next: MissileFlight) => onMotionChange({ ...motion, flight: next });
  const move = (movement: MissileMovement) => fly({ ...flight, movement });

  return (
    <>
      <ChoiceRow
        label={m.workshop_bin_preview_rig_movement_label()}
        value={flight.movement.kind}
        options={MOVEMENTS.map((kind) => [kind, MOVEMENT_LABEL[kind]()] as const)}
        onChange={(kind) => {
          const next = { ...flight, movement: movementOf(kind) };
          /* A circle turns about its target, so it is laid out afresh where the shape changes. */
          const changes = circles(kind) !== circles(flight.movement.kind);
          onMotionChange(changes ? missileMotion(next, span) : { ...motion, flight: next });
        }}
      />
      <MovementFields movement={flight.movement} onChange={move} />

      <SliderRow
        label={m.workshop_bin_preview_rig_distance_label()}
        reading={m.workshop_bin_preview_rig_units_label({ value: Math.round(span) })}
        value={span}
        range={DISTANCE}
        onValueChange={(next) => onMotionChange(missileMotion(flight, next))}
      />

      <ChoiceRow
        label={m.workshop_bin_preview_rig_height_solver_label()}
        value={flight.height?.kind ?? "none"}
        options={HEIGHTS.map((kind) => [kind, HEIGHT_LABEL[kind]()] as const)}
        onChange={(kind) => fly({ ...flight, height: heightOf(kind) })}
      />
      {flight.height !== null && (
        <HeightFields height={flight.height} onChange={(height) => fly({ ...flight, height })} />
      )}

      <ChoiceRow
        label={m.workshop_bin_preview_rig_facing_label()}
        value={flight.facing}
        options={FACINGS.map((facing) => [facing, FACING_LABEL[facing]()] as const)}
        onChange={(facing) => fly({ ...flight, facing })}
      />
      <SwitchRow
        label={m.workshop_bin_preview_rig_land_at_launch_height_label()}
        checked={flight.endAtLaunchHeight}
        onChange={(endAtLaunchHeight) => fly({ ...flight, endAtLaunchHeight })}
      />
      <NumberRow
        label={m.workshop_bin_preview_rig_target_offset_label()}
        value={flight.targetOffset}
        step={10}
        onChange={(targetOffset) => fly({ ...flight, targetOffset })}
      />
    </>
  );
}
