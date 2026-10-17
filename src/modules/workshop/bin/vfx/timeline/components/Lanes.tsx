import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { Field } from "@/components";
import { useResizeObserver } from "@/hooks";
import { m } from "@/i18n";
import { useTimelineHistogram } from "@/stores";

import { runEmitterKey } from "../../clipboard/emitterKeys";
import { useEmitterClipboard } from "../../clipboard/useEmitterClipboard";
import type { EmitterModel } from "../../engine/model/model";
import { useEmitters } from "../../inspector/state/emitterChoice";
import { emitterRef } from "../../inspector/utils/emitterName";
import { useVfxRun } from "../../playback/state/run";
import { ignoredKey } from "../../playback/utils/ignoredKey";
import { useLaneHead } from "../hooks/useLaneHead";
import { useLaneRows } from "../hooks/useLaneRows";
import { useLaneSelect } from "../hooks/useLaneSelect";
import { useLaneView } from "../hooks/useLaneView";
import { useLiveCounts } from "../hooks/useLiveCounts";
import { useTimelineMarkers } from "../hooks/useTimelineMarkers";
import { type SnapKeys, type TimeSnap, useTimeSnap } from "../hooks/useTimeSnap";
import type { LaneLayout } from "../utils/histogram";
import { fitSpan, type LaneBar, timeAt, type TimeWindow, xOf } from "../utils/laneModel";
import { type LaneHow, pickLanes } from "../utils/selection";
import { COUNT, LaneRow, type Row } from "./LaneRow";
import { useLaneGestures, VisibilityHeader } from "./laneVisibility";
import { MarkerLines, MarkerRuler } from "./Markers";
import { PastRun, Ruler } from "./Ruler";
import {
  PlayheadFlag,
  PlayheadLine,
  PointerFlag,
  PointerLine,
  usePlayhead,
  useTimeLine,
} from "./timeLines";
import type { FollowBars } from "./useBarEditing";

/**
 * The ruler with the open system's markers over it, or the ruler alone for a system that has
 * nowhere to keep markers.
 */
function RulerMarkers({
  view,
  width,
  snap,
  onSeek,
  children,
}: {
  view: TimeWindow;
  width: number;
  snap: TimeSnap;
  onSeek: (time: number) => void;
  children: ReactNode;
}) {
  const markers = useTimelineMarkers();
  if (markers === null) return children;

  return (
    <MarkerRuler view={view} width={width} snap={snap} markers={markers} onSeek={onSeek}>
      {children}
    </MarkerRuler>
  );
}

/** One lane's height in pixels, which the histogram canvas is laid out by. */
const ROW = 24;

const NO_FOLLOW: ReadonlyMap<number, LaneBar> = new Map();

/**
 * One lane per emitter under one playhead, "The timeline" in docs/ux/BIN_EDITOR.md.
 *
 * The bars and the heads are the DOM's, and the histogram is one canvas over the tracks. The
 * playhead, the pointer's line and the live counts are written to the DOM off the run's clock,
 * and a row re-renders only when its data changes. The name filter sits in the ruler row's
 * head cell, over the names it narrows. Ctrl and Shift on a lane name edit a selection of
 * several lanes, which the clipboard keys, S and M, and a bar drag act on.
 */
export function Lanes() {
  const { system, span, playback, loop, seek, setLoop, beginScrub, endScrub } = useVfxRun();
  const { cards, filter, setFilter, root, selected, pickCards } = useEmitters();
  const histogram = useTimelineHistogram();
  const select = useLaneSelect();
  const clipboard = useEmitterClipboard();
  const anchor = useRef<string | null>(null);

  /* A landed drag reads the system again, whose new bars replace the followers' drafts. */
  const [follow, setFollow] = useState<ReadonlyMap<number, LaneBar>>(NO_FOLLOW);
  const [followedSystem, setFollowedSystem] = useState(system);
  if (followedSystem !== system) {
    setFollowedSystem(system);
    setFollow(NO_FOLLOW);
  }
  const onFollow = useCallback<FollowBars>((bars) => setFollow(bars ?? NO_FOLLOW), []);

  const [width, setWidth] = useState(0);
  const measure = useResizeObserver<HTMLDivElement>((element) => setWidth(element.clientWidth));
  const { head, measure: measurePane } = useLaneHead(system);

  const body = useRef<HTMLDivElement>(null);
  const tracks = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fit = useMemo(() => fitSpan(system, span, playback), [system, span, playback]);
  const { view, refit } = useLaneView(span, fit, body, width);

  const { rows, every, listed, edges, expanded, expand } = useLaneRows(system, filter);
  const gestures = useLaneGestures(listed, every);
  const cardOf = useCallback(
    (emitter: EmitterModel) =>
      cards.find((card) => card.simple === emitter.simple && card.index === emitter.listIndex),
    [cards],
  );
  const laneKeys = useMemo(
    () =>
      rows.flatMap((row) => {
        const key = row.kind === "emitter" ? cardOf(row.emitter)?.key : undefined;
        return key === undefined ? [] : [key];
      }),
    [rows, cardOf],
  );

  /* A child lane belongs to another system, so it is always selected alone. */
  const pick = useCallback(
    (row: Row, how: LaneHow) => {
      const key = row.kind === "emitter" ? cardOf(row.emitter)?.key : undefined;
      if (key === undefined || how === "only") {
        if (key !== undefined) anchor.current = key;
        select(row);
        return;
      }

      const next = pickLanes(laneKeys, selected, anchor.current, key, how);
      anchor.current = next.anchor;
      pickCards(next.keys, next.open);
    },
    [cardOf, select, laneKeys, selected, pickCards],
  );

  const runKey = (event: ReactKeyboardEvent) => {
    if (ignoredKey(event.nativeEvent)) return;

    const refs = cards.filter((card) => selected.has(card.key)).map(emitterRef);
    const entry = cards[0]?.row.entry ?? "";
    const open = root === undefined || !selected.has(root.key) ? null : emitterRef(root);
    if (runEmitterKey(event, clipboard, entry, open, refs)) {
      /* Ctrl+D also opens Diagnostics app-wide, so a handled chord stops here. */
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const layout = useMemo<LaneLayout>(
    () => ({
      lanes: rows.map((row) => (row.kind === "emitter" ? row.emitter.index : null)),
      row: ROW,
      view,
      width,
    }),
    [rows, view, width],
  );
  const spawned = useLiveCounts(body, canvas, layout);
  const playhead = usePlayhead(view, width);
  const pointer = useTimeLine();
  const snap = useTimeSnap(view, width, edges);
  const markers = useTimelineMarkers();

  const seekAt = useCallback(
    (x: number, keys: SnapKeys) =>
      seek(
        Math.max(snap(timeAt(view, width, x), keys, { playhead: true, minorTicks: true }).time, 0),
      ),
    [seek, snap, view, width],
  );
  const trackX = (clientX: number) => clientX - (tracks.current?.getBoundingClientRect().left ?? 0);
  const hover = (event: ReactPointerEvent) => {
    const x = trackX(event.clientX);
    pointer.stand(x, width, timeAt(view, width, x));
  };

  return (
    <div
      ref={body}
      data-ui="Lanes"
      className="flex min-h-0 flex-1 flex-col"
      onPointerMove={hover}
      onPointerLeave={pointer.hide}
      onKeyDown={runKey}
    >
      <div ref={measurePane} className="flex h-6 shrink-0 border-b border-surface-700/50">
        <div className="shrink-0 border-r border-surface-700/50" style={{ width: head }}>
          <VisibilityHeader every={every}>
            <Field.Control
              className="h-5 w-full min-w-0 px-1.5 font-sans text-meta"
              aria-label={m.workshop_bin_emitter_filter_label()}
              placeholder={m.workshop_bin_emitter_filter_placeholder()}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </VisibilityHeader>
        </div>
        <div className="relative min-w-0 flex-1">
          <span className="absolute inset-y-0 right-1 flex items-end pb-px text-meta leading-none text-surface-500 select-none">
            {m.workshop_bin_timeline_live_caption_label()}
          </span>
          <div
            ref={measure}
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ right: COUNT }}
          >
            <RulerMarkers view={view} width={width} snap={snap} onSeek={seek}>
              <Ruler
                view={view}
                width={width}
                span={span}
                loop={loop}
                snap={snap}
                onSeek={seekAt}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
                onLoop={setLoop}
                onRefit={refit}
              />
              <PointerFlag line={pointer} />
              <PlayheadFlag
                line={playhead}
                onScrubStart={beginScrub}
                onScrub={(clientX, keys) => seekAt(trackX(clientX), keys)}
                onScrubEnd={endScrub}
              />
            </RulerMarkers>
          </div>
        </div>
      </div>

      {/* DS-SCROLLBAR */}
      <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-md">
        <div className="relative" style={{ height: rows.length * ROW }}>
          {rows.map((row) => (
            <LaneRow
              key={
                row.kind === "emitter"
                  ? `${row.emitter.index}`
                  : `${row.lane.path}:${row.lane.emitter.index}`
              }
              row={row}
              view={view}
              width={width}
              head={head}
              gestures={gestures}
              card={row.kind === "emitter" ? cardOf(row.emitter) : undefined}
              spawned={row.kind === "child" ? spawned : 0}
              expanded={row.kind === "emitter" && expanded.has(row.emitter.index)}
              onExpand={expand}
              onSelect={pick}
              onSeek={seekAt}
              snap={snap}
              followed={row.kind === "emitter" ? follow.get(row.emitter.index) : undefined}
              onFollow={onFollow}
            />
          ))}
          <div
            ref={tracks}
            className="pointer-events-none absolute inset-y-0 overflow-hidden"
            style={{ left: head, right: COUNT }}
            aria-hidden="true"
          >
            <PastRun x={xOf(view, width, span)} width={width} />
            {loop !== null && (
              <div
                className="absolute inset-y-0 bg-accent-500/5"
                style={{
                  left: xOf(view, width, loop.from),
                  width: Math.max(xOf(view, width, loop.to) - xOf(view, width, loop.from), 0),
                }}
              />
            )}
            {histogram && (
              <canvas
                ref={canvas}
                className="absolute top-0 left-0 opacity-70"
                style={{ width, height: rows.length * ROW }}
              />
            )}
            {markers !== null && (
              <MarkerLines markers={markers.markers} view={view} width={width} />
            )}
            <PointerLine line={pointer} />
            <PlayheadLine line={playhead} />
          </div>
        </div>
      </div>
    </div>
  );
}
