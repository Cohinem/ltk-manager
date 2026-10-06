/** How many frames a reveal keeps aiming before it settles on whatever is drawn. */
const REVEAL_FRAMES = 30;

/** How far past an edge of the view an element may sit and still count as shown, in pixels. */
const SLACK = 1;

export interface ListReveal {
  /** The list's scroll element, and null before it mounts. */
  readonly scroller: () => HTMLElement | null;
  /** The element to focus, and null until the list has drawn it. */
  readonly find: () => HTMLElement | null;
  /** Jump the list to the element's row. It must not animate. */
  readonly scrollTo: () => void;
  /** How much of the view's top a pinned band covers, in pixels. */
  readonly inset?: () => number;
  /** Told once, when the element is focused or the frames ran out. */
  readonly onSettled?: () => void;
}

/**
 * Bring an element of a virtual list into view and focus it.
 *
 * A virtual list draws a row only after its scroll has reached it, and rows that load late
 * move the ones under them. Each frame this checks that the element is drawn inside the view,
 * and jumps the list again where it is not. An element already in view is focused where it is.
 *
 * The first check waits a frame, so a menu that closes on the same click has given focus back
 * first. Returns the cancel.
 */
export function revealInList({ scroller, find, scrollTo, inset, onSettled }: ListReveal) {
  let frame = 0;
  let tries = 0;

  const attempt = () => {
    const view = scroller();
    const element = find();
    const shown = view !== null && element !== null && shows(view, element, inset?.() ?? 0);
    if (shown || tries >= REVEAL_FRAMES) {
      element?.focus({ preventScroll: true });
      onSettled?.();
      return;
    }

    tries += 1;
    scrollTo();
    frame = requestAnimationFrame(attempt);
  };

  frame = requestAnimationFrame(attempt);

  return () => cancelAnimationFrame(frame);
}

/**
 * Whether `element` is drawn whole inside `view`, below `inset` pixels of its top.
 *
 * A view of no height is hidden or not laid out yet, and shows nothing.
 */
function shows(view: HTMLElement, element: HTMLElement, inset: number): boolean {
  const frame = view.getBoundingClientRect();
  if (frame.height === 0) return false;

  const box = element.getBoundingClientRect();

  return box.top >= frame.top + inset - SLACK && box.bottom <= frame.bottom + SLACK;
}
