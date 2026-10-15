import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useContentVisible } from "@/hooks";
import type { AppError, AssetRef, BinDocumentId } from "@/lib/tauri";
import { toggledIn } from "@/utils";

import {
  type LoopRange,
  rememberedVfxRun,
  takeHandedRig,
  useHandedRigStore,
  useVfxRunMemoryStore,
  vfxRunKey,
  type VfxRunMemory,
} from "../../../../state";
import { NO_ADJUST, type SystemAdjust } from "../../adjust/adjustModel";
import { type AdjustPreview, AdjustPreviewContext } from "../../adjust/adjustPreview";
import type { SystemModel } from "../../engine/model/model";
import {
  flightTime,
  type Playback,
  playbackOf,
  type RigChoice,
  runSpan,
  withPlayback,
} from "../../engine/model/rig";
import { lingerTail, systemSpan } from "../../engine/model/systemModel";
import { createDriver, type Driver } from "../../engine/simulation/driver";
import {
  ForcePreviewProvider,
  forceTopology,
  useForcePreviewState,
} from "../../forces/forcePreview";
import { useVfxSystem } from "../../hooks/useVfxSystem";
import { useAutoRig } from "./autoRigState";
import { useEmitterFlags } from "./emitterFlags";

/** The seed a run opens on, so two readers of one effect see the same run. */
const FIRST_SEED = 1337;

/** The rate a run opens at, which is the effect at the speed the game plays it. */
const FIRST_SPEED = 1;

/** The most simulated time one frame spends, so a tab back from the background does not leap. */
const MAX_FRAME = 0.1;

/** One frame at the rate a seek replays at, which the step keys and buttons move by. */
export const FRAME = 1 / 60;

/** How near its span a phase counts as the run's end, in seconds, which absorbs float error. */
const END_SLACK = 1e-6;

/**
 * One particle system's run, which the shell holds above its panes (ADR-0037).
 *
 * The preview draws it and the timeline reads it. The clock is the provider's frame
 * loop, so a closed preview stops nothing.
 */
export interface VfxRun {
  readonly document: BinDocumentId;
  /** What the document was read from, and null for a run keyed on the open. */
  readonly asset: AssetRef | null;
  /** The system object, `0x` and eight hex digits. */
  readonly entry: string;
  readonly system: SystemModel | null;
  readonly error: AppError | null;
  readonly pending: boolean;
  readonly driver: Driver;
  readonly playing: boolean;
  /**
   * The clock waits for the preview's first draw, while `playing` is unchanged.
   *
   * False by default, so a shell with no preview plays at once.
   */
  readonly warming: boolean;
  readonly speed: number;
  readonly seed: number;
  /** The rig the run plays on: the one chosen for it, else the one the system picks. ADR-0057. */
  readonly rig: RigChoice;
  readonly playback: Playback;
  /** The run starts over at its end, which is the rig's Replay. */
  readonly looping: boolean;
  /**
   * Emitters of the opened system that draw nothing, by pool index: those that set `disabled`
   * in an editable document, and those hidden in the preview of a read-only one.
   */
  readonly muted: ReadonlySet<number>;
  /** Emitters of the opened system that alone draw while any is in the set, by pool index. */
  readonly soloed: ReadonlySet<number>;
  /** Child definitions that draw nothing, by child path, each with every child under it. */
  readonly mutedChildren: ReadonlySet<string>;
  /** Child definitions that alone draw while any solo is set, by child path. */
  readonly soloedChildren: ReadonlySet<string>;
  readonly loop: LoopRange | null;
  /** The chance every birth reads its tables at, null for a run left to its own draws. */
  readonly pinned: number | null;
  /** The three flex channels gameplay would set on the system, null for one left unset. */
  readonly flex: readonly (number | null)[];
  /** Seconds one run lasts, which the playhead spans. */
  readonly span: number;
  /** The run opened where a kept tab left it rather than at zero. */
  readonly resumed: boolean;
  /** Bumped per Fit asked of the camera, which the viewport answers. A second ask is a second fit. */
  readonly fitRequest: number;
  readonly requestFit: () => void;
  /** Play or pause. Play on a run paused at its end starts it from zero. */
  readonly setPlaying: (playing: boolean) => void;
  /**
   * Keep the clock at its phase while `warming`, and continue from there once it is false.
   *
   * A state setter, so its identity is stable across renders.
   */
  readonly setWarming: (warming: boolean) => void;
  readonly setSpeed: (speed: number) => void;
  /** Choose the rig. A loop turned on for a run paused at its end plays it from zero. */
  readonly setRig: (rig: RigChoice) => void;
  /** Drop the chosen rig for the one the system picks. */
  readonly resetRig: () => void;
  /** Switch between Replay and Once. A continuous run has no loop to switch. */
  readonly setLooping: (looping: boolean) => void;
  readonly reroll: () => void;
  readonly toggleMuted: (emitter: number) => void;
  readonly toggleSoloed: (emitter: number) => void;
  readonly toggleChildMuted: (path: string) => void;
  readonly toggleChildSoloed: (path: string) => void;
  /**
   * Rewrite the muted set from the one held, which a stroke across the lanes does per lane. In
   * an editable document it writes the changed emitters' `disabled` flags as one edit.
   */
  readonly setMuted: (update: (held: ReadonlySet<number>) => ReadonlySet<number>) => void;
  readonly setSoloed: (update: (held: ReadonlySet<number>) => ReadonlySet<number>) => void;
  readonly setLoop: (loop: LoopRange | null) => void;
  readonly setPinned: (chance: number | null) => void;
  readonly setFlex: (flex: readonly (number | null)[]) => void;
  /** Stand the run `time` seconds into its phase. */
  readonly seek: (time: number) => void;
  /** Pause, and move the run by whole frames. */
  readonly step: (frames: number) => void;
  /** Pause, and move the run to the end of its span. */
  readonly seekEnd: () => void;
  /** Move the run back to zero, leaving `playing` as it is. */
  readonly restart: () => void;
  /**
   * Pause the clock for a scrub until `endScrub`, leaving `playing` as it is.
   *
   * A second call inside one scrub does nothing.
   */
  readonly beginScrub: () => void;
  /** Let the clock run again after a scrub, if the run is playing. */
  readonly endScrub: () => void;
  /** Hear the clock, which moves every frame the run plays and on every seek. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** The run of the enclosing shell, which a test stands a run of its own in. */
export const VfxRunContext = createContext<VfxRun | null>(null);

/** The run of the shell the caller sits in. */
export function useVfxRun(): VfxRun {
  const run = use(VfxRunContext);
  if (run === null) throw new Error("useVfxRun outside a VfxRunProvider");
  return run;
}

export interface VfxRunProviderProps {
  document: BinDocumentId;
  /** What the document was read from, which keys the run's memory, and null to key it on the open. */
  asset: AssetRef | null;
  /** The system object, `0x` and eight hex digits. */
  entry: string;
  children: ReactNode;
}

/**
 * The run of one system, kept per system for the session (ADR-0037).
 *
 * The driver outlives the snapshot, so a re-read swaps the definition against the pool
 * the simulation already has rather than starting the effect over (2.5). A reroll reseeds
 * it and starts the run over.
 */
export function VfxRunProvider({ document, asset, entry, children }: VfxRunProviderProps) {
  const [adjust, setAdjust] = useState<SystemAdjust>(NO_ADJUST);
  const adjusting = useMemo<AdjustPreview>(() => ({ adjust, setAdjust }), [adjust]);
  const { system: authoredSystem, error, pending } = useVfxSystem(document, entry, adjust);
  const forces = useForcePreviewState();
  const { project: projectForces, clear: clearForces } = forces;
  const system = useMemo(
    () => (authoredSystem === null ? null : projectForces(authoredSystem)),
    [authoredSystem, projectForces],
  );
  const topology = forceTopology(authoredSystem);
  useEffect(() => {
    clearForces();
  }, [topology, clearForces]);
  const visible = useContentVisible();
  const key = vfxRunKey(asset ?? document, entry);
  const [kept] = useState(() => rememberedVfxRun(key));

  const [playing, setPlayingState] = useState(true);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const [warming, setWarming] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  const [seed, setSeed] = useState(kept?.seed ?? FIRST_SEED);
  const [speed, setSpeed] = useState(kept?.speed ?? FIRST_SPEED);
  const [chosen, setChosen] = useState<RigChoice | null>(kept?.rig ?? null);
  const auto = useAutoRig(system, document, entry);
  const rig = useMemo<RigChoice>(
    () => chosen ?? { source: { kind: "auto", spell: auto.spell }, rig: auto.rig },
    [chosen, auto.rig, auto.spell],
  );
  /* An editable document hides an emitter through its own `disabled` flag, so the eye and the
     file say the same. A read-only one hides it in the preview alone. */
  const flags = useEmitterFlags(system, entry);
  const [localMuted, setLocalMuted] = useState<ReadonlySet<number>>(() => new Set(kept?.muted));
  const muted = flags.writable ? flags.disabled : localMuted;
  const heldFlags = useRef(flags);
  heldFlags.current = flags;
  const setMuted = useCallback((update: (held: ReadonlySet<number>) => ReadonlySet<number>) => {
    const held = heldFlags.current;
    if (held.writable) held.write(update(held.disabled));
    else setLocalMuted(update);
  }, []);
  const [soloed, setSoloed] = useState<ReadonlySet<number>>(() => new Set(kept?.soloed));
  const [mutedChildren, setMutedChildren] = useState<ReadonlySet<string>>(NO_CHILDREN);
  const [soloedChildren, setSoloedChildren] = useState<ReadonlySet<string>>(NO_CHILDREN);
  const [loop, setLoop] = useState<LoopRange | null>(kept?.loop ?? null);
  const [fitRequest, setFitRequest] = useState(0);
  const [pinned, setPinned] = useState<number | null>(kept?.pinned ?? null);
  const [flex, setFlex] = useState<readonly (number | null)[]>(NO_FLEX);
  const looping = rig.rig.life === "loop";
  const playback = playbackOf(rig.rig.life);

  /* One driver for the run's life. A reroll reseeds it, because a new driver changes the
     props of every component that draws from it. */
  const [driver] = useState(() => createDriver(seed));
  const span = useMemo(
    () =>
      system === null
        ? 1
        : runSpan(
            rig.rig,
            systemSpan(system),
            lingerTail(system, flightTime(rig.rig.motion, rig.rig.height)),
          ),
    [system, rig],
  );

  const listeners = useRef(new Set<() => void>());
  const notify = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);
  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const previousForceProjection = useRef(forces.project);
  useEffect(() => {
    if (system === null) {
      return;
    }

    /* A change the simulation reads replays the run to its phase, playing or paused. The
       particles alive were born under the last definition, and an undo or an edit made
       while playing would otherwise show them until they die. */
    const time = driver.phase;
    const simulated = driver.swap(system);
    const projected = previousForceProjection.current !== forces.project;
    if (simulated || projected || !playingRef.current) {
      driver.seek(time);
    }
    previousForceProjection.current = forces.project;

    notify();
  }, [driver, system, notify, forces.project]);

  /* A loop turned off leaves the clock at the sum of every pass it made, which a rig that
     plays once reads as past its span, so the run returns to the phase it showed. */
  const steered = useRef(rig.rig);
  useEffect(() => {
    const phase = driver.phase;
    const unlooped = steered.current.life === "loop" && rig.rig.life !== "loop";
    steered.current = rig.rig;

    driver.steer(rig.rig);
    if (unlooped && driver.phase > phase + END_SLACK) driver.seek(phase);
    notify();
  }, [driver, rig, notify]);

  useEffect(() => {
    driver.reseed(seed);
    notify();
  }, [driver, seed, notify]);

  useEffect(() => {
    driver.pin(pinned);
  }, [driver, pinned]);

  useEffect(() => {
    driver.setFlex(flex);
  }, [driver, flex]);

  /* A kept run resumes where its tab left it, once the system it is a run of has landed.
     One left at or past its end opens at zero. */
  const resumeAt = useRef(kept?.playhead ?? null);
  useEffect(() => {
    const at = resumeAt.current;
    if (system === null || at === null) return;

    resumeAt.current = null;
    if (reachedEnd(at, span)) return;

    driver.seek(at);
    notify();
  }, [driver, system, span, notify]);

  /* Read through a ref by the loop below, so a speed tick or a rig drag, which moves the
     span, changes the next frame rather than restarting the loop and dropping one. */
  const pace = useRef({ speed, loop, span, looping, wrapped: auto.take });
  pace.current = { speed, loop, span, looping, wrapped: auto.take };
  /* An edit hands over a new system, and restarting the loop on it drops a frame of time. */
  const loaded = system !== null;
  useEffect(() => {
    if (!visible || !playing || !loaded || warming || scrubbing) return;

    let last: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      if (dt > 0) {
        const { speed: rate, loop: range, span: length, looping: loops, wrapped } = pace.current;
        const room = range === null && !loops ? length - driver.phase : Infinity;
        const spent = Math.min(dt * rate, room);
        const before = driver.phase;
        if (spent > 0) driver.advance(spent);
        if (driver.phase < before - END_SLACK) wrapped();
        if (range !== null && driver.phase >= Math.min(range.to, length)) driver.seek(range.from);
        notify();

        if (spent >= room) {
          setPlayingState(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [driver, playing, loaded, notify, visible, warming, scrubbing]);

  /* Written on the way out rather than as it changes, off the values the last render
     read, so the store hears one memory per tab rather than one per frame. */
  const latest = useRef<{ memory: Omit<VfxRunMemory, "playhead">; driver: Driver; span: number }>(
    null!,
  );
  latest.current = {
    memory: { seed, rig: chosen, speed, muted: [...localMuted], soloed: [...soloed], loop, pinned },
    driver,
    span,
  };
  const remember = useVfxRunMemoryStore((s) => s.remember);
  useEffect(
    () => () => {
      const { memory, driver: last, span: length } = latest.current;
      const phase = last.phase;
      remember(key, { ...memory, playhead: reachedEnd(phase, length) ? 0 : phase });
    },
    [key, remember],
  );

  const seek = useCallback(
    (time: number) => {
      driver.seek(Math.max(time, 0));
      notify();
    },
    [driver, notify],
  );
  const takeAuto = auto.take;
  const restart = useCallback(() => {
    takeAuto();
    driver.restart();
    notify();
  }, [driver, notify, takeAuto]);
  const step = useCallback(
    (frames: number) => {
      setPlayingState(false);
      seek(driver.phase + frames * FRAME);
    },
    [driver, seek],
  );
  const seekEnd = useCallback(() => {
    const { span: length, looping: loops } = pace.current;
    const end = loops ? Math.max(length - FRAME, 0) : length;
    setPlayingState(false);

    /* A seek lands on whole replay steps, so the last part of a frame is advanced. */
    driver.seek(end);
    const gap = end - driver.phase;
    if (gap > 0 && gap < FRAME) driver.advance(gap);
    notify();
  }, [driver, notify]);

  /* Paused at its end: no loop or range starts the run over. */
  const parked = useCallback(() => {
    const { loop: range, span: length, looping: loops } = pace.current;
    return !loops && range === null && reachedEnd(driver.phase, length);
  }, [driver]);
  const setPlaying = useCallback(
    (next: boolean) => {
      if (next && parked()) restart();
      setPlayingState(next);
    },
    [parked, restart],
  );
  const setRig = useCallback(
    (next: RigChoice) => {
      if (next.rig.life === "loop" && parked()) {
        restart();
        setPlayingState(true);
      }
      setChosen(next);
    },
    [parked, restart],
  );
  /* A rig handed from outside the tab, by a template that made the system or a skin or a
     spell it is opened from, replaces the one in hand, whether the tab is new or open. */
  const handed = useHandedRigStore((state) => state.rigs[entry.toLowerCase()] ?? null);
  useEffect(() => {
    if (handed === null) return;

    const taken = takeHandedRig(entry);
    if (taken !== null) setRig(taken);
  }, [handed, entry, setRig]);

  const resetAuto = auto.reset;
  const resetRig = useCallback(() => {
    resetAuto();
    setChosen(null);
  }, [resetAuto]);

  const beginScrub = useCallback(() => setScrubbing(true), []);
  const endScrub = useCallback(() => setScrubbing(false), []);

  const run = useMemo<VfxRun>(
    () => ({
      document,
      asset,
      entry,
      system,
      error,
      pending,
      driver,
      playing,
      warming,
      speed,
      seed,
      rig,
      playback,
      looping,
      muted,
      soloed,
      mutedChildren,
      soloedChildren,
      loop,
      pinned,
      flex,
      span,
      resumed: (kept?.playhead ?? 0) > 0,
      fitRequest,
      requestFit: () => setFitRequest((count) => count + 1),
      setPlaying,
      setWarming,
      setSpeed,
      setRig,
      resetRig,
      setLooping: (next) => {
        if (rig.rig.life === "continuous") return;
        setRig({ source: CUSTOM_SOURCE, rig: withPlayback(rig.rig, next ? "replay" : "once") });
      },
      reroll: () => setSeed((current) => current + 1),
      toggleMuted: (emitter) => setMuted((current) => toggledIn(current, emitter)),
      toggleSoloed: (emitter) => setSoloed((current) => toggledIn(current, emitter)),
      toggleChildMuted: (path) => setMutedChildren((current) => toggledIn(current, path)),
      toggleChildSoloed: (path) => setSoloedChildren((current) => toggledIn(current, path)),
      setMuted,
      setSoloed,
      setLoop: (range) => setLoop(boundedLoop(range, span)),
      setPinned,
      setFlex,
      seek,
      step,
      seekEnd,
      restart,
      beginScrub,
      endScrub,
      subscribe,
    }),
    [
      document,
      asset,
      entry,
      system,
      error,
      pending,
      driver,
      playing,
      warming,
      speed,
      seed,
      rig,
      playback,
      looping,
      muted,
      soloed,
      mutedChildren,
      soloedChildren,
      loop,
      pinned,
      flex,
      span,
      kept,
      fitRequest,
      setPlaying,
      setRig,
      resetRig,
      seek,
      step,
      seekEnd,
      restart,
      beginScrub,
      endScrub,
      subscribe,
    ],
  );

  return (
    <ForcePreviewProvider value={forces}>
      <AdjustPreviewContext value={adjusting}>
        <VfxRunContext value={run}>{children}</VfxRunContext>
      </AdjustPreviewContext>
    </ForcePreviewProvider>
  );
}

const NO_CHILDREN: ReadonlySet<string> = new Set();

/** Every flex channel unset, which is what a system nothing gameplay-driven sets reads. */
const NO_FLEX: readonly (number | null)[] = [null, null, null];

const CUSTOM_SOURCE = { kind: "custom" } as const;

/** `phase` has reached the end of a run `span` seconds long. */
function reachedEnd(phase: number, span: number): boolean {
  return phase >= span - END_SLACK;
}
/** `range` held inside the run's span, and null for one with nothing left between its ends. */
function boundedLoop(range: LoopRange | null, span: number): LoopRange | null {
  if (range === null) return null;
  const from = Math.max(range.from, 0);
  const to = Math.min(range.to, span);
  return to <= from ? null : { from, to };
}
