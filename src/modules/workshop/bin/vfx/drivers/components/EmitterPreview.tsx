import { PerspectiveCamera, View } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useState } from "react";
import { type Camera, type IUniform, Scene } from "three";

import { type Bounds, OUTPUT_COLOR_SPACE, TONE_MAPPING, useSceneColors } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { useVfxRun } from "../../playback/state/run";
import { VfxSystem } from "../../rendering/components/VfxSystem";
import { useVfxMeshes } from "../../rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { drawnEmitters } from "../../rendering/utils/definitions";
import { bindFrameTargets, grabDepth, PARTICLE_LAYER } from "../../rendering/utils/frame";
import { definitionBounds } from "../../rendering/utils/systemBounds";
import { EMITTER_PREVIEW_SIZE } from "../utils/driverLayout";
import { type Framing, PreviewOrbit } from "./PreviewOrbit";

/** The texture width a node's preview asks for, which the object grid's previews use too. */
const PREVIEW_MIP_WIDTH = 128;

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
 * The one canvas every emitter node's preview draws into, over the Graph pane's nodes.
 *
 * Each preview is a drei `View`, which the canvas draws scissored to the preview's box, so
 * one WebGL context serves every node. The run's driver is shared, so every preview plays
 * the same simulation at the same playhead. Pointer events pass through to the nodes.
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
        <FollowPlacement />
        <FramePrep />
        <View.Port />
      </Canvas>
    </div>
  );
}

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
 * Keeps the canvas's place on the page current, which each view is placed against.
 *
 * R3F measures it only when the canvas resizes or the page scrolls, so a pane moved beside
 * another without resizing would draw every preview where the canvas used to stand.
 */
function FollowPlacement() {
  useFrame((state) => {
    const { top, left } = state.gl.domElement.getBoundingClientRect();
    const { size } = state;
    if (top !== size.top || left !== size.left) {
      state.setSize(size.width, size.height, top, left);
    }
  }, BEFORE_THE_PREP);
  return null;
}

/* Before `FramePrep`, and so before every view. */
const BEFORE_THE_PREP = 0.1;

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

/* drei's views draw at a priority of 1, and a priority above 0 runs after the emitters. */
const BEFORE_THE_VIEWS = 0.5;

/**
 * Hides a preview's scene for a frame it cannot draw, before the view draws it.
 *
 * A camera of no aspect or a uniform array opening on NaN throws inside three's uniform
 * upload, and R3F's one loop for every canvas then stops the whole frame, the main
 * viewport's included.
 */
function ViewGuard() {
  useFrame((state) => {
    /* Per frame, since the framing camera's `onUpdate` does not keep the layer it enables. */
    state.camera.layers.enable(PARTICLE_LAYER);
    state.scene.visible = drawable(state.scene, state.camera);
  }, JUST_BEFORE_THE_VIEWS);
  return null;
}

/* After `FramePrep`, and before drei's views at a priority of 1. */
const JUST_BEFORE_THE_VIEWS = 0.9;

/** Whether `scene` draws through `camera`: a finite projection and no uniform array opening on NaN. */
function drawable(scene: Scene, camera: Camera): boolean {
  if (camera.projectionMatrix.elements.some((value) => !Number.isFinite(value))) return false;

  let clean = true;
  scene.traverse((object) => {
    if (!clean) return;
    const material = (object as { material?: { uniforms?: Record<string, IUniform> } }).material;
    for (const uniform of Object.values(material?.uniforms ?? {})) {
      const value: unknown = uniform.value;
      if (!ArrayBuffer.isView(value) && !Array.isArray(value)) continue;
      const first = (value as ArrayLike<unknown>)[0];
      if (typeof first === "number" && Number.isNaN(first)) clean = false;
    }
  });
  return clean;
}

/**
 * One emitter's preview as a mini viewport of its own, for a host that draws no preview layer.
 *
 * A drag orbits the emitter, the wheel zooms toward the cursor, and a double click frames it
 * again. A second `View.Port` would draw every node's view as well, since drei's views share
 * one tunnel, so this canvas draws the scene itself.
 */
export function EmitterPreviewCanvas({
  simple,
  listIndex,
  className,
}: {
  simple: boolean;
  listIndex: number;
  className?: string;
}) {
  const [box, sized] = useHasSize();

  return (
    <div
      ref={box}
      data-ui="EmitterPreviewCanvas"
      /* DS-GROUND, DS-RADIUS */
      className={twMerge(
        "overflow-hidden rounded-md border border-surface-veil bg-surface-950",
        className,
      )}
    >
      <Canvas
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
        frameloop={sized ? "always" : "never"}
        onCreated={({ gl }) => {
          gl.outputColorSpace = OUTPUT_COLOR_SPACE;
          gl.toneMapping = TONE_MAPPING;
        }}
      >
        <FramePrep />
        <EmitterScene simple={simple} listIndex={listIndex} orbit />
        <DrawScene />
      </Canvas>
    </div>
  );
}

/**
 * Draws the canvas's own scene, which R3F stops doing once any frame callback runs above 0.
 *
 * At the priority drei's views draw at, after `ViewGuard` has said whether it can.
 */
function DrawScene() {
  useFrame((state) => {
    if (state.scene.visible) state.gl.render(state.scene, state.camera);
  }, 1);
  return null;
}

/** A preview of one emitter and the children it spawns, drawn by `EmitterPreviewLayer`. */
export function EmitterPreview({ simple, listIndex }: { simple: boolean; listIndex: number }) {
  return (
    <View
      /* DS-GROUND, DS-RADIUS */
      className="my-1 shrink-0 self-center rounded-md border border-surface-veil bg-surface-950"
      style={{ width: EMITTER_PREVIEW_SIZE, height: EMITTER_PREVIEW_SIZE }}
    >
      <EmitterScene simple={simple} listIndex={listIndex} orbit={false} />
    </View>
  );
}

/** The emitter's scene, and `orbit` for a camera the reader turns rather than a fixed one. */
function EmitterScene({
  simple,
  listIndex,
  orbit,
}: {
  simple: boolean;
  listIndex: number;
  orbit: boolean;
}) {
  const { system, driver, rig, document } = useVfxRun();
  const colors = useSceneColors();
  const drawn = useMemo(() => {
    const own = system?.emitters.find(
      (each) => each.simple === simple && each.listIndex === listIndex,
    );
    if (system === null || own === undefined) return [];
    return drawnEmitters(system).filter((each) => each.root === own.index);
  }, [system, simple, listIndex]);
  const textures = useVfxTextures(drawn, undefined, PREVIEW_MIP_WIDTH);
  const meshes = useVfxMeshes(drawn);
  const framing = useMemo(
    () => (system === null ? null : framingOf(definitionBounds(system, drawn, rig.rig))),
    [system, drawn, rig.rig],
  );

  return (
    <>
      <color attach="background" args={[colors.backdrop]} />
      <ViewGuard />
      {framing !== null && (
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
      )}
      {orbit && framing !== null && <PreviewOrbit framing={framing} />}
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

/** Where the camera stands to hold `bounds` whole, and null for a box with nothing in it. */
function framingOf(bounds: Bounds): Framing | null {
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
