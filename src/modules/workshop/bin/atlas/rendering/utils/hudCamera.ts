import { OrthographicCamera } from "three";

import { seeParticles } from "../../../vfx/rendering/utils/frame";
import type { Screen } from "../../engine/layout/solve";
import { type HudLayer, hudPixelsPerUnit } from "../../engine/particles/hudLayer";

/** The client's HUD projection's depth range, in layer units either side of the origin. */
const DEPTH = 1000;

/**
 * The HUD layer's projection for a system drawn at `origin`, in screen pixels, per section 3.8
 * of docs/plans/atlas-renderer.md: an orthographic view of the whole screen in layer units, so a
 * unit covers `screenH * scale / layerH` pixels and the system's origin lands on `origin`.
 *
 * It writes `camera` in place, and sees the layer the particle renderer puts its draws on.
 */
export function hudCamera(
  layer: HudLayer,
  screen: Screen,
  origin: readonly [number, number],
  scale: number,
  camera: OrthographicCamera = new OrthographicCamera(),
): OrthographicCamera {
  const perUnit = hudPixelsPerUnit(layer, screen.height, scale);
  const [x, y] = origin;

  camera.left = -x / perUnit;
  camera.right = (screen.width - x) / perUnit;
  camera.top = y / perUnit;
  camera.bottom = -(screen.height - y) / perUnit;
  camera.near = -DEPTH;
  camera.far = DEPTH;
  camera.position.set(0, 0, 0);
  seeParticles(camera);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
