/** A gizmo's press on one of its handles, marked until the release that ends it. */
export interface GrabLatch {
  /** Mark the press under way as a gizmo's. */
  readonly grab: () => void;
  /** Whether a gizmo took the press being released, which lets the mark go. */
  readonly take: () => boolean;
}

/** A latch no gizmo has marked. */
export function createGrabLatch(): GrabLatch {
  let grabbed = false;

  return {
    grab: () => {
      grabbed = true;
    },
    take: () => {
      const taken = grabbed;
      grabbed = false;
      return taken;
    },
  };
}
