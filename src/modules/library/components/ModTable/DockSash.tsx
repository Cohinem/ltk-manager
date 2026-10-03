import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { HEADER_HEIGHT } from "./ModTableHeader";

const SASH_WIDTH = 3;

/** How far the sash stops short of the row's top and bottom edges. */
const INSET = 4;

/** The shortest sash worth drawing, below which a row half scrolled away shows none. */
const MIN_HEIGHT = 6;

interface DockSashProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** The space between the frame's left edge and the rows, which the sash sits in. */
  gutter: number;
  /** The mod the dock shows, whose row the sash lines up with. */
  shownId: string | null;
}

/**
 * The accent sash in the table's left gutter, beside the row the dock shows.
 *
 * It is drawn fixed over the page and placed from the row's own rectangle, so
 * it can slide from row to row rather than jump between rows that draw it. It is
 * placed after every render of the table and on every scroll and resize, never
 * through state, so following the pointer costs no render of its own. Per "The
 * panel follows the pointer" in docs/ux/LIBRARY.md.
 */
export function DockSash({ scrollerRef, gutter, shownId }: DockSashProps) {
  const sash = useRef<HTMLSpanElement>(null);

  const place = useCallback(() => {
    const scroller = scrollerRef.current;
    const element = sash.current;
    if (!scroller || !element) return;

    const row = shownRow(scroller, shownId);
    if (!row) {
      element.style.display = "none";
      return;
    }

    const frame = scroller.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const top = Math.max(box.top, frame.top + HEADER_HEIGHT) + INSET;
    const bottom = Math.min(box.bottom, frame.bottom) - INSET;
    if (bottom - top < MIN_HEIGHT) {
      element.style.display = "none";
      return;
    }

    element.style.display = "block";
    element.style.left = `${frame.left + (gutter - SASH_WIDTH) / 2}px`;
    element.style.top = `${top}px`;
    element.style.height = `${bottom - top}px`;
  }, [scrollerRef, gutter, shownId]);

  useLayoutEffect(place);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let frame = 0;
    /* After the virtualizer has drawn the rows the scroll brought in. */
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [scrollerRef, place]);

  return createPortal(
    <span
      ref={sash}
      aria-hidden="true"
      style={{ display: "none", width: SASH_WIDTH }}
      className="pointer-events-none fixed z-20 rounded-full bg-accent-500 transition-[top,height] duration-75 ease-out"
    />,
    document.body,
  );
}

/** The drawn row of the mod the dock shows, preferring the current row when it is that mod. */
function shownRow(scroller: HTMLElement, modId: string | null): HTMLElement | null {
  if (modId === null) return null;

  const current = scroller.querySelector<HTMLElement>('[role="row"][aria-current="true"]');
  if (current?.dataset.modId === modId) return current;

  return scroller.querySelector<HTMLElement>(`[role="row"][data-mod-id="${CSS.escape(modId)}"]`);
}
