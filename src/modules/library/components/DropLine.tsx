import type { DropSide } from "@/modules/library/utils";

/**
 * Where a dragged mod would land, drawn in the gap between two cards.
 *
 * An enabled card is already lit along its own edge in the same hue, so the
 * line cannot rely on colour to say what it is. It is capped at both ends, cut
 * out of whatever it crosses by a dark ring, and lifted off the surface by a
 * glow - none of which a card's edge does.
 */
interface DropLineProps {
  orientation: "horizontal" | "vertical";
  side: DropSide;
  /** False while the line is leaving, which is what fades it out. */
  visible: boolean;
}

/** The gap, not the card: half a row's gutter outside the edge it marks. */
function seat(orientation: "horizontal" | "vertical", side: DropSide): string {
  if (orientation === "horizontal") {
    return side === "before" ? "inset-x-0 -top-1" : "inset-x-0 -bottom-1";
  }
  return side === "before" ? "inset-y-1 -left-2" : "inset-y-1 -right-2";
}

function growth(orientation: "horizontal" | "vertical", visible: boolean): string {
  if (visible) return "scale-100 opacity-100";
  return orientation === "horizontal" ? "scale-x-50 opacity-0" : "scale-y-50 opacity-0";
}

const MARK = "rounded-full bg-accent-200 ring-1 ring-surface-950";

export function DropLine({ orientation, side, visible }: DropLineProps) {
  const horizontal = orientation === "horizontal";

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute z-20 transition-[opacity,transform] duration-100 ease-[var(--ease-out)] ${seat(orientation, side)} ${growth(orientation, visible)}`}
    >
      {horizontal && (
        <>
          <div
            className={`${MARK} absolute inset-x-1 h-0.5 -translate-y-1/2 shadow-[0_0_8px_var(--accent-500)]`}
          />
          <div className={`${MARK} absolute -left-0.5 h-1.5 w-1.5 -translate-y-1/2`} />
          <div className={`${MARK} absolute -right-0.5 h-1.5 w-1.5 -translate-y-1/2`} />
        </>
      )}
      {!horizontal && (
        <>
          <div
            className={`${MARK} absolute inset-y-1 w-0.5 -translate-x-1/2 shadow-[0_0_8px_var(--accent-500)]`}
          />
          <div className={`${MARK} absolute -top-0.5 h-1.5 w-1.5 -translate-x-1/2`} />
          <div className={`${MARK} absolute -bottom-0.5 h-1.5 w-1.5 -translate-x-1/2`} />
        </>
      )}
    </div>
  );
}
