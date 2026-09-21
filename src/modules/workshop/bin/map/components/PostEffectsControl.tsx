import { ArrowCounterClockwiseIcon, CloudFogIcon } from "@phosphor-icons/react";
import { type ReactNode, useId } from "react";

import { IconButton, Popover, SegmentedControl, Switch, Tooltip } from "@/components";
import { m } from "@/i18n";
import {
  type AmbientOcclusion,
  type BackdropSource,
  type Fog,
  NO_AMBIENT_OCCLUSION,
  NO_POST_EFFECTS,
  occlusionSamples,
  type PostEffects,
  useBackdropAmbientOcclusion,
  useBackdropPostEffects,
} from "@/modules/viewport";
import { usePreviewAmbientOcclusion, usePreviewPostEffects, useSetPreviewDisplay } from "@/stores";

import { type SliderRange, SliderRow } from "../../vfx/preview/components/SliderRow";
import { ColorRow } from "./ColorRow";

/** What each slider spans, in world units, in shares of the frame and in pixels. */
const RANGE = {
  distance: { least: 0, most: 20000, step: 50 },
  height: { least: -1000, most: 1500, step: 10 },
  intensity: { least: 0, most: 1, step: 0.01 },
  focalDistance: { least: 0, most: 10000, step: 10 },
  inFocusWidth: { least: 0, most: 5000, step: 10 },
  coc: { least: 0, most: 30, step: 0.5 },
  sampleRadius: { least: 0, most: 200, step: 1 },
  power: { least: 0, most: 30, step: 0.5 },
  bias: { least: 0, most: 20, step: 0.5 },
  bufferScale: { least: 0.25, most: 1, step: 0.05 },
} satisfies Record<string, SliderRange>;

/** `SampleQuality` by the samples a pixel gathers at it. */
const SAMPLE_QUALITIES = [
  { quality: 0, samples: 4 },
  { quality: 1, samples: 8 },
] as const;

export interface PostEffectsControlProps {
  /** The backdrop whose own post effects the knobs open on and the reset returns to. */
  readonly source: BackdropSource | null;
}

/**
 * The post effects and ambient occlusion over a backdrop, off a button in the viewport's
 * controls.
 *
 * The knobs open on the map's own `PostEffectOptions` and `MapSSAO`, which switch
 * everything off where the map states none. Moving one sets custom effects for every map,
 * the occlusion apart from the rest as the game states it apart, and the reset returns each
 * map to its own. An effect's knobs show while it is on, and the button carries the accent
 * while custom effects are set.
 */
export function PostEffectsControl({ source }: PostEffectsControlProps) {
  const own = useBackdropPostEffects(source) ?? NO_POST_EFFECTS;
  const ownOcclusion = useBackdropAmbientOcclusion(source) ?? NO_AMBIENT_OCCLUSION;
  const custom = usePreviewPostEffects();
  const customOcclusion = usePreviewAmbientOcclusion();
  const setDisplay = useSetPreviewDisplay();
  const effects = custom ?? own;
  const change = (next: Partial<PostEffects>) =>
    setDisplay({ previewPostEffects: { ...effects, ...next } });
  const focus = effects.depthOfField;
  const customized = custom !== null || customOcclusion !== null;

  return (
    <Popover.Root>
      <Tooltip content={m.workshop_bin_preview_post_effects_label()}>
        <Popover.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_preview_post_effects_label()}
              /* DS-VEIL, DS-RADIUS */
              className={
                customized ? "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25" : undefined
              }
              icon={<CloudFogIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup
            data-ui="PostEffectsControl"
            aria-label={m.workshop_bin_preview_post_effects_label()}
            className="max-h-[70vh] w-72 overflow-y-auto p-3 select-none"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <Popover.Title className="text-xs font-medium tracking-wide text-surface-400 uppercase">
                  {m.workshop_bin_preview_post_effects_label()}
                </Popover.Title>
                <Popover.Description className="mt-0.5 text-meta text-surface-400">
                  {m.workshop_bin_preview_post_effects_description()}
                </Popover.Description>
              </div>
              <Tooltip content={m.workshop_bin_preview_post_effects_reset_action()}>
                <IconButton
                  variant="ghost"
                  size="xs"
                  compact
                  aria-label={m.workshop_bin_preview_post_effects_reset_action()}
                  icon={<ArrowCounterClockwiseIcon weight="bold" className="h-4 w-4" />}
                  disabled={!customized}
                  onClick={() =>
                    setDisplay({ previewPostEffects: null, previewAmbientOcclusion: null })
                  }
                />
              </Tooltip>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <OcclusionSection
                occlusion={customOcclusion ?? ownOcclusion}
                onChange={(previewAmbientOcclusion) => setDisplay({ previewAmbientOcclusion })}
              />
              <FogSection
                label={m.workshop_bin_preview_post_effects_depth_fog_label()}
                fog={effects.depthFog}
                range={RANGE.distance}
                onChange={(depthFog) => change({ depthFog })}
              />
              <FogSection
                label={m.workshop_bin_preview_post_effects_height_fog_label()}
                fog={effects.heightFog}
                range={RANGE.height}
                onChange={(heightFog) => change({ heightFog })}
              />
              <EffectSection
                label={m.workshop_bin_preview_post_effects_depth_of_field_label()}
                enabled={focus.enabled}
                onEnabledChange={(enabled) => change({ depthOfField: { ...focus, enabled } })}
              >
                <SliderRow
                  label={m.workshop_bin_preview_post_effects_focal_distance_label()}
                  reading={Math.round(focus.focalDistance).toString()}
                  value={focus.focalDistance}
                  range={RANGE.focalDistance}
                  onValueChange={(focalDistance) =>
                    change({ depthOfField: { ...focus, focalDistance } })
                  }
                />
                <SliderRow
                  label={m.workshop_bin_preview_post_effects_in_focus_width_label()}
                  reading={Math.round(focus.inFocusWidth).toString()}
                  value={focus.inFocusWidth}
                  range={RANGE.inFocusWidth}
                  onValueChange={(inFocusWidth) =>
                    change({ depthOfField: { ...focus, inFocusWidth } })
                  }
                />
                <SliderRow
                  label={m.workshop_bin_preview_post_effects_coc_label()}
                  reading={focus.coc.toFixed(1)}
                  value={focus.coc}
                  range={RANGE.coc}
                  onValueChange={(coc) => change({ depthOfField: { ...focus, coc } })}
                />
              </EffectSection>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface FogSectionProps {
  readonly label: string;
  readonly fog: Fog;
  /** What the start and the end span: a distance for the depth fog, a height for the height fog. */
  readonly range: SliderRange;
  readonly onChange: (next: Fog) => void;
}

/** One fog's switch, and its colour, ramp and intensity while it is on. */
function FogSection({ label, fog, range, onChange }: FogSectionProps) {
  const change = (next: Partial<Fog>) => onChange({ ...fog, ...next });
  return (
    <EffectSection
      label={label}
      enabled={fog.enabled}
      onEnabledChange={(enabled) => change({ enabled })}
    >
      <ColorRow
        label={m.workshop_bin_preview_post_effects_fog_color_label()}
        value={fog.color}
        onValueChange={(color) => change({ color })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_fog_start_label()}
        reading={Math.round(fog.start).toString()}
        value={fog.start}
        range={range}
        onValueChange={(start) => change({ start })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_fog_end_label()}
        reading={Math.round(fog.end).toString()}
        value={fog.end}
        range={range}
        onValueChange={(end) => change({ end })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_fog_intensity_label()}
        reading={fog.maxIntensity.toFixed(2)}
        value={fog.maxIntensity}
        range={RANGE.intensity}
        onValueChange={(maxIntensity) => change({ maxIntensity })}
      />
    </EffectSection>
  );
}

interface OcclusionSectionProps {
  readonly occlusion: AmbientOcclusion;
  readonly onChange: (next: AmbientOcclusion) => void;
}

/** The ambient occlusion's switch, and every `MapSSAOSettings` field while it is on. */
function OcclusionSection({ occlusion, onChange }: OcclusionSectionProps) {
  const change = (next: Partial<AmbientOcclusion>) => onChange({ ...occlusion, ...next });
  const samplesLabel = m.workshop_bin_preview_post_effects_occlusion_samples_label();
  const edgeAwareLabel = m.workshop_bin_preview_post_effects_occlusion_edge_aware_label();
  return (
    <EffectSection
      label={m.workshop_bin_preview_post_effects_ambient_occlusion_label()}
      enabled={occlusion.enabled}
      onEnabledChange={(enabled) => change({ enabled })}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-surface-300">{samplesLabel}</span>
        <SegmentedControl
          size="xs"
          aria-label={samplesLabel}
          options={SAMPLE_QUALITIES.map(({ quality, samples }) => ({
            value: String(quality),
            label: String(samples),
          }))}
          value={String(occlusionSamples(occlusion) === 4 ? 0 : 1)}
          onChange={(quality) => change({ sampleQuality: Number(quality) })}
        />
      </div>
      <SliderRow
        label={m.workshop_bin_preview_post_effects_occlusion_radius_label()}
        reading={Math.round(occlusion.sampleRadius).toString()}
        value={occlusion.sampleRadius}
        range={RANGE.sampleRadius}
        onValueChange={(sampleRadius) => change({ sampleRadius })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_occlusion_power_label()}
        reading={occlusion.power.toFixed(1)}
        value={occlusion.power}
        range={RANGE.power}
        onValueChange={(power) => change({ power })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_occlusion_intensity_label()}
        reading={occlusion.intensity.toFixed(2)}
        value={occlusion.intensity}
        range={RANGE.intensity}
        onValueChange={(intensity) => change({ intensity })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_occlusion_bias_label()}
        reading={occlusion.bias.toFixed(1)}
        value={occlusion.bias}
        range={RANGE.bias}
        onValueChange={(bias) => change({ bias })}
      />
      <SliderRow
        label={m.workshop_bin_preview_post_effects_occlusion_resolution_label()}
        reading={`${Math.round(occlusion.bufferScale * 100)}%`}
        value={occlusion.bufferScale}
        range={RANGE.bufferScale}
        onValueChange={(bufferScale) => change({ bufferScale })}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-surface-300">{edgeAwareLabel}</span>
        <Switch
          aria-label={edgeAwareLabel}
          checked={occlusion.edgeAwareBlur}
          onCheckedChange={(edgeAwareBlur) => change({ edgeAwareBlur })}
        />
      </div>
    </EffectSection>
  );
}

interface EffectSectionProps {
  readonly label: string;
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly children: ReactNode;
}

/**
 * One effect as a band: its name and switch, then its knobs while it is on.
 *
 * A group named by its own heading, so a reader hears which effect a "Start" belongs to.
 */
function EffectSection({ label, enabled, onEnabledChange, children }: EffectSectionProps) {
  const heading = useId();
  return (
    <div
      role="group"
      aria-labelledby={heading}
      /* DS-SETTING-LEVEL */
      className="flex flex-col gap-3 border-t border-surface-700/40 pt-3 first:border-t-0 first:pt-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span id={heading} className="text-xs font-medium text-surface-200">
          {label}
        </span>
        <Switch aria-label={label} checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && children}
    </div>
  );
}
