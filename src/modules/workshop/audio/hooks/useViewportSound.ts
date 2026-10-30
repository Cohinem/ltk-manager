import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useContentVisible } from "@/hooks";
import type { BinDocumentId, EventTree, ObjectProperties, ResolvedSound } from "@/lib/tauri";
import { usePreviewSound, usePreviewSoundVolume } from "@/stores";

import { audioQueries } from "../api/queries";
import { mediaUrl, useSoundChannel } from "../player/useSoundChannel";
import { eventSounds, eventVoices } from "../utils/eventTree";
import type { SoundCue } from "../utils/soundCue";
import type { SoundOutput } from "../utils/soundFollower";
import { voiceMix } from "../utils/voiceMix";

/** The sound of one viewport: whether it plays, where its cues go, and what did not resolve. */
export interface ViewportSound {
  /** The sound switch is on, so a `SoundCues` follower is mounted. */
  readonly on: boolean;
  /** Plays a cue's event on the viewport's channel, and stops a key's voices. */
  readonly output: SoundOutput;
  /** The event names of the view that resolve to no event or to no media. */
  readonly unresolved: number;
}

/**
 * Returns the sound of a viewport of `document` that fires `cues` while `playing`.
 *
 * The names are resolved once per view while the switch is on, over the document's bank units
 * and one unit of `bankPaths`. Each voice plays with the properties of its path. The channel
 * pauses with the
 * transport and stops when the switch turns off, when the viewport's tab is hidden and when the
 * viewport unmounts. Per "Viewport sound" in docs/ux/AUDIO.md.
 */
export function useViewportSound(
  document: BinDocumentId,
  cues: readonly SoundCue[],
  playing: boolean,
  bankPaths: readonly string[] = [],
): ViewportSound {
  const switched = usePreviewSound();
  const volume = usePreviewSoundVolume();
  const visible = useContentVisible();
  const on = switched && visible;
  const channel = useSoundChannel(volume);

  const names = useMemo(() => [...new Set(cues.map((cue) => cue.name))].sort(), [cues]);
  const resolved = useQuery({ ...audioQueries.sounds(document, names, bankPaths), enabled: on });
  const trees = useMemo(() => treesOf(resolved.data?.sounds ?? []), [resolved.data]);
  const unresolved = resolved.data === undefined ? 0 : names.length - trees.size;

  useEffect(() => {
    const properties = propertiesOf(resolved.data?.sounds ?? []);
    channel.setMixer((path) => voiceMix(path, properties));
  }, [channel, resolved.data]);

  const latest = useRef(trees);
  useEffect(() => {
    latest.current = trees;
  }, [trees]);
  const [output] = useState<SoundOutput>(() => ({
    play(cue) {
      const tree = latest.current.get(cue.name);
      if (tree === undefined) return;
      const voices = eventVoices(tree, Math.random);
      channel.play(
        cue.key,
        voices.map((voice) => ({ url: mediaUrl(voice.media), path: voice.path })),
        cue.repeat,
      );
    },
    stop: (key) => channel.stop(key),
  }));

  useEffect(() => {
    if (!on) channel.stopAll();
  }, [channel, on]);
  useEffect(() => {
    if (playing) channel.resume();
    else channel.pause();
  }, [channel, playing]);

  return { on, output, unresolved };
}

/** Returns the tree of each name that resolved to an event with at least one media. */
function treesOf(sounds: readonly ResolvedSound[]): ReadonlyMap<string, EventTree> {
  const trees = new Map<string, EventTree>();
  for (const sound of sounds) {
    const { resolution } = sound;
    if (resolution.status !== "resolved") continue;
    if (eventSounds(resolution.tree, firstChild).length === 0) continue;
    trees.set(sound.name, resolution.tree);
  }
  return trees;
}

/**
 * Returns the properties of the objects of every resolved tree, by object ID.
 *
 * An object ID names one object across the bank set, so two trees that share an object agree.
 */
function propertiesOf(sounds: readonly ResolvedSound[]): ReadonlyMap<number, ObjectProperties> {
  const properties = new Map<number, ObjectProperties>();
  for (const { resolution } of sounds) {
    if (resolution.status !== "resolved") continue;
    for (const object of resolution.properties) properties.set(object.id, object);
  }
  return properties;
}

/** A random source that picks the first weighted playlist item of every random container. */
const firstChild = () => 0;
