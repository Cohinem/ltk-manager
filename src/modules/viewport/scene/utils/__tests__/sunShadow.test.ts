import { PerspectiveCamera, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { DEFAULT_SUN } from "../sunLight";
import { aimSunShadow, lightSunShadow, SUN_SHADOW_SIZE, sunShadowOf } from "../sunShadow";

const TEXEL = 1 / SUN_SHADOW_SIZE;

function eyeAt(position: Vector3, target: Vector3): PerspectiveCamera {
  const eye = new PerspectiveCamera(45, 1, 1, 10_000);
  eye.position.copy(position);
  eye.lookAt(target);
  return eye;
}

function onMap(scene: Scene, world: Vector3): Vector3 {
  return world.clone().applyMatrix4(sunShadowOf(scene).uniforms.sunShadowMatrix.value);
}

describe("aimSunShadow", () => {
  it("centres the map on the ground point that the eye looks at", () => {
    const scene = new Scene();
    const shadow = sunShadowOf(scene);
    lightSunShadow(shadow, DEFAULT_SUN);

    const target = new Vector3(400, 0, -250);
    aimSunShadow(shadow, eyeAt(new Vector3(400, 1500, 900), target));
    const centre = onMap(scene, target);

    expect(Math.abs(centre.x - 0.5)).toBeLessThanOrEqual(TEXEL);
    expect(Math.abs(centre.y - 0.5)).toBeLessThanOrEqual(TEXEL);
    expect(centre.z).toBeGreaterThan(0);
    expect(centre.z).toBeLessThan(1);
  });

  it("places a point nearer the sun at a smaller depth", () => {
    const scene = new Scene();
    const shadow = sunShadowOf(scene);
    lightSunShadow(shadow, DEFAULT_SUN);
    aimSunShadow(shadow, eyeAt(new Vector3(0, 1500, 900), new Vector3()));

    const ground = onMap(scene, new Vector3());
    const raised = onMap(scene, shadow.toSun.clone().multiplyScalar(100));

    expect(raised.z).toBeLessThan(ground.z);
    expect(raised.x).toBeCloseTo(ground.x, 6);
  });

  it("moves the map by whole texels when the eye moves", () => {
    const scene = new Scene();
    const shadow = sunShadowOf(scene);
    lightSunShadow(shadow, DEFAULT_SUN);
    const point = new Vector3(37, 0, 11);

    aimSunShadow(shadow, eyeAt(new Vector3(0, 1500, 900), new Vector3()));
    const before = onMap(scene, point);
    aimSunShadow(shadow, eyeAt(new Vector3(3.3, 1500, 900), new Vector3(3.3, 0, 0)));
    const after = onMap(scene, point);

    const shift = (after.x - before.x) / TEXEL;
    expect(shift).toBeCloseTo(Math.round(shift), 3);
  });
});

describe("lightSunShadow", () => {
  it("keeps the sky's share of a receiver's colour in shadow", () => {
    const shadow = sunShadowOf(new Scene());
    lightSunShadow(shadow, { ...DEFAULT_SUN, sky: [1, 0.5, 0], ambient: 0.6 });

    const { r, g, b } = shadow.uniforms.sunShadowColor.value;
    expect([r, g, b].map((each) => Number(each.toFixed(6)))).toEqual([0.6, 0.3, 0]);
  });
});
