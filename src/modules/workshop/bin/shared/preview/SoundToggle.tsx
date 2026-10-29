import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";

import { ButtonGroup, IconButton, OVERLINE, Popover, Tooltip } from "@/components";
import { m } from "@/i18n";
import {
  PREVIEW_DISPLAY_DEFAULTS,
  usePreviewSound,
  usePreviewSoundVolume,
  useSetPreviewDisplay,
} from "@/stores";

import { type SliderRange, SliderRow } from "./SliderRow";

const VOLUME_RANGE: SliderRange = { least: 0, most: 1, step: 0.01 };

export interface SoundToggleProps {
  /** The sound events of the view that resolved to no event. */
  readonly unresolved: number;
}

/**
 * The viewport's sound switch, with a caret that opens the volume.
 *
 * The switch writes `previewSound` and the slider `previewSoundVolume`, which every viewport
 * reads. The tooltip names the approximation and the events that did not resolve. Per
 * "Viewport sound" in docs/ux/AUDIO.md.
 */
export function SoundToggle({ unresolved }: SoundToggleProps) {
  const on = usePreviewSound();
  const volume = usePreviewSoundVolume();
  const setDisplay = useSetPreviewDisplay();
  const fresh = PREVIEW_DISPLAY_DEFAULTS.previewSoundVolume;
  const menuLabel = m.audio_viewport_volume_label();

  return (
    <ButtonGroup className="overflow-hidden rounded-md bg-surface-veil">
      <IconButton
        pressed={on}
        icon={on ? <SpeakerHighIcon /> : <SpeakerSlashIcon />}
        onClick={() => setDisplay({ previewSound: !on })}
        label={m.audio_viewport_sound_label()}
        tooltip={<SoundTip unresolved={unresolved} />}
      />
      <Popover.Root>
        <Tooltip content={menuLabel}>
          <Popover.Trigger
            render={<IconButton narrow muted aria-label={menuLabel} icon={<CaretDownIcon />} />}
          />
        </Tooltip>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          data-ui="SoundToggle:volume"
          aria-label={menuLabel}
          className="w-64 p-3 select-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <Popover.Title className={OVERLINE}>{menuLabel}</Popover.Title>
              <Popover.Description className="mt-0.5 text-meta text-surface-400">
                {m.audio_viewport_volume_description()}
              </Popover.Description>
            </div>
            <IconButton
              icon={<ArrowCounterClockwiseIcon />}
              disabled={volume === fresh}
              onClick={() => setDisplay({ previewSoundVolume: fresh })}
              label={m.audio_viewport_volume_reset_action()}
            />
          </div>
          <div className="mt-3">
            <SliderRow
              label={m.audio_viewport_volume_slider_label()}
              reading={m.audio_viewport_volume_reading({ percent: Math.round(volume * 100) })}
              value={volume}
              range={VOLUME_RANGE}
              onValueChange={(next) => setDisplay({ previewSoundVolume: next })}
            />
          </div>
        </Popover.Content>
      </Popover.Root>
    </ButtonGroup>
  );
}

/** The switch's tooltip: its name, the approximation, and the count that did not resolve. */
function SoundTip({ unresolved }: SoundToggleProps) {
  return (
    <span className="flex max-w-64 flex-col gap-1">
      <span className="font-medium">{m.audio_viewport_sound_label()}</span>
      <span className="text-surface-300">{m.audio_viewport_sound_hint()}</span>
      {unresolved > 0 && (
        <span className="text-warning-text">
          {m.audio_viewport_unresolved_hint({ count: unresolved })}
        </span>
      )}
    </span>
  );
}
