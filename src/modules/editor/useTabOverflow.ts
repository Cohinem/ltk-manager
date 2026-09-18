import { type RefObject, useCallback, useEffect, useState } from "react";

/** One box along the strip's own axis. */
export interface Span {
  left: number;
  right: number;
}

/** A tab within this much of the lane's edge reads as whole. */
const EDGE_SLACK = 1;

/** The tabs whose box the lane does not hold whole, at either end. */
export function offscreenTabs(lane: Span, tabs: readonly Span[]): number {
  return tabs.filter(
    (tab) => tab.left < lane.left - EDGE_SLACK || tab.right > lane.right + EDGE_SLACK,
  ).length;
}

/**
 * How many of the strip's tabs sit outside its scroll lane.
 *
 * Zero while the lane holds every tab, which is the strip that needs no list of
 * what it holds. Measured from the laid-out boxes: a long label, a pin and the
 * lock all count for the width they take.
 */
export function useTabOverflow(lane: RefObject<HTMLElement | null>, tabCount: number): number {
  const [offscreen, setOffscreen] = useState(0);

  const measure = useCallback(() => {
    const element = lane.current;
    if (!element) return;

    const box = element.getBoundingClientRect();
    const tabs = [...element.querySelectorAll<HTMLElement>("[data-tab-id]")].map((tab) => {
      const rect = tab.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });

    setOffscreen(offscreenTabs({ left: box.left, right: box.right }, tabs));
  }, [lane]);

  useEffect(() => {
    const element = lane.current;
    if (!element) return;

    measure();
    element.addEventListener("scroll", measure, { passive: true });

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const tab of element.querySelectorAll("[data-tab-id]")) observer.observe(tab);

    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [lane, measure, tabCount]);

  return offscreen;
}
