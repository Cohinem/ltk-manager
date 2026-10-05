import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Camera, Scene, WebGLRenderer } from "three";

import {
  bindFrameTargets,
  DISTORTION_LAYER,
  drawGlow,
  EARLY_DISTORTION_LAYER,
  glowing,
  grabDepth,
  grabFrame,
  PARTICLE_LAYER,
  releaseFrame,
  SCENE_LAYER,
  seeParticles,
  UNDER_LAYER,
  warpsOf,
} from "../utils/frame";

/** The pass runs once every emitter has written the frame's buffers. */
const AFTER_THE_EMITTERS = 1;

export interface PassesProps {
  /** An emitter warps the frame, which a pass after the colour draws over it. */
  readonly warps: boolean;
  /** An emitter fades against the scene's depth, which a pass before the colour takes. */
  readonly softens: boolean;
}

/**
 * The passes a particle scene draws in, around the colour pass everything takes.
 *
 * Every particle drawing colour sits on a layer of its own, which the camera always sees.
 * The loop is owned here even for a scene needing neither extra pass, because a HUD over
 * the frame draws at a priority of its own and the fibre then draws nothing on its own.
 */
export function Passes({ warps, softens }: PassesProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    seeParticles(camera);
  }, [camera]);
  /* The grabs keep viewport-sized textures per renderer, so a closed viewport frees them. */
  useEffect(() => () => releaseFrame(gl), [gl]);

  return <FramePasses warps={warps} softens={softens} />;
}

/** The first colour pass's layers: the scene, and the particles of each phase in `layers`. */
function seeColour(camera: Camera, layers: readonly number[]): void {
  camera.layers.set(SCENE_LAYER);
  for (const layer of layers) camera.layers.enable(layer);
}

const BOTH_PHASES = [UNDER_LAYER, PARTICLE_LAYER] as const;
const UNDER_PHASE = [UNDER_LAYER] as const;
const OVER_PHASE = [PARTICLE_LAYER] as const;

/**
 * The frame drawn in the engine's phase order, which takes the render loop off ThreeJS.
 *
 * The depth of the scene alone goes first for a soft fade or a glow. An emitter of the
 * no-character distortion phase warps the scene before any particle draws. The default and
 * ground-layer phases draw next, then the late distortion over a copy of that frame, then
 * the post-distortion phase over it. A scene with no late distortion draws both colour
 * phases in one pass. The glow layer draws last over that depth, and its blur adds to the
 * frame. Decisions 2.43 and 2.25 of docs/plans/vfx-particle-renderer.md.
 */
function FramePasses({ warps, softens }: PassesProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useFrame((state) => {
    const camera = state.camera;
    const glows = glowing(scene);
    const held = warpsOf(scene);
    const late = warps && held.late;
    const first = late ? UNDER_PHASE : BOTH_PHASES;

    bindFrameTargets(gl);
    if (softens || glows) grabDepth(gl, scene, camera);
    if (warps && held.early) {
      camera.layers.set(SCENE_LAYER);
      gl.render(scene, camera);
      drawWarp(gl, scene, camera, EARLY_DISTORTION_LAYER);
      drawOver(gl, scene, camera, first);
    } else {
      seeColour(camera, first);
      gl.render(scene, camera);
    }
    if (late) {
      drawWarp(gl, scene, camera, DISTORTION_LAYER);
      drawOver(gl, scene, camera, OVER_PHASE);
    }
    if (glows) drawGlow(gl, scene, camera);
    seeColour(camera, BOTH_PHASES);
  }, AFTER_THE_EMITTERS);

  return null;
}

/** The distorting `layer` drawn over a copy of the frame. */
function drawWarp(gl: WebGLRenderer, scene: Scene, camera: Camera, layer: number): void {
  grabFrame(gl);
  drawOver(gl, scene, camera, [layer]);
}

/**
 * `layers` drawn over the frame rather than in place of it, so neither the colour nor the
 * depth an earlier pass left is cleared, and the background is what would clear them.
 */
function drawOver(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  layers: readonly number[],
): void {
  const background = scene.background;
  scene.background = null;
  gl.autoClear = false;
  camera.layers.disableAll();
  for (const layer of layers) camera.layers.enable(layer);
  gl.render(scene, camera);
  gl.autoClear = true;
  scene.background = background;
}
