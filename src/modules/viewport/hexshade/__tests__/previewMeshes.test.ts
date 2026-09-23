import { IntType, type Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { PREVIEW_BOUNDS, PREVIEW_SHAPES, previewGeometry } from "../previewMeshes";

describe("previewGeometry", () => {
  it.each(PREVIEW_SHAPES)("stands the %s inside the preview bounds", (shape) => {
    const geometry = previewGeometry(shape, false);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;

    expect(box).not.toBeNull();
    expect(box?.min.y).toBeGreaterThanOrEqual(PREVIEW_BOUNDS.min[1] - 1e-6);
    expect(box?.max.y).toBeLessThanOrEqual(PREVIEW_BOUNDS.max[1] + 1e-6);
    expect(Math.abs(box?.min.x ?? Infinity)).toBeLessThanOrEqual(PREVIEW_BOUNDS.max[0] + 1e-6);
  });

  it("names the streams a static program reads, and no joint streams", () => {
    const geometry = previewGeometry("sphere", false);

    expect(geometry.getAttribute("a_POSITION")).toBe(geometry.getAttribute("position"));
    expect(geometry.getAttribute("a_NORMAL")).toBe(geometry.getAttribute("normal"));
    expect(geometry.getAttribute("a_TEXCOORD")).toBe(geometry.getAttribute("uv"));
    expect(geometry.getAttribute("a_COLOR").getX(0)).toBe(1);
    expect(geometry.hasAttribute("a_BLENDINDICES")).toBe(false);
  });

  it("binds a skinned shape wholly to joint 0 through an integer stream", () => {
    const geometry = previewGeometry("sphere", true);
    const joints = geometry.getAttribute("a_BLENDINDICES") as Uint16BufferAttribute;
    const weights = geometry.getAttribute("a_BLENDWEIGHT");

    expect(joints.gpuType).toBe(IntType);
    expect(joints.getX(5)).toBe(0);
    expect([weights.getX(5), weights.getY(5), weights.getZ(5), weights.getW(5)]).toEqual([
      1, 0, 0, 0,
    ]);
  });

  it("keeps the plane's winding and turns its texture against the mirror", () => {
    const geometry = previewGeometry("plane", false);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const first = new Vector3().fromBufferAttribute(position, 0);

    /* PlaneGeometry's first vertex is the top left, at u 0 and v 1 before the flip. */
    expect(first.x).toBeLessThan(0);
    expect(uv.getX(0)).toBe(1);
    expect(uv.getY(0)).toBe(0);
  });
});
