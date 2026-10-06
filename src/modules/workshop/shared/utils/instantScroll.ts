import { elementScroll, type Virtualizer } from "@tanstack/react-virtual";

/**
 * The virtualizer's element scroll, instant unless its caller asks for smooth.
 *
 * The app's `scroll-behavior: smooth` animates a plain `scrollTo`. A reveal re-aims on every
 * frame a row measures, and each re-aim restarts that animation.
 */
export function instantScroll(
  offset: number,
  { adjustments, behavior }: { adjustments?: number; behavior?: ScrollBehavior },
  instance: Virtualizer<HTMLDivElement, Element>,
): void {
  elementScroll(
    offset,
    { adjustments, behavior: behavior === "smooth" ? "smooth" : "instant" },
    instance,
  );
}
