import { createContext, type RefCallback, useCallback, useState } from "react";

import type { BoardMotion } from "../utils/boardMotion";

/**
 * Whether the node a part sits in is in view, which `NodeFrame` provides.
 *
 * A part that follows the run reads it and follows only while its node is in view. True
 * outside a node, so a part drawn anywhere else follows as before.
 */
export const OnScreenContext = createContext(true);

/** The canvas's view motion, and null outside a canvas, where nothing moves the view. */
export const BoardMotionContext = createContext<BoardMotion | null>(null);

/** How far outside the view an element still counts as in it, so a pan finds it ready. */
const MARGIN = "200px";

const REPORTS = new WeakMap<Element, (shown: boolean) => void>();

let observer: IntersectionObserver | null = null;

/* One observer for every node, since each observer walks its own targets on a frame. */
function watcher(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) REPORTS.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin: MARGIN },
  );
  return observer;
}

/**
 * Whether the element the returned ref is on is in view, or within `MARGIN` of it.
 *
 * True until the first report, and always where the platform has no observer, so nothing
 * waits on a report to draw.
 */
export function useOnScreen<T extends Element>(): [RefCallback<T>, boolean] {
  const [shown, setShown] = useState(true);
  const ref = useCallback((element: T | null) => {
    if (element === null || typeof IntersectionObserver === "undefined") return;

    REPORTS.set(element, setShown);
    watcher().observe(element);

    return () => {
      watcher().unobserve(element);
      REPORTS.delete(element);
    };
  }, []);

  return [ref, shown];
}
