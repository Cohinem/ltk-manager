import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  type Camera,
  DepthTexture,
  FramebufferTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBFormat,
  Scene,
  type ShaderMaterial,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import { type AmbientOcclusion, drawsAmbientOcclusion } from "../utils/ambientOcclusion";
import {
  occlusionBlurMaterial,
  occlusionMaterial,
  writeOcclusion,
  writeOcclusionBlur,
} from "../utils/ambientOcclusionMaterial";
import type { PostEffects } from "../utils/postEffects";
import { postEffectsMaterial, writePostEffects } from "../utils/postEffectsMaterial";

/** The pass draws after the frame's own passes at 1, and under the HUD at 2. */
const AFTER_THE_FRAME = 1.5;

/** The layer the scene's own geometry draws on, which the depth is taken from. */
const SCENE_LAYER = 0;

export interface PostEffectsPassProps {
  readonly effects: PostEffects;
  readonly occlusion: AmbientOcclusion;
}

/**
 * A scene's post effects and ambient occlusion, drawn over the finished frame from a copy
 * of it and its depth.
 *
 * The depth is the scene's own layer drawn again into a target, because the canvas
 * hands back no depth buffer, so a particle neither fogs, focuses nor occludes by its own
 * distance. The occlusion is measured into a target at its buffer scale, then blurred
 * across and down between two. Mounted only while an effect is on, since the second draw
 * of a map is two million vertices a frame.
 */
export function PostEffectsPass({ effects, occlusion }: PostEffectsPassProps) {
  const pass = useMemo(() => {
    const frame = new FramebufferTexture(1, 1);
    frame.minFilter = LinearFilter;
    frame.magFilter = LinearFilter;
    /* The drawing buffer `opaqueRenderer` asks for has no alpha channel, and a copy into
       a texture with one fails with INVALID_OPERATION. */
    frame.format = RGBFormat;
    frame.internalFormat = "RGB8";
    const depth = new DepthTexture(1, 1);
    const target = new WebGLRenderTarget(1, 1, { depthTexture: depth });
    const occluded = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
    const blurred = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
    const material = postEffectsMaterial(frame, depth, occluded.texture);
    const occlusion = occlusionMaterial(depth);
    const blur = occlusionBlurMaterial();
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const scene = new Scene();
    scene.add(quad);
    return {
      frame,
      target,
      occluded,
      blurred,
      material,
      occlusion,
      blur,
      quad,
      scene,
      camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      size: new Vector2(1, 1),
      occlusionSize: new Vector2(1, 1),
    };
  }, []);

  /* Freed rather than dropped, and a remount under strict mode reallocates on the next draw. */
  useEffect(
    () => () => {
      pass.frame.dispose();
      pass.target.dispose();
      pass.occluded.dispose();
      pass.blurred.dispose();
      pass.material.dispose();
      pass.occlusion.dispose();
      pass.blur.dispose();
      pass.quad.geometry.dispose();
    },
    [pass],
  );

  useFrame(({ gl, scene, camera }) => {
    gl.getDrawingBufferSize(pass.size);
    const width = Math.max(1, Math.round(pass.size.x));
    const height = Math.max(1, Math.round(pass.size.y));
    if (pass.frame.image.width !== width || pass.frame.image.height !== height) {
      pass.frame.image.width = width;
      pass.frame.image.height = height;
      pass.frame.dispose();
    }
    if (pass.target.width !== width || pass.target.height !== height) {
      pass.target.setSize(width, height);
    }
    /* The copy binds the texture to unit 0 but skips selecting that unit when the cache
       says it is bound there already, so it would land in whatever unit the last draw left
       active. */
    gl.state.activeTexture(gl.getContext().TEXTURE0);
    gl.copyFramebufferToTexture(pass.frame);

    const layers = camera.layers.mask;
    const background = scene.background;
    scene.background = null;
    camera.layers.set(SCENE_LAYER);
    gl.setRenderTarget(pass.target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    camera.layers.mask = layers;
    scene.background = background;

    if (drawsAmbientOcclusion(occlusion)) drawOcclusion(gl, pass, occlusion, camera);

    writePostEffects(pass.material, effects, occlusion, camera, pass.size);
    gl.autoClear = false;
    drawQuad(gl, pass, pass.material, null);
    gl.autoClear = true;
  }, AFTER_THE_FRAME);

  return null;
}

interface Quad {
  readonly quad: Mesh;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
}

interface OcclusionTargets extends Quad {
  readonly size: Vector2;
  readonly occluded: WebGLRenderTarget;
  readonly blurred: WebGLRenderTarget;
  readonly occlusion: ShaderMaterial;
  readonly blur: ShaderMaterial;
  readonly occlusionSize: Vector2;
}

/** Measure `occlusion` into `occluded` at its buffer scale, then blur it across and back. */
function drawOcclusion(
  gl: WebGLRenderer,
  pass: OcclusionTargets,
  occlusion: AmbientOcclusion,
  camera: Camera,
): void {
  const scale = Math.min(occlusion.bufferScale, 1);
  const size = pass.occlusionSize.set(
    Math.max(1, Math.round(pass.size.x * scale)),
    Math.max(1, Math.round(pass.size.y * scale)),
  );
  if (pass.occluded.width !== size.x || pass.occluded.height !== size.y) {
    pass.occluded.setSize(size.x, size.y);
    pass.blurred.setSize(size.x, size.y);
  }
  writeOcclusion(pass.occlusion, occlusion, camera);
  drawQuad(gl, pass, pass.occlusion, pass.occluded);
  writeOcclusionBlur(pass.blur, pass.occluded.texture, size, "x", occlusion.edgeAwareBlur);
  drawQuad(gl, pass, pass.blur, pass.blurred);
  writeOcclusionBlur(pass.blur, pass.blurred.texture, size, "y", occlusion.edgeAwareBlur);
  drawQuad(gl, pass, pass.blur, pass.occluded);
}

function drawQuad(
  gl: WebGLRenderer,
  { quad, scene, camera }: Quad,
  material: ShaderMaterial,
  target: WebGLRenderTarget | null,
): void {
  quad.material = material;
  gl.setRenderTarget(target);
  gl.render(scene, camera);
  gl.setRenderTarget(null);
}
