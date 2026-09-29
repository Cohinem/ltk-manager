import type { SnapGuide } from "../engine/edit/snap";
import type { PixelRect, Screen } from "../engine/layout/solve";
import type { ViewTransform } from "../rendering/utils/composite";
import { SAFE_ZONE_INSET } from "../state/atlasPreview";
import { HANDLES, handlePoint } from "./canvasGeometry";

/** A handle's side in pane pixels. */
const HANDLE_SIZE = 8;

export interface FrameOverlayProps {
  readonly view: ViewTransform;
  readonly screen: Screen;
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
}

/**
 * The frame's outline and the marks over it, in pane pixels, so they stay one pixel wide at every
 * zoom: the safe zone, the image placeholders, the hovered and selected rects, the primary selection's
 * handles, a marquee and the snap guides of a drag.
 */
export function FrameOverlay({
  view,
  screen,
  safeZone,
  placeholders,
  hovered,
  selected,
  others,
  handles,
  marquee,
  guides,
}: FrameOverlayProps) {
  const place = (rect: PixelRect) => ({
    x: view.x + rect.x * view.zoom + 0.5,
    y: view.y + rect.y * view.zoom + 0.5,
    width: Math.max(0, rect.w * view.zoom - 1),
    height: Math.max(0, rect.h * view.zoom - 1),
  });
  const toPane = (x: number, y: number) =>
    [view.x + x * view.zoom, view.y + y * view.zoom] as const;
  const whole = { x: 0, y: 0, w: screen.width, h: screen.height };
  const inset = {
    x: screen.width * SAFE_ZONE_INSET,
    y: screen.height * SAFE_ZONE_INSET,
    w: screen.width * (1 - 2 * SAFE_ZONE_INSET),
    h: screen.height * (1 - 2 * SAFE_ZONE_INSET),
  };

  return (
    <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      <rect {...place(whole)} className="fill-none stroke-surface-600" />
      {safeZone && (
        <rect {...place(inset)} className="fill-none stroke-surface-500" strokeDasharray="6 4" />
      )}
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
    </svg>
  );
}
