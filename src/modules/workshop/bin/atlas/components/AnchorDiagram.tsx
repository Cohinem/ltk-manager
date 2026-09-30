import { Tooltip } from "@/components";
import { twMerge } from "@/utils";

import type { PixelRect } from "../engine/layout/solve";

/** A point of the frame, as fractions of its width and height. */
export type AnchorPoint = readonly [number, number];

const FRACTIONS = [0, 0.5, 1] as const;

/** The diagram's widest and tallest shapes, width over height. */
const RATIO = { min: 1, max: 2.5 } as const;

export interface AnchorDiagramProps {
  /** The rect the anchor's points sit on: the screen, or the parent. */
  readonly frame: PixelRect;
  readonly element: PixelRect | null;
  /** The point the element is pinned to, none for an anchor no single point draws. */
  readonly held: AnchorPoint | null;
  /** The point the pointer or focus is on, whose distances the guides draw in place of held. */
  readonly previewed: AnchorPoint | null;
  readonly disabled: boolean;
  readonly pointLabel: (point: AnchorPoint) => string;
  readonly onPick: (column: number, row: number) => void;
  readonly onPreview: (point: AnchorPoint | null) => void;
}

/**
 * The anchor as a picture: the frame and the element in place, a dot at each of the nine points an
 * anchor takes with the pinned one lit, and dashed guides for the distances the element keeps to
 * that point, or to the point under the pointer before it is picked.
 */
export function AnchorDiagram({
  frame,
  element,
  held,
  previewed,
  disabled,
  pointLabel,
  onPick,
  onPreview,
}: AnchorDiagramProps) {
  const width = Math.max(frame.w, 1);
  const height = Math.max(frame.h, 1);
  const ratio = Math.min(Math.max(width / height, RATIO.min), RATIO.max);
  const guided = previewed ?? held;

  return (
    <div data-ui="AnchorDiagram" className="w-36 shrink-0 p-1.5">
      <div className="relative" style={{ aspectRatio: ratio }}>
        <svg
          viewBox={`${frame.x} ${frame.y} ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-hidden"
          aria-hidden
        >
          <rect
            x={frame.x}
            y={frame.y}
            width={width}
            height={height}
            vectorEffect="non-scaling-stroke"
            className="fill-surface-950/40 stroke-surface-600"
          />
          {element !== null && (
            <rect
              x={element.x}
              y={element.y}
              width={Math.max(element.w, 1)}
              height={Math.max(element.h, 1)}
              vectorEffect="non-scaling-stroke"
              className="fill-accent-500/20 stroke-accent-400"
            />
          )}
          {element !== null && guided !== null && (
            <Guides frame={frame} element={element} point={guided} />
          )}
        </svg>
        {FRACTIONS.flatMap((y, row) =>
          FRACTIONS.map((x, column) => {
            const point: AnchorPoint = [x, y];
            const lit = held !== null && held[0] === x && held[1] === y;
            const label = pointLabel(point);
            return (
              <Tooltip key={`${column}:${row}`} content={label}>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={lit}
                  disabled={disabled}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  className={twMerge(
                    "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface-500 bg-surface-800",
                    "focus-visible:ring-1 focus-visible:ring-accent-500 focus-visible:outline-none enabled:cursor-pointer enabled:hover:border-accent-hover disabled:opacity-60",
                    lit && "border-accent-300 bg-accent-500",
                  )}
                  onPointerEnter={() => onPreview(point)}
                  onPointerLeave={() => onPreview(null)}
                  onFocus={() => onPreview(point)}
                  onBlur={() => onPreview(null)}
                  onClick={() => onPick(column, row)}
                />
              </Tooltip>
            );
          }),
        )}
      </div>
    </div>
  );
}

/** The distances an element keeps to `point` of `frame`, one dashed guide per axis. */
function Guides({
  frame,
  element,
  point,
}: {
  frame: PixelRect;
  element: PixelRect;
  point: AnchorPoint;
}) {
  const across = span(frame.x, frame.w, element.x, element.w, point[0]);
  const down = span(frame.y, frame.h, element.y, element.h, point[1]);
  const middleX = element.x + element.w / 2;
  const middleY = element.y + element.h / 2;
  const line = "stroke-accent-300";

  return (
    <>
      <line
        x1={across[0]}
        x2={across[1]}
        y1={middleY}
        y2={middleY}
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
        className={line}
      />
      <line
        x1={middleX}
        x2={middleX}
        y1={down[0]}
        y2={down[1]}
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
        className={line}
      />
    </>
  );
}

/** Where a guide runs on one axis: from the frame's edge to the element's, or centre to centre. */
function span(
  frameAt: number,
  frameSize: number,
  at: number,
  size: number,
  fraction: number,
): readonly [number, number] {
  if (fraction < 0.25) return [frameAt, at];
  if (fraction > 0.75) return [at + size, frameAt + frameSize];
  return [frameAt + frameSize / 2, at + size / 2];
}
