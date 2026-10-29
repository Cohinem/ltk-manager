import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useWavesurfer } from "@wavesurfer/react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components";
import { useDebouncedValue } from "@/hooks";
import { m } from "@/i18n";
import type { MediaRow } from "@/lib/tauri";

import { type Waveform as WaveformData, waveformQuery } from "../api/waveform";
import type { EventPlayer } from "../hooks/useEventPlayer";
import type { MediaPlayer } from "../hooks/useMediaPlayer";
import { useWaveformColors } from "../hooks/useWaveformColors";
import type { SoundChannel } from "../player/soundPlayer";
import { mediaUrl, useChannelState } from "../player/useSoundChannel";
import type { EventRow } from "../utils/eventTree";
import { formatDuration } from "../utils/mediaRows";
import {
  createWaveformSync,
  seekKeyTime,
  shownSubject,
  type WaveformSubject,
} from "../utils/waveformSync";

/** The height of the drawn waveform in pixels. */
const WAVEFORM_HEIGHT = 40;

/** How long a subject stays shown before its media decodes, so a run of arrow keys decodes one. */
const DECODE_DELAY_MS = 150;

interface WaveformProps {
  /** The channel that plays `subject`. The view plays, pauses and seeks through it. */
  readonly channel: SoundChannel;
  readonly subject: WaveformSubject | null;
}

/**
 * The waveform strip of an audio file document: a play and pause button, the waveform of the
 * subject's first media with its playhead, and the time.
 *
 * The strip plays nothing of its own. wavesurfer.js draws peaks that the shared player decoded,
 * and the playhead follows `channel`. A click or a drag on the waveform seeks the channel. The
 * waveform is a slider for the keyboard. Per "Waveform" in docs/ux/AUDIO.md.
 */
export function Waveform({ channel, subject }: WaveformProps) {
  const url = subject?.urls[0] ?? null;
  const decoded = useDebouncedValue(url, DECODE_DELAY_MS);
  const waveform = useQuery(waveformQuery(decoded));

  if (subject === null) return <WaveformStrip>{m.audio_waveform_empty()}</WaveformStrip>;
  if (decoded === url && waveform.error !== null) {
    return <WaveformStrip>{m.audio_waveform_failed_empty()}</WaveformStrip>;
  }
  if (decoded !== url || waveform.data === undefined) {
    return <WaveformStrip>{m.audio_waveform_loading_label()}</WaveformStrip>;
  }

  return (
    <WaveformView
      key={`${subject.key}\n${subject.urls.join("\n")}`}
      channel={channel}
      subject={subject}
      waveform={waveform.data}
    />
  );
}

interface MediaWaveformProps {
  readonly player: MediaPlayer;
  readonly rows: readonly MediaRow[];
  readonly selected: number | null;
}

/** The waveform of the media table: the source that plays, or the selected playable row. */
export function MediaWaveform({ player, rows, selected }: MediaWaveformProps) {
  const subjectOf = (source: number | null): WaveformSubject | null =>
    source === null ? null : { key: String(source), urls: [player.url(source)] };

  const row = rows.find((each) => each.sourceId === selected);
  const playable =
    row !== undefined && row.playback.kind === "playable" && !player.failed.has(row.sourceId);
  const playing = player.playing === null ? null : String(player.playing);
  const subject = shownSubject(
    subjectOf(player.playing),
    playing,
    subjectOf(playable ? row.sourceId : null),
  );

  return <Waveform channel={player.channel} subject={subject} />;
}

interface EventWaveformProps {
  readonly player: EventPlayer;
  readonly rows: readonly EventRow[];
  readonly selected: string | null;
}

/** The waveform of the event tree: the first media of the last press, or the selected sound. */
export function EventWaveform({ player, rows, selected }: EventWaveformProps) {
  const row = rows.find((each) => each.key === selected);
  const media = row?.kind === "node" && row.node.kind === "sound" ? row.node.media : null;
  const subject = shownSubject(
    player.played,
    player.playing,
    row !== undefined && media !== null ? { key: row.key, urls: [mediaUrl(media)] } : null,
  );

  return <Waveform channel={player.channel} subject={subject} />;
}

/** The strip with a line of text in place of the waveform. */
function WaveformStrip({ children }: { children: ReactNode }) {
  return (
    <div
      data-ui="Waveform"
      className="flex min-h-13 items-center border-t border-surface-700 px-3 py-1.5 text-meta text-surface-400 select-none"
    >
      {children}
    </div>
  );
}

interface WaveformViewProps {
  readonly channel: SoundChannel;
  readonly subject: WaveformSubject;
  readonly waveform: WaveformData;
}

/** The button, the drawn waveform and the time of one subject. */
function WaveformView({ channel, subject, waveform }: WaveformViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const colors = useWaveformColors();
  const [sync] = useState(() => createWaveformSync(channel, subject, waveform.duration));
  const state = useChannelState(channel);
  const [time, setTime] = useState(() => sync.time());
  const status = sync.status();

  const options = useMemo(
    () => ({
      container,
      peaks: waveform.peaks,
      duration: waveform.duration,
      height: WAVEFORM_HEIGHT,
      waveColor: colors.wave,
      progressColor: colors.progress,
      cursorColor: colors.cursor,
      cursorWidth: 1,
      normalize: true,
      interact: true,
      dragToSeek: true,
      hideScrollbar: true,
    }),
    [waveform.peaks, waveform.duration, colors],
  );
  const { wavesurfer, isReady } = useWavesurfer(options);

  useEffect(() => {
    if (wavesurfer === null) return;

    const unsubscribe = [
      wavesurfer.on("click", (fraction) => sync.seekFraction(fraction)),
      wavesurfer.on("dragstart", () => sync.dragStart()),
      wavesurfer.on("drag", (fraction) => setTime(fraction * waveform.duration)),
      wavesurfer.on("dragend", (fraction) => sync.dragEnd(fraction)),
    ];
    return () => {
      for (const each of unsubscribe) each();
    };
  }, [wavesurfer, sync, waveform.duration]);

  useEffect(() => {
    if (wavesurfer === null || !isReady) return;

    wavesurfer.setTime(sync.time());
    let frame = 0;
    const draw = () => {
      const moved = sync.frame();
      if (moved !== null) {
        wavesurfer.setTime(moved);
        setTime(moved);
      }
      if (status === "playing") frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [wavesurfer, isReady, sync, status, state]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " ") {
      event.preventDefault();
      sync.toggle();
      return;
    }

    const next = seekKeyTime(event.key, sync.time(), waveform.duration);
    if (next === null) return;

    event.preventDefault();
    sync.seek(next);
  }

  const playLabel =
    status === "playing" ? m.audio_waveform_pause_action() : m.audio_waveform_play_action();
  const readout = m.audio_waveform_time_label({
    time: formatDuration(time),
    duration: formatDuration(waveform.duration),
  });

  return (
    <div
      data-ui="Waveform"
      className="flex min-h-13 items-center gap-2 border-t border-surface-700 px-2 py-1.5 select-none"
    >
      <IconButton
        size="sm"
        icon={status === "playing" ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
        label={playLabel}
        onClick={() => sync.toggle()}
      />
      <div
        ref={container}
        role="slider"
        tabIndex={0}
        aria-label={m.audio_waveform_label()}
        aria-valuemin={0}
        aria-valuemax={waveform.duration}
        aria-valuenow={time}
        aria-valuetext={readout}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      />
      <span className="shrink-0 font-mono text-meta text-code text-surface-300 tabular-nums">
        {readout}
      </span>
    </div>
  );
}
