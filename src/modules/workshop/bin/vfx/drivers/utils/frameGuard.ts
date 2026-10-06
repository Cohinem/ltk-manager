import type { RenderCallback, RootState } from "@react-three/fiber";
import type { Object3D } from "three";

/**
 * One frame callback as R3F lists it: its ref, which `useFrame` rewrites on each render, and
 * the priority it was registered at.
 */
interface Subscriber {
  readonly ref: { current: RenderCallback };
  readonly priority?: number;
}

/** The priority `useFrame` gives a callback that names none. */
const DEFAULT_PRIORITY = 0;

/** The scenes of the views with no area on the canvas this frame. */
const IDLE = new WeakSet<Object3D>();

/**
 * Say whether the view drawing `scene` is off the canvas.
 *
 * While it is, the guard skips the view's callbacks of the default priority, which are the
 * ones that write an emitter's buffers for a draw that will not happen. A callback registered
 * at a priority of its own always runs, so the view's own draw keeps measuring its box and
 * finds when it is back.
 */
export function setIdle(scene: Object3D, idle: boolean): void {
  if (idle) IDLE.add(scene);
  else IDLE.delete(scene);
}

export function isIdle(scene: Object3D): boolean {
  return IDLE.has(scene);
}

/** Who hears a view's failures, by the scene the view draws. */
const FAILURES = new WeakMap<Object3D, (error: unknown) => void>();

/** Scenes whose failure the console has already been told of. */
const LOGGED = new WeakSet<Object3D>();

const GUARDED = new WeakSet<object>();

/** Hear the failures of the view drawing `scene`, until the returned call. */
export function watchFailure(scene: Object3D, onFail: (error: unknown) => void): () => void {
  FAILURES.set(scene, onFail);
  return () => {
    if (FAILURES.get(scene) === onFail) FAILURES.delete(scene);
  };
}

/**
 * Wrap each frame callback not yet wrapped, so a throw in it cannot end the frame.
 *
 * A throw hides the scene of the store the callback runs in, which for a drei view is the
 * view's own, and is reported to `watchFailure` and once to the console. The ref keeps its
 * identity, which R3F unsubscribes by. A callback of the default priority does not run while
 * its view is idle, per `setIdle`.
 */
export function guardFrames(subscribers: readonly Subscriber[]): void {
  for (const { ref, priority } of subscribers) guard(ref, priority ?? DEFAULT_PRIORITY);
}

/* `useFrame` rewrites `current` on each render, so the setter keeps the latest callback
   and the getter hands the loop its guarded call. */
function guard(ref: { current: RenderCallback }, priority: number): void {
  if (GUARDED.has(ref)) return;
  GUARDED.add(ref);

  let inner = ref.current;
  const safe: RenderCallback = (state, delta, frame) => {
    if (priority === DEFAULT_PRIORITY && IDLE.has(state.scene)) return;

    try {
      inner(state, delta, frame);
    } catch (error) {
      fail(state, error);
    }
  };
  Object.defineProperty(ref, "current", {
    configurable: true,
    get: () => safe,
    set: (next: RenderCallback) => {
      inner = next;
    },
  });
}

function fail(state: RootState, error: unknown): void {
  state.scene.visible = false;
  FAILURES.get(state.scene)?.(error);
  if (LOGGED.has(state.scene)) return;

  LOGGED.add(state.scene);
  console.error("A graph preview failed to draw and is hidden:", error);
}
