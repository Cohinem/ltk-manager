import type { RenderCallback, RootState } from "@react-three/fiber";
import type { Object3D } from "three";

/** One frame callback as R3F lists it: its ref, which `useFrame` rewrites on each render. */
interface Subscriber {
  readonly ref: { current: RenderCallback };
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
 * identity, which R3F unsubscribes by.
 */
export function guardFrames(subscribers: readonly Subscriber[]): void {
  for (const { ref } of subscribers) guard(ref);
}

/* `useFrame` rewrites `current` on each render, so the setter keeps the latest callback
   and the getter hands the loop its guarded call. */
function guard(ref: { current: RenderCallback }): void {
  if (GUARDED.has(ref)) return;
  GUARDED.add(ref);

  let inner = ref.current;
  const safe: RenderCallback = (state, delta, frame) => {
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
