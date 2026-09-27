import { createPortal, type RootState, useFrame } from "@react-three/fiber";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  use,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Camera, PerspectiveCamera, Scene } from "three";

import {
  type PreviewEntry,
  type PreviewViewStore,
  viewPlace,
  type ViewPlace,
} from "../utils/previewViews";

/** The Graph pane's previews, which its nodes register and its preview canvas draws. */
export const PreviewViewsContext = createContext<PreviewViewStore | null>(null);

/* After the canvas is cleared, and last, so every view draws over a clean frame. */
const DRAW_PRIORITY = 1;

const NO_VIEWS: readonly PreviewEntry[] = [];

const NO_SUBSCRIPTION = () => () => undefined;

/**
 * A box in a node that the pane's preview canvas draws `children` into.
 *
 * The box is an empty element the canvas measures on every frame, and the children render
 * inside the canvas, under the contexts the canvas bridges. Outside a pane that draws
 * previews it is an empty box.
 */
export function PreviewView({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const store = use(PreviewViewsContext);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    store?.set({ id, box, children });
  }, [store, id, children]);
  useLayoutEffect(() => () => store?.delete(id), [store, id]);

  return <div ref={box} className={className} style={style} />;
}

/** Every preview of the pane, each drawn scissored to its box. It renders inside the canvas. */
export function PreviewViews() {
  const store = use(PreviewViewsContext);
  const views = useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIPTION,
    store?.snapshot ?? (() => NO_VIEWS),
  );

  return views.map((view) => <ViewPortal key={view.id} view={view} />);
}

function ViewPortal({ view }: { view: PreviewEntry }) {
  const [scene] = useState(() => new Scene());
  return createPortal(<ViewDraw box={view.box}>{view.children}</ViewDraw>, scene);
}

/**
 * Draws the view's scene into its box, measured against the canvas on this frame.
 *
 * A box off the canvas draws nothing, and one back on it draws again on the next frame, as
 * nothing is kept between frames.
 */
function ViewDraw({ box, children }: { box: RefObject<HTMLElement | null>; children: ReactNode }) {
  useFrame((state) => {
    const element = box.current;
    if (element === null) return;

    const place = viewPlace(
      element.getBoundingClientRect(),
      state.gl.domElement.getBoundingClientRect(),
    );
    if (place !== null) drawView(state, place);
  }, DRAW_PRIORITY);

  return children;
}

function drawView({ gl, scene, camera }: RootState, place: ViewPlace): void {
  aim(camera, place.width / place.height);

  const autoClear = gl.autoClear;
  gl.autoClear = false;
  gl.setViewport(place.left, place.bottom, place.width, place.height);
  gl.setScissor(place.left, place.bottom, place.width, place.height);
  gl.setScissorTest(true);
  try {
    gl.render(scene, camera);
  } finally {
    gl.setScissorTest(false);
    gl.autoClear = autoClear;
  }
}

function aim(camera: Camera, aspect: number): void {
  if (!(camera instanceof PerspectiveCamera) || camera.aspect === aspect) return;

  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
