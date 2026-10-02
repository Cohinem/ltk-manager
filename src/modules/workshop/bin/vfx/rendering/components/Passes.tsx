import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Camera, Scene, WebGLRenderer } from "three";

import {
  bindFrameTargets,
  DISTORTION_LAYER,
  drawGlow,
  glowing,
  grabDepth,
  grabFrame,
  PARTICLE_LAYER,
  releaseFrame,
  SCENE_LAYER,
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
    camera.layers.enable(PARTICLE_LAYER);
  }, [camera]);
  /* The grabs keep viewport-sized textures per renderer, so a closed viewport frees them. */
  useEffect(() => () => releaseFrame(gl), [gl]);

  return <FramePasses warps={warps} softens={softens} />;
}

/** The colour pass's layers: the scene and every particle drawing colour. */
function seeColour(camera: Camera): void {
  camera.layers.set(SCENE_LAYER);
  camera.layers.enable(PARTICLE_LAYER);
}

/**
 * The frame drawn in up to four passes, which takes the render loop off ThreeJS.
 *
 * The depth of the scene alone goes first for a soft fade or a glow, and the distorting
 * layer over a copy of the frame. The glow layer draws last over that depth, and its blur
 * adds to the frame. Decisions 2.43 and 2.25 of docs/plans/vfx-particle-renderer.md.
 */
function FramePasses({ warps, softens }: PassesProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useFrame((state) => {
    const camera = state.camera;
    const glows = glowing(scene);
    bindFrameTargets(gl);
    if (softens || glows) grabDepth(gl, scene, camera);
    seeColour(camera);
    gl.render(scene, camera);
    if (warps) drawWarp(gl, scene, camera);
    if (glows) drawGlow(gl, scene, camera);
    seeColour(camera);
  }, AFTER_THE_EMITTERS);

  return null;
}

/**
 * The distorting layer drawn over a copy of the frame.
 *
 * The warp draws over the frame rather than in place of it, so neither the colour nor the
 * depth the first pass left is cleared, and the background is what would clear them.
 */
function drawWarp(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
  grabFrame(gl);

  const background = scene.background;
  scene.background = null;
  gl.autoClear = false;
  camera.layers.set(DISTORTION_LAYER);
  gl.render(scene, camera);
  gl.autoClear = true;
  scene.background = background;
}
