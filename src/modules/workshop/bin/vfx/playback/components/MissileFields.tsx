import { m } from "@/i18n";

import type { MissileHeight, MissileMovement, MissileSpline } from "../../engine/model/missile";
import { ChoiceRow, NumberRow, PointRow, SwitchRow } from "./RigRows";

const AXIS_LABEL: readonly (() => string)[] = [
  m.workshop_bin_preview_rig_axis_yz_label,
  m.workshop_bin_preview_rig_axis_xz_label,
  m.workshop_bin_preview_rig_axis_xy_label,
];

/** The fields of `movement`'s own class. */
export function MovementFields({
  movement,
  onChange,
}: {
  movement: MissileMovement;
  onChange: (next: MissileMovement) => void;
}) {
  switch (movement.kind) {
    case "fixedSpeed":
      return (
        <NumberRow
          label={m.workshop_bin_preview_rig_speed_label()}
          value={movement.speed}
          step={100}
          onChange={(speed) => onChange({ ...movement, speed })}
        />
      );
    case "fixedTime":
      return (
        <NumberRow
          label={m.workshop_bin_preview_rig_travel_time_label()}
          value={movement.travelTime}
          step={0.05}
          onChange={(travelTime) => onChange({ ...movement, travelTime })}
        />
      );
    case "accelerating":
    case "decelToLocation":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_initial_speed_label()}
            value={movement.initialSpeed}
            step={100}
            onChange={(initialSpeed) => onChange({ ...movement, initialSpeed })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_acceleration_label()}
            value={movement.acceleration}
            step={100}
            onChange={(acceleration) => onChange({ ...movement, acceleration })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_min_speed_label()}
            value={movement.minSpeed}
            step={100}
            onChange={(minSpeed) => onChange({ ...movement, minSpeed })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_max_speed_label()}
            value={movement.maxSpeed}
            step={100}
            onChange={(maxSpeed) => onChange({ ...movement, maxSpeed })}
          />
        </>
      );
    case "fixedSpeedSpline":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_speed_label()}
            value={movement.speed}
            step={100}
            onChange={(speed) => onChange({ ...movement, speed })}
          />
          <SplineFields
            spline={movement.spline}
            onChange={(spline) => onChange({ ...movement, spline })}
          />
        </>
      );
    case "fixedTimeSpline":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_travel_time_label()}
            value={movement.travelTime}
            step={0.05}
            onChange={(travelTime) => onChange({ ...movement, travelTime })}
          />
          <SplineFields
            spline={movement.spline}
            onChange={(spline) => onChange({ ...movement, spline })}
          />
        </>
      );
    case "physics":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_initial_speed_label()}
            value={movement.initialSpeed}
            step={100}
            onChange={(initialSpeed) => onChange({ ...movement, initialSpeed })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_drag_label()}
            value={movement.drag}
            step={0.1}
            onChange={(drag) => onChange({ ...movement, drag })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_lifetime_label()}
            value={movement.lifetime}
            step={0.1}
            onChange={(lifetime) => onChange({ ...movement, lifetime })}
          />
        </>
      );
    case "circle":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_angular_velocity_label()}
            value={movement.angularVelocity}
            step={0.1}
            onChange={(angularVelocity) => onChange({ ...movement, angularVelocity })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_linear_velocity_label()}
            value={movement.linearVelocity}
            step={100}
            onChange={(linearVelocity) => onChange({ ...movement, linearVelocity })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_radial_velocity_label()}
            value={movement.radialVelocity}
            step={10}
            onChange={(radialVelocity) => onChange({ ...movement, radialVelocity })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_lifetime_label()}
            value={movement.lifetime}
            step={0.1}
            onChange={(lifetime) => onChange({ ...movement, lifetime })}
          />
        </>
      );
    case "syncCircle":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_angular_velocity_label()}
            value={movement.angularVelocity}
            step={0.1}
            onChange={(angularVelocity) => onChange({ ...movement, angularVelocity })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_lifetime_label()}
            value={movement.lifetime}
            step={0.1}
            onChange={(lifetime) => onChange({ ...movement, lifetime })}
          />
          <ChoiceRow
            label={m.workshop_bin_preview_rig_axis_label()}
            value={String(movement.axis)}
            options={AXIS_LABEL.map((label, axis) => [String(axis), label()] as const)}
            onChange={(axis) => onChange({ ...movement, axis: Number(axis) })}
          />
        </>
      );
  }
}

/** The `HermiteSplineInfo` fields of a spline movement. */
function SplineFields({
  spline,
  onChange,
}: {
  spline: MissileSpline;
  onChange: (next: MissileSpline) => void;
}) {
  return (
    <>
      <PointRow
        label={m.workshop_bin_preview_rig_start_tangent_label()}
        value={spline.control1}
        onChange={(control1) => onChange({ ...spline, control1 })}
      />
      <PointRow
        label={m.workshop_bin_preview_rig_end_tangent_label()}
        value={spline.control2}
        onChange={(control2) => onChange({ ...spline, control2 })}
      />
      <PointRow
        label={m.workshop_bin_preview_rig_start_offset_label()}
        value={spline.startOffset}
        step={10}
        onChange={(startOffset) => onChange({ ...spline, startOffset })}
      />
      <SwitchRow
        label={m.workshop_bin_preview_rig_from_missile_label()}
        checked={spline.fromMissile}
        onChange={(fromMissile) => onChange({ ...spline, fromMissile })}
      />
    </>
  );
}

/** The fields of `height`'s own solver class. */
export function HeightFields({
  height,
  onChange,
}: {
  height: MissileHeight;
  onChange: (next: MissileHeight) => void;
}) {
  switch (height.kind) {
    case "blendedLinear":
      return null;
    case "gravity":
      return (
        <NumberRow
          label={m.workshop_bin_preview_rig_height_solver_gravity_label()}
          value={height.gravity}
          step={500}
          onChange={(gravity) => onChange({ ...height, gravity })}
        />
      );
    case "followTerrain":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_height_offset_label()}
            value={height.heightOffset}
            step={10}
            onChange={(heightOffset) => onChange({ ...height, heightOffset })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_max_slope_label()}
            value={height.maxSlope}
            step={1}
            onChange={(maxSlope) => onChange({ ...height, maxSlope })}
          />
        </>
      );
    case "sinusoidal":
      return (
        <>
          <NumberRow
            label={m.workshop_bin_preview_rig_amplitude_label()}
            value={height.amplitude}
            step={10}
            onChange={(amplitude) => onChange({ ...height, amplitude })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_periods_label()}
            value={height.periods}
            step={0.1}
            onChange={(periods) => onChange({ ...height, periods })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_vertical_offset_label()}
            value={height.verticalOffset}
            step={10}
            onChange={(verticalOffset) => onChange({ ...height, verticalOffset })}
          />
          <NumberRow
            label={m.workshop_bin_preview_rig_phase_label()}
            value={height.phase}
            step={0.05}
            onChange={(phase) => onChange({ ...height, phase })}
          />
        </>
      );
    case "curveTheDifference":
      return (
        <NumberRow
          label={m.workshop_bin_preview_rig_initial_target_offset_label()}
          value={height.initialTargetHeightOffset}
          step={10}
          onChange={(initialTargetHeightOffset) =>
            onChange({ ...height, initialTargetHeightOffset })
          }
        />
      );
  }
}
