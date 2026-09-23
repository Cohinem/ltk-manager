import { createContext, useCallback, useMemo, useState } from "react";

import { createSceneClock, type SceneClock } from "@/modules/viewport";

/** Which map of the graph the clips pane lists. */
export type ClipTab = "clips" | "tracks" | "masks" | "syncGroups";

/** The row a chip jumped to: the tab it sits on, and the key it is under. */
export interface ClipMark {
  readonly tab: ClipTab;
  readonly hash: string;
}

/**
 * What a reader chose in a skin's preview and its clips pane, and the clock it plays on.
 *
 * Held by the view rather than by the preview, so a change of frame, which mounts the
 * preview somewhere else, keeps the clip, the transport and the time it stood at. The
 * pane's tab, filter and unfolded rows sit beside them for the same reason.
 */
export interface SkinChoice {
  readonly clock: SceneClock;
  /** The clip the reader picked, a hash or `BIND_POSE`, and null before they pick one. */
  readonly picked: string | null;
  readonly setPicked: (clip: string | null) => void;
  readonly playing: boolean;
  readonly setPlaying: (playing: boolean) => void;
  readonly speed: number;
  readonly setSpeed: (speed: number) => void;
  /** The idle effects are drawn. */
  readonly effects: boolean;
  readonly setEffects: (effects: boolean) => void;
  /** The submesh a reader points at, from the inspector or the viewport, and null for none. */
  readonly submesh: string | null;
  readonly setSubmesh: (submesh: string | null) => void;
  /** Counts the viewport's picks, so the row of a submesh picked twice scrolls in again. */
  readonly picks: number;
  /** Point at `submesh` from the viewport, which also brings its row into view. */
  readonly pickSubmesh: (submesh: string | null) => void;
  /**
   * The submeshes the reader showed or hid by hand, by name in lower case, over whatever
   * the skin and the playing clip's events say.
   */
  readonly shown: ReadonlyMap<string, boolean>;
  readonly setShown: (submesh: string, shown: boolean) => void;
  /** Let every submesh go back to what the skin and the clip say. */
  readonly resetShown: () => void;
  /** Which map the clips pane lists. */
  readonly tab: ClipTab;
  readonly setTab: (tab: ClipTab) => void;
  /** What the reader typed, which narrows the clip rows by name. */
  readonly filter: string;
  readonly setFilter: (filter: string) => void;
  /** The row a chip last jumped to, which its tab marks. */
  readonly marked: ClipMark | null;
  /** Switch to `tab` and mark the row under `hash`, which a track, mask or sync group chip does. */
  readonly jumpTo: (tab: ClipTab, hash: string) => void;
  /** Whether the row under `hash` on `tab` stands unfolded to what it holds. */
  readonly isExpanded: (tab: ClipTab, hash: string) => boolean;
  readonly toggleExpanded: (tab: ClipTab, hash: string) => void;
  readonly expand: (tab: ClipTab, hash: string) => void;
  /** The mask weighed on the character, a key of the mask map, and null for none. */
  readonly mask: string | null;
  readonly setMask: (mask: string | null) => void;
  /** The value a parametric clip plays at, and null before the reader sets one. */
  readonly parameter: number | null;
  readonly setParameter: (parameter: number | null) => void;
}

/** The rate a clip opens at, which is the speed the game plays it. */
const FIRST_SPEED = 1;

/** One unfolded row, as the set of them keys it. */
function expandedKey(tab: ClipTab, hash: string): string {
  return `${tab}:${hash}`;
}

/** A preview's choices as a reader first meets them: playing, at speed, with everything drawn. */
export function useSkinChoice(): SkinChoice {
  const clock = useMemo(createSceneClock, []);
  const [picked, setPicked] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(FIRST_SPEED);
  const [effects, setEffects] = useState(true);
  const [submesh, setSubmesh] = useState<string | null>(null);
  const [picks, setPicks] = useState(0);
  const pickSubmesh = useCallback((next: string | null) => {
    setSubmesh(next);
    setPicks((count) => count + 1);
  }, []);
  const [shown, setShownAll] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const setShown = useCallback((name: string, visible: boolean) => {
    setShownAll((held) => new Map(held).set(name.toLowerCase(), visible));
  }, []);
  const resetShown = useCallback(() => setShownAll(new Map()), []);
  const [tab, setTab] = useState<ClipTab>("clips");
  const [filter, setFilter] = useState("");
  const [marked, setMarked] = useState<ClipMark | null>(null);
  const jumpTo = useCallback((next: ClipTab, hash: string) => {
    setTab(next);
    setMarked({ tab: next, hash });
  }, []);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const isExpanded = useCallback(
    (on: ClipTab, hash: string) => expanded.has(expandedKey(on, hash)),
    [expanded],
  );
  const toggleExpanded = useCallback((on: ClipTab, hash: string) => {
    setExpanded((held) => {
      const next = new Set(held);
      const key = expandedKey(on, hash);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const expand = useCallback((on: ClipTab, hash: string) => {
    setExpanded((held) => {
      const key = expandedKey(on, hash);
      return held.has(key) ? held : new Set(held).add(key);
    });
  }, []);
  const [mask, setMask] = useState<string | null>(null);
  const [parameter, setParameter] = useState<number | null>(null);

  return useMemo(
    () => ({
      clock,
      picked,
      setPicked,
      playing,
      setPlaying,
      speed,
      setSpeed,
      effects,
      setEffects,
      submesh,
      setSubmesh,
      picks,
      pickSubmesh,
      shown,
      setShown,
      resetShown,
      tab,
      setTab,
      filter,
      setFilter,
      marked,
      jumpTo,
      isExpanded,
      toggleExpanded,
      expand,
      mask,
      setMask,
      parameter,
      setParameter,
    }),
    [
      clock,
      picked,
      playing,
      speed,
      effects,
      submesh,
      picks,
      pickSubmesh,
      shown,
      setShown,
      resetShown,
      tab,
      filter,
      marked,
      jumpTo,
      isExpanded,
      toggleExpanded,
      expand,
      mask,
      parameter,
    ],
  );
}

/**
 * `hidden` with the reader's own `shown` choices laid over it: a submesh shown by hand
 * leaves the list, and one hidden by hand joins it.
 */
export function overriddenHidden(
  hidden: readonly string[],
  shown: ReadonlyMap<string, boolean>,
): readonly string[] {
  if (shown.size === 0) return hidden;
  const kept = hidden.filter((name) => shown.get(name.toLowerCase()) !== true);
  for (const [name, visible] of shown) {
    if (!visible && !kept.some((held) => held.toLowerCase() === name)) kept.push(name);
  }
  return kept;
}

/** Whether two submesh names are one, which the `.skn` and a bin spell in either case. */
export function sameSubmesh(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

/** The view's choices, which a preview mounted under it reads in place of its own. */
export const SkinChoiceContext = createContext<SkinChoice | null>(null);
