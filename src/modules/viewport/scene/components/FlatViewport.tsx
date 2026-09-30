import { Canvas, type RootState } from "@react-three/fiber";
import {
  type ComponentProps,
  type ReactNode,
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

export interface FlatViewportProps {
  /** Whether this surface spends frames, including while its canvas remains mounted. */
  readonly active?: boolean;
  /** Something on the canvas moves with time, so every frame draws rather than on demand. */
  readonly animating?: boolean;
  /** What draws on the canvas, which renders its own frame from a positive-priority frame callback. */
  readonly children: ReactNode;
}

/** The fibre measures the canvas as `Viewport` does, on every change and by its layout box. */
const MEASURE: ComponentProps<typeof Canvas>["resize"] = {
  scroll: false,
  debounce: 0,
  offsetSize: true,
};

interface CanvasDefaults {
  readonly canvas: unknown;
  readonly powerPreference?: WebGLRendererParameters["powerPreference"];
}

/**
 * A 2D canvas on the shared renderer, per section 3.5 of docs/plans/atlas-renderer.md.
 *
 * Beside `Viewport` rather than a mode of it: no camera rig, stage, sun or passes, and a loop
 * that draws on demand unless `animating`. The shared renderer is what lets a game shader's
 * translated program link here (`HandDrawnContext`), and a surface that finds it held by
 * another viewport on screen falls back to a context of its own.
 */
export function FlatViewport({ active = true, animating = false, children }: FlatViewportProps) {
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
  const loop = loopOf(running, animating);
  const root = useRef<RootState | null>(null);
  const [lease] = useState<RendererLease>(() => ({ running: false }));
  const [fellBack, setFellBack] = useState(false);
  const loopNow = useRef(loop);

  useLayoutEffect(() => {
    loopNow.current = loop;
    lease.running = running;
    if (root.current !== null) setLoop(root.current, loop);
  }, [lease, loop, running]);

  useLayoutEffect(
    () => () => {
      lease.running = false;
      releaseSharedRenderer(lease);
    },
    [lease],
  );

  return (
    <div ref={hold} className="relative size-full [&_canvas]:size-full!">
      {sized && (
        <Canvas
          key={fellBack ? "own" : "shared"}
          resize={MEASURE}
          frameloop={loop}
          eventSource={fellBack ? undefined : (box as RefObject<HTMLDivElement>)}
          gl={({ canvas, powerPreference }: CanvasDefaults) =>
            fellBack
              ? createOpaqueRenderer(canvas as HTMLCanvasElement, powerPreference)
              : sharedRenderer(powerPreference)
          }
          onCreated={(state) => {
            root.current = state;
            setLoop(state, loopNow.current);
          }}
        >
          {!fellBack && (
            <SharedRendererClaim
              lease={lease}
              box={box}
              onTaken={() => {
                releaseSharedRenderer(lease);
                setFellBack(true);
              }}
            />
          )}
          {children}
        </Canvas>
      )}
    </div>
  );
}

type Loop = "always" | "demand" | "never";

function loopOf(running: boolean, animating: boolean): Loop {
  if (!running) return "never";
  return animating ? "always" : "demand";
}

function setLoop(root: RootState, loop: Loop): void {
  const state = root.get();
  if (state.frameloop !== loop) state.setFrameloop(loop);
  if (loop === "never") state.internal.frames = 0;
  else state.invalidate();
}
