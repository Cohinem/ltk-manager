import {
  ArrowCounterClockwiseIcon,
  BoneIcon,
  CaretDownIcon,
  DiceFiveIcon,
  type Icon,
  MapPinSimpleIcon,
  RocketLaunchIcon,
  SpiralIcon,
} from "@phosphor-icons/react";

import { Button, IconButton, OVERLINE, Popover, SegmentedControl, Switch } from "@/components";
import { m } from "@/i18n";
import { CHAMPION_HEIGHT } from "@/modules/viewport";

import { SliderRow } from "../../../shared/preview/SliderRow";
import {
  type Carrier,
  carrierOf,
  distance,
  flightPath,
  type Motion,
  ORBIT_ORIENTATIONS,
  type OrbitOrientation,
  PICKED_CARRIERS,
  type Playback,
  playbackOf,
  PLAYBACKS,
  type RigModel,
  type RigSource,
  withCarrier,
  withPlayback,
} from "../../engine/model/rig";
import { useVfxRun } from "../state/run";

/** What each slider spans, in the engine's own units and seconds. */
const RANGE = {
  distance: { least: CHAMPION_HEIGHT, most: CHAMPION_HEIGHT * 20, step: CHAMPION_HEIGHT / 4 },
  speed: { least: CHAMPION_HEIGHT / 2, most: CHAMPION_HEIGHT * 25, step: CHAMPION_HEIGHT / 4 },
  radius: { least: CHAMPION_HEIGHT / 4, most: CHAMPION_HEIGHT * 8, step: CHAMPION_HEIGHT / 8 },
  period: { least: 0.25, most: 12, step: 0.25 },
  stop: { least: 0.25, most: 30, step: 0.25 },
  height: { least: 0, most: CHAMPION_HEIGHT * 3, step: CHAMPION_HEIGHT / 20 },
} as const;

/** Where the stop lands when it is switched on, which a slider then moves. */
const FIRST_STOP = 2;

const CARRIER_LABEL: Record<Carrier, () => string> = {
  ground: m.workshop_bin_preview_rig_ground_label,
  bone: m.workshop_bin_preview_rig_bone_label,
  flight: m.workshop_bin_preview_rig_flight_label,
  orbit: m.workshop_bin_preview_rig_orbit_label,
};

/** A glyph of each carrier's motion: a place held, a joint, a flight, a circuit. */
const CARRIER_ICON: Record<Carrier, Icon> = {
  ground: MapPinSimpleIcon,
  bone: BoneIcon,
  flight: RocketLaunchIcon,
  orbit: SpiralIcon,
};

const ORIENTATION_LABEL: Record<OrbitOrientation, () => string> = {
  missile: m.workshop_bin_preview_rig_orientation_missile,
  unit: m.workshop_bin_preview_rig_orientation_unit,
};

const PLAYBACK_LABEL: Record<Playback, () => string> = {
  once: m.workshop_bin_preview_rig_once_label,
  replay: m.workshop_bin_preview_rig_replay_label,
  continuous: m.workshop_bin_preview_rig_continuous_label,
};

/**
 * The rig the preview drives the system on, off a pill in the viewport's own controls.
 *
 * The pill names the carrier and where the rig came from. The popover picks the carrier and
 * the playback, tunes the carrier's motion, and resets a chosen rig to the one the system
 * picks. The seed is beside them because a rig and a seed are the two halves of what a run
 * is. "The viewer" in docs/ux/BIN_EDITOR.md, and ADR-0057.
 */
export function RigControl() {
  const { rig: choice, setRig, resetRig } = useVfxRun();
  const rig = choice.rig;
  const carrier = carrierOf(rig.motion);
  const change = (next: RigModel) => setRig({ source: { kind: "custom" }, rig: next });
  const CarrierIcon = CARRIER_ICON[carrier];

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            left={<CarrierIcon weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
            aria-label={m.workshop_bin_preview_rig_label()}
          >
            {CARRIER_LABEL[carrier]()}
            <span className="max-w-32 truncate text-surface-400">{sourceTag(choice.source)}</span>
          </Button>
        }
      />

      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        data-ui="RigControl"
        aria-label={m.workshop_bin_preview_rig_label()}
        className="w-72 p-3 select-none"
      >
        <Popover.Title className={OVERLINE}>{m.workshop_bin_preview_rig_label()}</Popover.Title>
        <Popover.Description className="mt-0.5 text-meta text-surface-400">
          {m.workshop_bin_preview_rig_description()}
        </Popover.Description>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-surface-300">
            {sourceLine(choice.source)}
          </span>
          {choice.source.kind !== "auto" && (
            <Button
              variant="ghost"
              size="xs"
              left={<ArrowCounterClockwiseIcon weight="bold" className="size-3.5" />}
              onClick={resetRig}
            >
              {m.workshop_bin_preview_rig_reset_action()}
            </Button>
          )}
        </div>

        <SegmentedControl
          className="mt-3 w-full"
          size="sm"
          aria-label={m.workshop_bin_preview_rig_motion_label()}
          value={carrier}
          onChange={(next: Carrier) => {
            if (next !== "bone") change(withCarrier(rig, next));
          }}
          options={carrierOptions(carrier)}
        />

        <SegmentedControl
          className="mt-2 w-full"
          size="sm"
          aria-label={m.workshop_bin_preview_rig_playback_label()}
          value={playbackOf(rig.life)}
          onChange={(next: Playback) => change(withPlayback(rig, next))}
          options={PLAYBACKS.map((each) => ({ value: each, label: PLAYBACK_LABEL[each]() }))}
        />

        <div className="mt-3 flex flex-col gap-3">
          {carrier !== "bone" && (
            <SliderRow
              label={m.workshop_bin_preview_rig_height_label()}
              reading={m.workshop_bin_preview_rig_units_label({
                value: Math.round(rig.height),
              })}
              value={rig.height}
              range={RANGE.height}
              onValueChange={(height) => change({ ...rig, height })}
            />
          )}

          <MotionRows motion={rig.motion} onMotionChange={(motion) => change({ ...rig, motion })} />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-surface-300">
              {m.workshop_bin_preview_rig_stop_label()}
            </span>
            <Switch
              aria-label={m.workshop_bin_preview_rig_stop_label()}
              checked={rig.stopAt != null}
              onCheckedChange={(stop) => change({ ...rig, stopAt: stop ? FIRST_STOP : null })}
            />
          </div>
          {rig.stopAt != null && (
            <SliderRow
              label={m.workshop_bin_preview_rig_stop_after_label()}
              reading={m.workshop_bin_preview_time_label({
                seconds: rig.stopAt.toFixed(2),
              })}
              value={rig.stopAt}
              range={RANGE.stop}
              onValueChange={(stopAt) => change({ ...rig, stopAt })}
            />
          )}

          <SeedRow />
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

/** The pill's short word for where the rig came from. */
function sourceTag(source: RigSource): string {
  switch (source.kind) {
    case "auto":
      return m.workshop_bin_preview_rig_auto_label();
    case "custom":
      return m.workshop_bin_preview_rig_custom_label();
    case "template":
      return source.name;
    case "context":
      return source.label;
  }
}

/** The popover's line saying where the rig came from. */
function sourceLine(source: RigSource): string {
  switch (source.kind) {
    case "auto":
      return m.workshop_bin_preview_rig_source_auto_description();
    case "custom":
      return m.workshop_bin_preview_rig_source_custom_description();
    case "template":
      return m.workshop_bin_preview_rig_source_template_description({ name: source.name });
    case "context":
      return m.workshop_bin_preview_rig_source_context_description({ label: source.label });
  }
}

/** The carriers an author picks, and Bone beside them while a skin's joint carries the run. */
function carrierOptions(current: Carrier) {
  const carriers: Carrier[] = [...PICKED_CARRIERS];
  if (current === "bone") carriers.push("bone");

  return carriers.map((carrier) => ({ value: carrier, label: CARRIER_LABEL[carrier]() }));
}

/** The stream every draw of the run comes out of, and the button that takes another. */
function SeedRow() {
  const { seed, reroll } = useVfxRun();

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-surface-300">{m.workshop_bin_preview_seed_label()}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-meta text-code text-surface-400 tabular-nums">{seed}</span>
        <IconButton
          icon={<DiceFiveIcon />}
          onClick={reroll}
          label={m.workshop_bin_preview_seed_reroll_action()}
        />
      </div>
    </div>
  );
}

/** The sliders the motion in hand carries, and none for one with no parameters. */
function MotionRows({
  motion,
  onMotionChange,
}: {
  motion: Motion;
  onMotionChange: (next: Motion) => void;
}) {
  if (motion.kind === "path") {
    const flown = distance(motion.from, motion.to);

    return (
      <>
        <SliderRow
          label={m.workshop_bin_preview_rig_distance_label()}
          reading={m.workshop_bin_preview_rig_units_label({ value: Math.round(flown) })}
          value={flown}
          range={RANGE.distance}
          onValueChange={(distance) => onMotionChange(flightPath(distance, motion.speed))}
        />
        <SliderRow
          label={m.workshop_bin_preview_rig_speed_label()}
          reading={m.workshop_bin_preview_rig_rate_label({ value: Math.round(motion.speed) })}
          value={motion.speed}
          range={RANGE.speed}
          onValueChange={(speed) => onMotionChange({ ...motion, speed })}
        />
      </>
    );
  }

  if (motion.kind === "orbit") {
    return (
      <>
        <SliderRow
          label={m.workshop_bin_preview_rig_radius_label()}
          reading={m.workshop_bin_preview_rig_units_label({ value: Math.round(motion.radius) })}
          value={motion.radius}
          range={RANGE.radius}
          onValueChange={(radius) => onMotionChange({ ...motion, radius })}
        />
        <SliderRow
          label={m.workshop_bin_preview_rig_period_label()}
          reading={m.workshop_bin_preview_time_label({ seconds: motion.period.toFixed(2) })}
          value={motion.period}
          range={RANGE.period}
          onValueChange={(period) => onMotionChange({ ...motion, period })}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-surface-300">
            {m.workshop_bin_preview_rig_orientation_label()}
          </span>
          <SegmentedControl
            size="sm"
            aria-label={m.workshop_bin_preview_rig_orientation_label()}
            value={motion.orientation}
            onChange={(orientation: OrbitOrientation) => onMotionChange({ ...motion, orientation })}
            options={ORBIT_ORIENTATIONS.map((each) => ({
              value: each,
              label: ORIENTATION_LABEL[each](),
            }))}
          />
        </div>
      </>
    );
  }

  return null;
}
