import { useCallback, useEffect, useRef } from "react";

import { api, type ResolvedEvent } from "@/lib/tauri";

import { useSandbox } from "../../sandbox/state/SandboxContext";
import { eventVoices } from "../utils/eventTree";
import { useEventPlayer } from "./useEventPlayer";

/** One line to play: the key of the row that plays it, and its event. */
export interface PlayedLine {
  readonly key: string;
  readonly event: ResolvedEvent;
}

/** The player of the Voice lines view. */
export interface LinePlayer {
  /** The key of the line that plays, or null. */
  readonly playing: string | null;
  /** Plays `line` once, and stops what played before. */
  readonly play: (line: PlayedLine) => void;
  /** Plays `lines` one after another, each after the one before it ends. */
  readonly playAll: (lines: readonly PlayedLine[]) => void;
  readonly stop: () => void;
}

/**
 * Plays the events that voice lines resolve to, on the event tree's player.
 *
 * A line reads its event's tree from the event's bank and plays one press of it, as a press on an
 * event row does. A queue plays its next line when the player falls silent, and a line whose
 * event gives nothing to play is skipped.
 */
export function useLinePlayer(random: () => number = Math.random): LinePlayer {
  const sandbox = useSandbox();
  const player = useEventPlayer();
  const queue = useRef<PlayedLine[]>([]);

  const start = useCallback(
    async (line: PlayedLine): Promise<boolean> => {
      const { asset } = line.event;
      if (asset === null) return false;

      const answer = await api.readAudioEvent(sandbox, asset, line.event.id, null);
      if (!answer.ok) return false;

      const voices = eventVoices(answer.value.tree, random);
      if (voices.length === 0) return false;

      player.mix(new Map(answer.value.properties.map((object) => [object.id, object])));
      player.play(line.key, voices);
      return true;
    },
    [player, random, sandbox],
  );

  /* A stop between two lines also falls silent, so the effect and a fresh queue both reach
     `next`, and only one of them may start a line. */
  const loading = useRef(false);
  const next = useCallback(async () => {
    if (loading.current) return;

    loading.current = true;
    try {
      for (let line = queue.current.shift(); line !== undefined; line = queue.current.shift()) {
        if (await start(line)) return;
      }
    } finally {
      loading.current = false;
    }
  }, [start]);

  useEffect(() => {
    if (player.playing === null && queue.current.length > 0) void next();
  }, [next, player.playing]);

  const play = useCallback(
    (line: PlayedLine) => {
      queue.current = [];
      void start(line);
    },
    [start],
  );

  const playAll = useCallback(
    (lines: readonly PlayedLine[]) => {
      queue.current = [...lines];
      player.stop();
      void next();
    },
    [next, player],
  );

  const stop = useCallback(() => {
    queue.current = [];
    player.stop();
  }, [player]);

  return { playing: player.playing, play, playAll, stop };
}
