import {
  type Camera,
  Color,
  InstancedMesh,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  type ShaderMaterial,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import { passTwin } from "@/modules/viewport";

import type { PickEntry } from "../state/pick";
import { pickMaterial } from "./materials";
import { MOST_PICK_ID, nearestPick, pickColor } from "./pickId";

/** The side of the square drawn around the pointer, in CSS pixels. A thin trail picks within it. */
export const PICK_SIZE = 5;

/** Where a pick reads: the pointer inside the canvas, and the canvas's size, in CSS pixels. */
export interface PickSpot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Draws a view's pick targets as ids around the pointer, and reads back the nearest. */
export interface Picker {
  /** The entry drawn nearest `spot` as the last frame left it, or null where none is. */
  readonly pick: (
    gl: WebGLRenderer,
    camera: Camera,
    entries: readonly PickEntry[],
    spot: PickSpot,
  ) => PickEntry | null;
  readonly dispose: () => void;
}

/** The id twin of each solid material, disposed with it. */
const PICKS = new WeakMap<ShaderMaterial, ShaderMaterial>();

/**
 * A picker with a dedicated small render target, drawn into only on a pick.
 *
 * Each drawn target is redrawn by a twin over the solid's geometry and instance buffers, under
 * `pickMaterial`, into a `PICK_SIZE` square the camera's view offset narrows to the pointer.
 */
export function createPicker(): Picker {
  const target = new WebGLRenderTarget(PICK_SIZE, PICK_SIZE);
  const scene = new Scene();
  const pixels = new Uint8Array(PICK_SIZE * PICK_SIZE * 4);
  const clearColor = new Color();

  const pick: Picker["pick"] = (gl, camera, entries, spot) => {
    const lens = lensAt(camera, spot);
    const drawn = entries.filter(isDrawing).slice(0, MOST_PICK_ID);
    if (lens === null || drawn.length === 0) return null;

    drawn.forEach((entry, at) => {
      const twin = pickTwin(entry, at + 1);
      if (twin !== null) scene.add(twin);
    });

    const previous = gl.getRenderTarget();
    gl.getClearColor(clearColor);
    const clearAlpha = gl.getClearAlpha();

    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, lens);
    gl.readRenderTargetPixels(target, 0, 0, PICK_SIZE, PICK_SIZE, pixels);

    gl.setRenderTarget(previous);
    gl.setClearColor(clearColor, clearAlpha);
    scene.clear();

    const id = nearestPick(pixels, PICK_SIZE);
    return id === 0 ? null : (drawn[id - 1] ?? null);
  };

  return { pick, dispose: () => target.dispose() };
}

/** A copy of `camera` seeing the `PICK_SIZE` square about the pointer, or null for another lens. */
function lensAt(camera: Camera, spot: PickSpot): Camera | null {
  if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) return null;

  /* The copy has no parent. It keeps the camera's world matrix rather than one rebuilt from
     its local transform. */
  const lens = camera.clone();
  lens.matrixWorldAutoUpdate = false;
  lens.layers.enableAll();
  const half = PICK_SIZE / 2;
  lens.setViewOffset(spot.width, spot.height, spot.x - half, spot.y - half, PICK_SIZE, PICK_SIZE);
  return lens;
}

/** Whether the target drew this frame. A hidden, culled or empty emitter draws nothing. */
function isDrawing(entry: PickEntry): boolean {
  return shown(entry.solid.current) || shown(entry.twin.current);
}

function shown(object: Object3D | null): boolean {
  for (let at = object; at !== null; at = at.parent) {
    if (!at.visible) return false;
  }
  return object !== null;
}

/** A twin of the entry's solid drawing `id`, at its place in the last frame. */
function pickTwin(entry: PickEntry, id: number): Mesh | null {
  const solid = entry.solid.current;
  if (!(solid instanceof Mesh)) return null;

  const material = pickMaterialOf(entry.material);
  material.uniforms.pickId.value.set(...pickColor(id), 1);

  const twin = passTwin(solid, 0);
  twin.onBeforeRender = Object3D.prototype.onBeforeRender;
  /* A submesh the emitter's lists leave out keeps its invisible placeholder. */
  twin.material = Array.isArray(solid.material)
    ? solid.material.map((each) => (each.visible ? material : each))
    : material;
  if (twin instanceof InstancedMesh && solid instanceof InstancedMesh) twin.count = solid.count;

  twin.matrixAutoUpdate = false;
  twin.matrixWorldAutoUpdate = false;
  twin.matrixWorld.copy(solid.matrixWorld);
  return twin;
}

function pickMaterialOf(solid: ShaderMaterial): ShaderMaterial {
  const cached = PICKS.get(solid);
  if (cached !== undefined) return cached;

  const made = pickMaterial(solid);
  solid.addEventListener("dispose", () => made.dispose());
  PICKS.set(solid, made);
  return made;
}
