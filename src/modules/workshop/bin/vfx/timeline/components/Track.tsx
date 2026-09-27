import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import {
  barFields,
  type BarGrip,
  barGripAt,
  draggedBar,
  dragReadout,
  edgeTime,
  snapTime,
} from "../utils/barDrag";
import { type LaneBar, minorTicks, type TimeWindow, timeAt, xOf } from "../utils/laneModel";
import { Bar } from "./BarShape";

/** How far a press travels before it drags rather than seeks, in pixels. */
const DRAG_START = 3;

/** The step a free drag rounds to, in seconds, and the step under Ctrl. */
const STEP = 0.01;
const FINE_STEP = 0.001;

interface TrackProps {
  label: string;
  view: TimeWindow;
  width: number;
  bars: readonly LaneBar[];
  dimmed: boolean;
  /** The room left at the lane's right edge, in pixels. */
  right: number;
  onSeek: (x: number) => void;
  /** Pause the clock while a press scrubs. */
  onScrubStart: () => void;
  /** Let the clock run again once the scrub ends. */
  onScrubEnd: () => void;
  /** Write the first bar as a drag left it, and undefined for a lane whose bars are read-only. */
  onBarEdit?: (grip: BarGrip, bar: LaneBar) => Promise<boolean>;
  /** Run the preview on the bar a drag holds, and on the written one again with null. */
  onBarPreview?: (bar: LaneBar | null) => void;
  /** Open the first bar's exact times, at a point on the screen. */
  onBarOpen?: (at: { readonly x: number; readonly y: number }) => void;
  /** The first bar offers its linger edge. */
  lingers?: boolean;
  /** The times a dragged edge snaps to beside the view's own ticks: other bars' edges. */
  snaps?: readonly number[];
  /** Where the playhead stands, which a dragged edge snaps to as well. */
  playhead?: () => number;
}

/** A drag of the lane's first bar: the part it holds, the bar at the press, and where it began. */
interface BarDrag {
  readonly grip: BarGrip;
  readonly held: LaneBar;
  readonly x: number;
  /** The seconds between the press and the edge it holds, which the edge keeps. */
  readonly offset: number;
  moved: boolean;
}

interface Draft {
  readonly grip: BarGrip;
  readonly bar: LaneBar;
  /** The time the edge snapped to, for the guide, and null for a free drag. */
  readonly snapped: number | null;
  /** The pointer has travelled, so the value reads beside the edge. */
  readonly moved: boolean;
}

/**
 * A lane's bars over the view, which a press or a drag scrubs along.
 *
 * Where `onBarEdit` is given, the first bar edits. A drag on its body moves it, on its left
 * edge trims its first emission, on its right edge sets its lifetime and on the end of its
 * hatch its linger. The edge snaps to other bars, the playhead and the ticks, and rounds to
 * hundredths between them. Shift drags free and Ctrl rounds to thousandths. The dragged bar
 * and its value draw until the edit lands, and Escape drops the drag. A press on the bar
 * that never travels seeks, as the rest of the lane does, and a double click opens its
 * exact times. "The timeline" in docs/ux/BIN_EDITOR.md.
 */
export function Track({
  label,
  view,
  width,
  bars,
  dimmed,
  right,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onBarEdit,
  onBarPreview,
  onBarOpen,
  lingers = false,
  snaps,
  playhead,
}: TrackProps) {
  const pressed = useRef(false);
  const drag = useRef<BarDrag | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hovered, setHovered] = useState<BarGrip | null>(null);
  const editable = onBarEdit !== undefined && bars.length > 0;

  /* A landed edit reads the emitter again, whose new bar replaces the draft. */
  useEffect(() => {
    if (drag.current === null) setDraft(null);
  }, [bars]);

  const dropDrag = () => {
    drag.current = null;
    setDraft(null);
    onBarPreview?.(null);
  };
  const dropRef = useRef(dropDrag);
  dropRef.current = dropDrag;

  useEffect(() => {
    if (draft === null || drag.current === null) return;

    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dropRef.current();
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [draft]);

  const at = (event: ReactPointerEvent<HTMLDivElement>) =>
    event.clientX - event.currentTarget.getBoundingClientRect().left;
  const gripAt = (x: number) => (editable ? barGripAt(bars[0], view, width, x, lingers) : null);

  const finishDrag = (x: number) => {
    const held = drag.current;
    drag.current = null;
    if (held === null) return;

    if (!held.moved) {
      setDraft(null);
      onSeek(x);
      return;
    }
    const before = barFields(held.grip, held.held);
    const after = draft === null ? before : barFields(draft.grip, draft.bar);
    if (draft === null || onBarEdit === undefined || sameFields(before, after)) {
      dropDrag();
      return;
    }
    void onBarEdit(draft.grip, draft.bar).then((landed) => {
      if (landed) return;
      setDraft(null);
      onBarPreview?.(null);
    });
  };

  const moveDrag = (held: BarDrag, event: ReactPointerEvent<HTMLDivElement>) => {
    const x = at(event);
    if (!held.moved && Math.abs(x - held.x) < DRAG_START) return;

    held.moved = true;
    const raw = timeAt(view, width, x) - held.offset;
    const targets = event.shiftKey
      ? []
      : [0, playhead?.() ?? 0, ...(snaps ?? []), ...minorTicks(view, width)];
    const { time, snapped } = snapTime(raw, targets, view, width, event.ctrlKey ? FINE_STEP : STEP);
    const bar = draggedBar(held.grip, held.held, time);
    setDraft({ grip: held.grip, bar, snapped, moved: true });
    onBarPreview?.(bar);
  };

  const letGo = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.current !== null) {
      finishDrag(at(event));
      return;
    }
    if (!pressed.current) return;

    pressed.current = false;
    onScrubEnd();
  };

  const shown = draft === null ? bars : [draft.bar, ...bars.slice(1)];
  const cursor = cursorOf(draft?.grip ?? hovered, draft !== null);

  return (
    <div
      data-track=""
      role="group"
      aria-label={label}
      title={editable ? m.workshop_bin_timeline_bar_hint() : undefined}
      className={twMerge(
        "group/track absolute inset-y-0 left-0 overflow-hidden",
        dimmed && "opacity-50",
      )}
      style={{ right, cursor }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const x = at(event);
        const grip = gripAt(x);
        if (grip !== null) {
          const first = bars[0];
          const held = grip === "end" ? { ...first, end: first.end ?? view.to } : first;
          const edge = edgeTime(grip, held, view) ?? held.start;
          drag.current = { grip, held, x, offset: timeAt(view, width, x) - edge, moved: false };
          setDraft({ grip, bar: held, snapped: null, moved: false });
          return;
        }

        pressed.current = true;
        onScrubStart();
        onSeek(x);
      }}
      onPointerMove={(event) => {
        const held = drag.current;
        if (held !== null) {
          moveDrag(held, event);
          return;
        }
        if (pressed.current) {
          onSeek(at(event));
          return;
        }
        setHovered(gripAt(at(event)));
      }}
      onPointerLeave={() => setHovered(null)}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onDoubleClick={(event) => {
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
        if (onBarOpen !== undefined && gripAt(x) !== null) {
          onBarOpen({ x: event.clientX, y: event.clientY });
        }
      }}
    >
      {shown.map((bar, index) => (
        <Bar key={index} bar={bar} view={view} width={width} quiet={draft !== null} />
      ))}
      {editable && (
        <Grips
          bar={shown[0]}
          view={view}
          width={width}
          lingers={lingers}
          active={draft?.grip ?? hovered}
        />
      )}
      {draft?.snapped != null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-accent-200"
          style={{ left: xOf(view, width, draft.snapped) }}
        />
      )}
      {draft?.moved === true && (
        <DragValue grip={draft.grip} bar={draft.bar} view={view} width={width} />
      )}
    </div>
  );
}

function cursorOf(grip: BarGrip | null, dragging: boolean): string | undefined {
  if (grip === null) return undefined;
  if (grip === "move") return dragging ? "grabbing" : "grab";
  return "ew-resize";
}

function sameFields(
  a: readonly { field: string; value: number }[],
  b: readonly { field: string; value: number }[],
): boolean {
  return a.length === b.length && a.every((each, at) => each.value === b[at]?.value);
}

/** The edges a drag takes: faint while the pointer is over the lane, lit on the one it holds. */
function Grips({
  bar,
  view,
  width,
  lingers,
  active,
}: {
  bar: LaneBar;
  view: TimeWindow;
  width: number;
  lingers: boolean;
  active: BarGrip | null;
}) {
  const grips: BarGrip[] = lingers ? ["start", "end", "linger"] : ["start", "end"];

  return (
    <>
      {grips.map((grip) => {
        const time = edgeTime(grip, bar, view);
        if (time === null) return null;

        const lit = active === grip || (active === "move" && grip === "start");
        return (
          <span
            key={grip}
            aria-hidden="true"
            data-grip={grip}
            className={twMerge(
              "pointer-events-none absolute top-1 bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-accent-300 opacity-0 group-hover/track:opacity-60",
              grip === "linger" && "bg-accent-400",
              lit && "opacity-100 group-hover/track:opacity-100",
            )}
            style={{ left: xOf(view, width, time) }}
          />
        );
      })}
    </>
  );
}

/** The value a drag writes, beside the edge it moves. */
function DragValue({
  grip,
  bar,
  view,
  width,
}: {
  grip: BarGrip;
  bar: LaneBar;
  view: TimeWindow;
  width: number;
}) {
  const seconds = dragReadout(grip, bar).toFixed(2);
  const edge = edgeTime(grip, bar, view) ?? bar.start;
  const text =
    grip === "end"
      ? m.workshop_bin_timeline_drag_lifetime_label({ seconds })
      : grip === "linger"
        ? m.workshop_bin_timeline_drag_linger_label({ seconds })
        : m.workshop_bin_timeline_drag_start_label({ seconds });

  return (
    <span
      role="status"
      className="pointer-events-none absolute inset-y-0.5 flex items-center rounded-sm bg-surface-800 px-1 font-mono text-meta text-surface-100 tabular-nums shadow"
      style={{ left: Math.min(xOf(view, width, edge) + 6, Math.max(width - 96, 0)) }}
    >
      {text}
    </span>
  );
}
