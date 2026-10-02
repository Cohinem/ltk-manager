import { Canvas } from "@react-three/fiber";
import {
  type ComponentProps,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { WebGLRendererParameters } from "three";

import { useContentVisible, useResizeObserver } from "@/hooks";

import {
  createOpaqueRenderer,
  releaseSharedRenderer,
  type RendererLease,
  sharedRenderer,
} from "../utils/sharedRenderer";
import { SharedRendererClaim } from "./SharedRendererClaim";

/**
 * How the fibre measures the canvas: on every change, never on a scroll, and by its layout box.
 *
 * The default waits 50ms for a resize to settle, which leaves a dragged seam drawing a
 * frame sized for the old box. Pointer events read offsets, so nothing reads where the
 * canvas stands on the page. `offsetSize` reads the box before any CSS transform. A canvas
 * inside a zoomed graph node draws at its own size, and the zoom only scales it on screen.
 */
const MEASURE: ComponentProps<typeof Canvas>["resize"] = {
  scroll: false,
  debounce: 0,
  offsetSize: true,
};

/** What `opaqueRenderer` reads of the defaults the fibre hands a renderer factory. */
interface CanvasDefaults {
  /** The mounted canvas, which the fibre types against DOM typings of its own. */
  readonly canvas: unknown;
  readonly powerPreference?: WebGLRendererParameters["powerPreference"];
}

export type CanvasHost = ReturnType<typeof useCanvasHost>;

/**
 * The box a canvas draws in, whether it is on screen and sized, and its hold on the shared
 * renderer.
 *
 * `hold` is the box's ref. The canvas runs while `active`, on screen and of a size. A canvas
 * that wants the shared renderer and finds it held by another viewport on screen falls back
 * to a context of its own, and `shares` turns false.
 */
export function useCanvasHost(active: boolean, wantsShared: boolean) {
  const visible = useContentVisible();
  const [sized, setSized] = useState(false);
  const measure = useResizeObserver<HTMLDivElement>((element) => {
    setSized(element.clientWidth > 0 && element.clientHeight > 0);
  });
  const box = useRef<HTMLDivElement | null>(null);
  const hold = useCallback(
    (element: HTMLDivElement) => {
      box.current = element;
      return measure(element);
    },
    [measure],
  );
  const running = active && visible && sized;
  const [lease] = useState<RendererLease>(() => ({ running: false }));
  const [fellBack, setFellBack] = useState(false);

  useLayoutEffect(() => {
    lease.running = running;
  }, [lease, running]);

  /* A layout cleanup, so a tab replacing this one in the same commit finds it let go. */
  useLayoutEffect(
    () => () => {
      lease.running = false;
      releaseSharedRenderer(lease);
    },
    [lease],
  );

  const fallBack = useCallback(() => {
    releaseSharedRenderer(lease);
    setFellBack(true);
  }, [lease]);

  return { hold, box, sized, running, lease, shares: wantsShared && !fellBack, fallBack };
}

export type HostCanvasProps = Omit<
  ComponentProps<typeof Canvas>,
  "gl" | "resize" | "eventSource"
> & {
  readonly host: CanvasHost;
};

/** A fibre canvas in a `useCanvasHost` box, on the shared renderer while the host shares it. */
export function HostCanvas({ host, children, ...props }: HostCanvasProps) {
  const { shares, box, lease, fallBack } = host;

  return (
    <Canvas
      {...props}
      key={shares ? "shared" : "own"}
      resize={MEASURE}
      eventSource={shares ? (box as RefObject<HTMLDivElement>) : undefined}
      gl={({ canvas, powerPreference }: CanvasDefaults) =>
        shares
          ? sharedRenderer(powerPreference)
          : createOpaqueRenderer(canvas as HTMLCanvasElement, powerPreference)
      }
    >
      {shares && <SharedRendererClaim lease={lease} box={box} onTaken={fallBack} />}
      {children}
    </Canvas>
  );
}
