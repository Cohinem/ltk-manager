import type { SnapGuide } from "../engine/edit/snap";
import type { PixelRect } from "../engine/layout/solve";
import type { ViewTransform } from "../rendering/utils/composite";
import { HANDLES, handlePoint, safeZoneOf } from "./canvasGeometry";

/** A handle's side in pane pixels. */
const HANDLE_SIZE = 8;
/** How far above its frame a frame's name sits, in pane pixels. */
const LABEL_RISE = 6;
/** The band above a frame its name answers a pointer in, in pane pixels. */
const LABEL_BAND = 20;
/** Where a nested scene's name sits inside its box, and the band it answers in, in pane pixels. */
const NESTED_INSET = { x: 4, y: 12, band: 16 } as const;

/**
 * A screen drawn on the board, or at `depth` 1 and down a scene nested in one, with the scene it
 * heads or boxes and its name, empty for none.
 */
export interface OverlayFrame {
  readonly rect: PixelRect;
  readonly scene: string | null;
  readonly label: string;
  readonly depth: number;
}

/**
 * The named frame whose name is under the pane point `x, y`: a screen's above it, a nested scene's
 * inside its top edge, the deepest first.
 */
export function frameNameAt(
  frames: readonly OverlayFrame[],
  view: ViewTransform,
  x: number,
  y: number,
): OverlayFrame | undefined {
  const deepest = [...frames].sort((a, b) => b.depth - a.depth);
  return deepest.find((frame) => {
    const left = view.x + frame.rect.x * view.zoom;
    const top = view.y + frame.rect.y * view.zoom;
    const inside = x >= left && x <= left + frame.rect.w * view.zoom;
    const band =
      frame.depth === 0
        ? y >= top - LABEL_BAND && y < top
        : y >= top && y < top + NESTED_INSET.band;
    return frame.label !== "" && inside && band;
  });
}

export interface FrameOverlayProps {
  readonly view: ViewTransform;
  readonly frames: readonly OverlayFrame[];
  readonly safeZone: boolean;
  readonly placeholders: readonly PixelRect[];
  readonly hovered: PixelRect | null;
  /** The primary selection. */
  readonly selected: PixelRect | null;
  /** The rest of the selection. */
  readonly others: readonly PixelRect[];
  /** Whether the primary selection draws its resize handles. */
  readonly handles: boolean;
  readonly marquee: PixelRect | null;
  readonly guides: readonly SnapGuide[];
  /** Where the component being placed would draw. */
  readonly ghost: PixelRect | null;
}

/**
 * The frames' outlines and names, a nested scene's boxed inside its frame, and the marks over them,
 * in pane pixels, so they stay one pixel wide at every zoom: the safe zone, the image placeholders, the hovered and selected rects, the
 * primary selection's handles, a marquee, the snap guides of a drag and the ghost of a component
 * being placed.
 */
export function FrameOverlay({
  view,
  frames,
  safeZone,
  placeholders,
  hovered,
  selected,
  others,
  handles,
  marquee,
  guides,
  ghost,
}: FrameOverlayProps) {
  const place = (rect: PixelRect) => ({
    x: view.x + rect.x * view.zoom + 0.5,
    y: view.y + rect.y * view.zoom + 0.5,
    width: Math.max(0, rect.w * view.zoom - 1),
    height: Math.max(0, rect.h * view.zoom - 1),
  });
  const toPane = (x: number, y: number) =>
    [view.x + x * view.zoom, view.y + y * view.zoom] as const;

  return (
    <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      {frames.map((frame, at) => {
        const [x, y] = toPane(frame.rect.x, frame.rect.y);
        if (frame.depth > 0) {
          return (
            <g key={at}>
              <rect {...place(frame.rect)} className="fill-none stroke-surface-500/60" />
              <text
                x={x + NESTED_INSET.x}
                y={y + NESTED_INSET.y}
                className="fill-surface-500 font-sans text-fine"
              >
                {frame.label}
              </text>
            </g>
          );
        }
        return (
          <g key={at}>
            <rect {...place(frame.rect)} className="fill-none stroke-surface-600" />
            {safeZone && (
              <rect
                {...place(safeZoneOf(frame.rect))}
                className="fill-none stroke-surface-500"
                strokeDasharray="6 4"
              />
            )}
            {frame.label !== "" && (
              <text x={x} y={y - LABEL_RISE} className="fill-surface-400 font-sans text-meta">
                {frame.label}
              </text>
            )}
          </g>
        );
      })}
      {placeholders.map((rect, at) => (
        <rect
          key={at}
          {...place(rect)}
          className="fill-surface-500/10 stroke-surface-500"
          strokeDasharray="3 3"
        />
      ))}
      {hovered !== null && (
        <rect {...place(hovered)} className="fill-none stroke-accent-300" strokeDasharray="4 3" />
      )}
      {others.map((rect, at) => (
        <rect key={at} {...place(rect)} className="fill-accent-500/5 stroke-accent-400/70" />
      ))}
      {selected !== null && (
        <rect {...place(selected)} className="fill-accent-500/10 stroke-accent-400" />
      )}
      {guides.map((guide, at) => {
        const [x0, y0] =
          guide.axis === 0 ? toPane(guide.at, guide.from) : toPane(guide.from, guide.at);
        const [x1, y1] = guide.axis === 0 ? toPane(guide.at, guide.to) : toPane(guide.to, guide.at);
        return <line key={at} x1={x0} y1={y0} x2={x1} y2={y1} className="stroke-accent-200" />;
      })}
      {handles &&
        selected !== null &&
        HANDLES.map((handle) => {
          const [x, y] = toPane(...handlePoint(selected, handle));
          return (
            <rect
              key={handle}
              x={Math.round(x - HANDLE_SIZE / 2) + 0.5}
              y={Math.round(y - HANDLE_SIZE / 2) + 0.5}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              className="fill-surface-950 stroke-accent-400"
            />
          );
        })}
      {marquee !== null && (
        <rect
          {...place(marquee)}
          className="fill-accent-500/10 stroke-accent-400"
          strokeDasharray="4 2"
        />
      )}
      {ghost !== null && (
        <rect
          {...place(ghost)}
          className="fill-accent-500/15 stroke-accent-300"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}
