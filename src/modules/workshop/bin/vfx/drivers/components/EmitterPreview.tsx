import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useState } from "react";
import { type Camera, Color, type IUniform, Scene } from "three";

import { type Bounds, OUTPUT_COLOR_SPACE, TONE_MAPPING } from "@/modules/viewport";

import type { EmitterModel } from "../../engine/model/model";
import { useVfxRun } from "../../playback/state/run";
import { VfxSystem } from "../../rendering/components/VfxSystem";
import { HandDrawnContext } from "../../rendering/hooks/useParticlePrograms";
import { useVfxMeshes } from "../../rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { type DrawnEmitter, drawnFor } from "../../rendering/utils/definitions";
import { bindFrameTargets, grabDepth, PARTICLE_LAYER } from "../../rendering/utils/frame";
import { definitionBounds } from "../../rendering/utils/systemBounds";
import { useBackdropColor } from "../state/previewBackdrop";
import { guardFrames } from "../utils/frameGuard";
import { FollowFraming, type Framing } from "./FollowFraming";
import { PreviewViews } from "./PreviewView";

/** The texture width a node's preview asks for, which the object grid's previews use too. */
export const PREVIEW_MIP_WIDTH = 128;

const FOV = 40;

/** The direction the camera looks at an emitter from: above, to its right and in front. */
const LOOK = normalized([0.55, 0.45, 1]);

/**
 * The camera's distance as a factor of the one that fits the box's sphere whole.
 *
 * Under 1, since the sphere around a box holds far more than the particles in it.
 */
const MARGIN = 0.85;

/**
 * The one canvas every node preview draws into, over the Graph pane's nodes.
 *
 * Each preview is a `PreviewView`, which the canvas draws scissored to the preview's box, so
 * one WebGL context serves every node. Pointer events pass through to the nodes.
 */
export function EmitterPreviewLayer() {
  const [box, sized] = useHasSize();

  return (
    <div
      ref={box}
      aria-hidden
      data-ui="EmitterPreviewLayer"
      /* Over React Flow's nodes at z-index 4, under its panels at 5. */
      className="pointer-events-none absolute inset-0 z-4"
    >
      <Canvas
        /* R3F makes its own box take pointer events, which would take the canvas's wheel and
           drags from React Flow underneath. */
        style={{ pointerEvents: "none" }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
        /* R3F runs one loop for every canvas, and a view drawn into a canvas of no size
           throws on its NaN camera, which stops every other canvas's frame as well. */
        frameloop={sized ? "always" : "never"}
        onCreated={({ gl }) => {
          gl.outputColorSpace = OUTPUT_COLOR_SPACE;
          gl.toneMapping = TONE_MAPPING;
        }}
      >
        <FrameGuard />
        <FollowPlacement />
        <ClearFrame />
        <FramePrep />
        <HandDrawnContext value>
          <PreviewViews />
        </HandDrawnContext>
      </Canvas>
    </div>
  );
}

/**
 * Keeps one throwing frame callback from ending the frame of every canvas.
 *
 * R3F runs every canvas's callbacks, the views' draws included, in one loop, and a throw
 * skips everything after it, so a single view that cannot draw freezes every preview and the
 * viewport. Each callback is wrapped once, before any other runs, and a throw hides the scene
 * of the view it belongs to, as `guardFrames` states.
 */
function FrameGuard() {
  useFrame((state) => guardFrames(state.internal.subscribers), BEFORE_ALL);
  return null;
}

/* Below every other callback's priority, the views' draws and R3F's default included. */
const BEFORE_ALL = -1000;

/** A box to measure, and whether it has an area, which a pane in a hidden tab does not. */
function useHasSize(): [(element: HTMLDivElement | null) => void, boolean] {
  const [sized, setSized] = useState(false);
  const box = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      setSized(rect !== undefined && rect.width > 0 && rect.height > 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [box, sized];
}

/**
 * Keeps the canvas's size and place on the page equal to the layer's, which each view is
 * placed and culled against.
 *
 * R3F measures only on its own resize and scroll events, so a pane moved beside another
 * would draw every preview where the canvas used to stand, and a size left behind culls
 * every view past it as off screen. The canvas takes its CSS size from that same size, so
 * the layer box, which always fills the pane, is what is measured.
 */
function FollowPlacement() {
  useFrame((state) => {
    const layer = state.gl.domElement.closest(LAYER) ?? state.gl.domElement;
    const { top, left, width, height } = layer.getBoundingClientRect();
    const { size } = state;
    if (top !== size.top || left !== size.left || width !== size.width || height !== size.height) {
      state.setSize(width, height, top, left);
    }
  }, BEFORE_THE_DRAWS);
  return null;
}

const LAYER = '[data-ui="EmitterPreviewLayer"]';

/* Before every view. */
const BEFORE_THE_DRAWS = 0.1;

/**
 * Clears the whole canvas before the views draw.
 *
 * A view clears only its own box, so without it a view that moved or left the screen stays
 * painted where it was, and a frame where no view draws leaves the last one on screen.
 */
function ClearFrame() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.setClearColor(CLEAR, 0);
    gl.clear(true, true, false);
  }, BEFORE_THE_VIEWS_CLEAR);
  return null;
}

const CLEAR = new Color(0, 0, 0);

/* After `FollowPlacement`, and before the views draw at a priority of 1. */
const BEFORE_THE_VIEWS_CLEAR = 0.2;

/* An empty scene, whose depth is what a soft fade in a preview measures its gap to. */
const NOTHING = new Scene();

/**
 * Points the shared frame textures at this canvas's own before any preview draws.
 *
 * `SCENE_DEPTH` and `FRAME` hold the textures of the renderer that drew last, and a texture
 * of the main viewport's context cannot be bound here. A preview has no stage, so the depth
 * it fades against is an empty scene's. It runs between the emitters' writes and the views.
 */
function FramePrep() {
  useFrame((state) => {
    bindFrameTargets(state.gl);
    grabDepth(state.gl, NOTHING, state.camera);
  }, BEFORE_THE_VIEWS);
  return null;
}

/* The scene draws at a priority of 1, and a priority above 0 runs after the emitters. */
const BEFORE_THE_VIEWS = 0.5;

/**
 * Hides a preview's scene for a frame it cannot draw, before the view draws it.
 *
 * A camera of no aspect or a uniform array opening on NaN throws inside three's uniform
 * upload, and R3F's one loop for every canvas then stops the whole frame, the main
 * viewport's included.
 */
export function ViewGuard() {
  useFrame((state) => {
    /* Per frame, since the framing camera's `onUpdate` does not keep the layer it enables. */
    state.camera.layers.enable(PARTICLE_LAYER);
    state.scene.visible = drawable(state.scene, state.camera);
  }, JUST_BEFORE_THE_VIEWS);
  return null;
}

/* After `FramePrep`, and before the scene draws at a priority of 1. */
const JUST_BEFORE_THE_VIEWS = 0.9;

/** Whether `scene` draws through `camera`: a finite projection and no uniform array opening on NaN. */
function drawable(scene: Scene, camera: Camera): boolean {
  if (camera.projectionMatrix.elements.some((value) => !Number.isFinite(value))) return false;

  let clean = true;
  scene.traverse((object) => {
    const uniforms = (object as { material?: { uniforms?: Uniforms } }).material?.uniforms;
    if (!clean || uniforms === undefined) return;

    for (const uniform of uniformList(uniforms)) {
      const value: unknown = uniform.value;
      if (!ArrayBuffer.isView(value) && !Array.isArray(value)) continue;
      const first = (value as ArrayLike<unknown>)[0];
      if (typeof first === "number" && Number.isNaN(first)) clean = false;
    }
  });
  return clean;
}

type Uniforms = Record<string, IUniform>;

/* The uniforms of each material's record, listed once rather than on every frame. */
const UNIFORM_LISTS = new WeakMap<Uniforms, readonly IUniform[]>();

function uniformList(uniforms: Uniforms): readonly IUniform[] {
  let list = UNIFORM_LISTS.get(uniforms);
  if (list === undefined) {
    list = Object.values(uniforms);
    UNIFORM_LISTS.set(uniforms, list);
  }
  return list;
}

/**
 * One emitter drawn as the viewport draws it, alone and under a camera framing its bounds, for
 * a node's preview box, which takes no pointer.
 */
export function EmitterLive({ emitter }: { emitter: EmitterModel }) {
  const { system } = useVfxRun();
  const drawn = useMemo(
    () => (system === null ? [] : drawnFor(system, emitter)),
    [system, emitter],
  );

  return <LiveScene drawn={drawn} />;
}

/** `drawn` under a camera framing their bounds, which then follows their live particles. */
function LiveScene({ drawn }: { drawn: readonly DrawnEmitter[] }) {
  const { system, driver, rig, document } = useVfxRun();
  const backdrop = useBackdropColor();
  const textures = useVfxTextures(drawn, undefined, PREVIEW_MIP_WIDTH);
  const meshes = useVfxMeshes(drawn);
  const framing = useMemo(
    () => (system === null ? null : framingOf(definitionBounds(system, drawn, rig.rig))),
    [system, drawn, rig.rig],
  );

  return (
    <>
      <color attach="background" args={[backdrop]} />
      <ViewGuard />
      {framing !== null && <FramedCamera framing={framing} />}
      {framing !== null && <FollowFraming drawn={drawn} meshes={meshes} framing={framing} />}
      {drawn.length > 0 && (
        <VfxSystem
          drawn={drawn}
          driver={driver}
          textures={textures}
          meshes={meshes}
          document={document}
          drawOnly
        />
      )}
    </>
  );
}

type Triple = [number, number, number];

/** A node preview's camera standing where `framing` puts it, seeing the particles' layer. */
export function FramedCamera({ framing }: { framing: Framing }) {
  return (
    <PerspectiveCamera
      makeDefault
      fov={FOV}
      near={framing.distance / 100}
      far={framing.distance * 100}
      position={framing.position}
      onUpdate={(camera) => {
        camera.layers.enable(PARTICLE_LAYER);
        camera.lookAt(...framing.target);
      }}
    />
  );
}

/** Where the camera stands to hold `bounds` whole, and null for a box with nothing in it. */
export function framingOf(bounds: Bounds): Framing | null {
  const target = [0, 1, 2].map((axis) => (bounds.min[axis]! + bounds.max[axis]!) / 2) as Triple;
  const radius = Math.hypot(...[0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!)) / 2;
  if (!Number.isFinite(radius)) return null;

  const distance = (Math.max(radius, 1) / Math.sin((FOV * Math.PI) / 360)) * MARGIN;
  const position = target.map((value, axis) => value + LOOK[axis]! * distance) as Triple;
  return { position, target, distance };
}

function normalized(vector: Triple): Triple {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as Triple;
}
