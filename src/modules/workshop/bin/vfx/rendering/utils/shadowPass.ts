import {
  type Camera,
  InstancedMesh,
  Mesh,
  Object3D,
  Scene,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";

import { aimSunShadow, passTwin, sunShadowOf } from "@/modules/viewport";

import { type ShadowCaster, shadowCastersOf } from "../state/shadow";
import { shadowMaterial } from "./materials";
import { isShown } from "./pickRender";

/** The shadow twin of each solid material, disposed with it. */
const SHADOW_MATERIALS = new WeakMap<ShaderMaterial, ShaderMaterial>();

/** The twin that redraws each solid in the shadow pass, kept while the solid lives. */
const TWINS = new WeakMap<Object3D, Mesh>();

/** The scene the twins are drawn in, emptied after each pass. */
const CASTING = new Scene();

/**
 * Draws the shadow casters of `scene` into its sun shadow map, as the client's pass 1.
 *
 * The map is centred on the ground that `eye` looks at. If no caster is drawing, the map is
 * left alone and its receivers read no shadow. The caller updates the scene's matrices first.
 *
 * shortcut: the client draws the characters into the same map first, and this pass draws the
 * particles alone. Upgrade when a character in the preview should cast a shadow.
 */
export function drawShadows(gl: WebGLRenderer, scene: Scene, eye: Camera): void {
  const shadow = sunShadowOf(scene);
  const casters = [...shadowCastersOf(scene)].filter((caster) => isShown(caster.solid.current));
  shadow.uniforms.sunShadowOn.value = casters.length > 0;
  if (casters.length === 0) return;

  aimSunShadow(shadow, eye);
  for (const caster of casters) {
    const twin = twinOf(caster, eye);
    if (twin !== null) CASTING.add(twin);
  }

  const previous = gl.getRenderTarget();
  gl.setRenderTarget(shadow.target);
  gl.clear(false, true, false);
  gl.render(CASTING, shadow.camera);
  gl.setRenderTarget(previous);
  CASTING.clear();
}

/** Returns the twin of `caster`'s solid at its place in this frame, or null for a non-mesh. */
function twinOf(caster: ShadowCaster, eye: Camera): Mesh | null {
  const solid = caster.solid.current;
  if (!(solid instanceof Mesh)) return null;

  const material = shadowMaterialOf(caster.material);
  material.uniforms.eyeView.value.copy(eye.matrixWorldInverse);
  material.uniforms.eyePosition.value.setFromMatrixPosition(eye.matrixWorld);

  let twin = TWINS.get(solid);
  if (twin === undefined || twin.geometry !== solid.geometry) {
    twin = passTwin(solid, 0);
    twin.onBeforeRender = Object3D.prototype.onBeforeRender;
    twin.matrixAutoUpdate = false;
    twin.matrixWorldAutoUpdate = false;
    TWINS.set(solid, twin);
  }

  /* A submesh the emitter's lists leave out keeps its invisible placeholder. */
  twin.material = Array.isArray(solid.material)
    ? solid.material.map((each) => (each.visible ? material : each))
    : material;
  if (twin instanceof InstancedMesh && solid instanceof InstancedMesh) {
    twin.count = solid.count;
    twin.instanceMatrix = solid.instanceMatrix;
  }
  twin.matrixWorld.copy(solid.matrixWorld);
  return twin;
}

function shadowMaterialOf(solid: ShaderMaterial): ShaderMaterial {
  const cached = SHADOW_MATERIALS.get(solid);
  if (cached !== undefined) return cached;

  const made = shadowMaterial(solid);
  solid.addEventListener("dispose", () => made.dispose());
  SHADOW_MATERIALS.set(solid, made);
  return made;
}
