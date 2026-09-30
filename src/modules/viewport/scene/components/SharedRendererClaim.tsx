import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import { Vector2 } from "three";

import {
  holdsSharedRenderer,
  type RendererLease,
  takeSharedRenderer,
} from "../utils/sharedRenderer";

interface SharedRendererClaimProps {
  readonly lease: RendererLease;
  readonly box: RefObject<HTMLDivElement | null>;
  /** Another viewport on screen draws with the shared renderer, so this one needs its own. */
  readonly onTaken: () => void;
}

/**
 * Take the shared renderer before a frame draws, where another viewport had it.
 *
 * Run in the frame rather than in an effect, because a tab switch hides one viewport and
 * shows another in one commit, and only by the frame has the hidden one stopped running.
 * A viewport on screen that still holds it keeps it, and this one falls back.
 */
export function SharedRendererClaim({ lease, box, onTaken }: SharedRendererClaimProps) {
  useFrame(({ gl, size, viewport, setFrameloop }) => {
    if (!holdsSharedRenderer(lease) && takeSharedRenderer(lease) === null) {
      setFrameloop("never");
      onTaken();
      return;
    }

    const canvas = gl.domElement;
    if (box.current !== null && canvas.parentNode !== box.current) box.current.append(canvas);

    /* The fibre sizes the renderer only when its own box changes, and another viewport
       may have drawn with it at another size since. */
    if (gl.getPixelRatio() !== viewport.dpr) gl.setPixelRatio(viewport.dpr);
    gl.getSize(DRAWN_SIZE);
    if (DRAWN_SIZE.x !== size.width || DRAWN_SIZE.y !== size.height) {
      gl.setSize(size.width, size.height);
    }
  }, CLAIM_PRIORITY);
  return null;
}

/** Ahead of every other frame callback, so the claim lands before anything draws. */
const CLAIM_PRIORITY = -1000;

const DRAWN_SIZE = new Vector2();
