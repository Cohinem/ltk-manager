import { RepeatIcon, SpeakerHighIcon } from "@phosphor-icons/react";

import { IconButton, Kbd, Tooltip } from "@/components";
import { m } from "@/i18n";

import { KeyHint } from "../../bin/atlas/components/KeyHint";
import { usePreviewRepeat, usePreviewVolume, useToggleLoop } from "../state/previewTransport";
import { chordLabel, bindingOf, shortcutOf } from "../utils/keymap";

/**
 * The Loop switch and the preview volume of the audio previews, with the keys that change them.
 *
 * The volume is a readout. `-` and `=` move it, per "Keys and gestures" in docs/ux/AUDIO.md.
 */
export function PreviewTransport() {
  const looping = usePreviewRepeat() === "loop";
  const toggleLoop = useToggleLoop();
  const volume = usePreviewVolume();
  const loopKey = shortcutOf("loop");
  const percent = String(Math.round(volume * 100));

  return (
    <span className="flex shrink-0 items-center gap-1" data-ui="PreviewTransport">
      <IconButton
        icon={<RepeatIcon weight="bold" />}
        aria-label={m.audio_transport_loop_action()}
        aria-keyshortcuts={loopKey ?? undefined}
        tooltip={<KeyHint label={m.audio_transport_loop_action()} shortcut={loopKey ?? ""} />}
        pressed={looping}
        onClick={toggleLoop}
      />
      <Tooltip
        content={
          <span className="flex items-center gap-2">
            {m.audio_transport_volume_label()}
            <Kbd shortcut={chordLabel(bindingOf("volumeDown").keys[0] ?? "")} />
            <Kbd shortcut={chordLabel(bindingOf("volumeUp").keys[0] ?? "")} />
          </span>
        }
      >
        <span
          role="status"
          aria-label={`${m.audio_transport_volume_label()} ${m.audio_transport_volume_value_label({ percent })}`}
          className="flex items-center gap-1 text-meta text-surface-400 tabular-nums select-none"
        >
          <SpeakerHighIcon className="size-3.5" />
          {m.audio_transport_volume_value_label({ percent })}
        </span>
      </Tooltip>
    </span>
  );
}
