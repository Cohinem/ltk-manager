import type { RootState } from "@react-three/fiber";
import { type ReactNode, useLayoutEffect, useRef } from "react";

import { HostCanvas, useCanvasHost } from "./HostCanvas";

export interface FlatViewportProps {
  /** Whether this surface spends frames, including while its canvas remains mounted. */
  readonly active?: boolean;
  /** Something on the canvas moves with time, so every frame draws rather than on demand. */
  readonly animating?: boolean;
  /** What draws on the canvas, which renders its own frame from a positive-priority frame callback. */
  readonly children: ReactNode;
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
  const host = useCanvasHost(active, true);
  const loop = loopOf(host.running, animating);
  const root = useRef<RootState | null>(null);
  const loopNow = useRef(loop);

  useLayoutEffect(() => {
    loopNow.current = loop;
    if (root.current !== null) setLoop(root.current, loop);
  }, [loop]);

  return (
    <div ref={host.hold} className="relative size-full [&_canvas]:size-full!">
      {host.sized && (
        <HostCanvas
          host={host}
          frameloop={loop}
          onCreated={(state) => {
            root.current = state;
            setLoop(state, loopNow.current);
          }}
        >
          {children}
        </HostCanvas>
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
