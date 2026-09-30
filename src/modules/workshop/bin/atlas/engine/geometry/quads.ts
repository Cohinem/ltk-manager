import type { PixelRect, Screen } from "../layout/solve";
import type { ViewSlice } from "../model/view";

/** `u0, v0, u1, v1`, normalized to a texture, v down. */
export type Uv = readonly [number, number, number, number];

/** `r, g, b, a` in bytes. */
export type Rgba = readonly [number, number, number, number];

/**
 * Vertices in the client's UI format, per section 2.1 of docs/plans/atlas-renderer.md: a
 * position in 0 to 1 of the screen, the colour as the bytes of `0xAARRGGBB`, and a texture
 * coordinate whose `zw` is the vertex's place in the element rect.
 */
export interface Geometry {
  readonly positions: number[];
  readonly colors: number[];
  readonly texcoords: number[];
  readonly indices: number[];
}

export function emptyGeometry(): Geometry {
  return { positions: [], colors: [], texcoords: [], indices: [] };
}

/**
 * One quad of `rect` sampling `uv`, its vertices top left, top right, bottom left, bottom right
 * and its indices `b, b+2, b+1, b+1, b+2, b+3` as the client writes them.
 */
export function addQuad(
  geometry: Geometry,
  rect: PixelRect,
  uv: Uv,
  color: Rgba,
  screen: Screen,
  reference: PixelRect = rect,
): void {
  const base = geometry.positions.length / 2;
  const [u0, v0, u1, v1] = uv;
  const corners = [
    [rect.x, rect.y, u0, v0],
    [rect.x + rect.w, rect.y, u1, v0],
    [rect.x, rect.y + rect.h, u0, v1],
    [rect.x + rect.w, rect.y + rect.h, u1, v1],
  ] as const;

  for (const [x, y, u, v] of corners) {
    geometry.positions.push(x / screen.width, y / screen.height);
    geometry.colors.push(color[2], color[1], color[0], color[3]);
    geometry.texcoords.push(
      u,
      v,
      reference.w === 0 ? 0 : (x - reference.x) / reference.w,
      reference.h === 0 ? 0 : (y - reference.y) / reference.h,
    );
  }
  geometry.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

/**
 * A 3-slice or 9-slice sprite over `rect`, row by row, each quad keeping the whole rect as its
 * reference. `size` is the texture in pixels, which a slice without its own column and row
 * edges needs to place them. `scale` takes an edge from source pixels to screen pixels.
 */
export function addSlice(
  geometry: Geometry,
  rect: PixelRect,
  uv: Uv,
  slice: ViewSlice,
  flip: readonly [boolean, boolean],
  color: Rgba,
  screen: Screen,
  size: readonly [number, number] | null,
  scale: number,
): boolean {
  const columns = sliceEdges(slice, 0, uv, size);
  const rows = sliceEdges(slice, 1, uv, size);
  if (columns === null || rows === null) return false;

  const [left, right, top, bottom] = fitted(
    slice.edges.map((edge) => edge * scale) as [number, number, number, number],
    rect,
  );
  const xs =
    columns.length === 4
      ? [rect.x, rect.x + left, rect.x + rect.w - right, rect.x + rect.w]
      : [rect.x, rect.x + rect.w];
  const ys =
    rows.length === 4
      ? [rect.y, rect.y + top, rect.y + rect.h - bottom, rect.y + rect.h]
      : [rect.y, rect.y + rect.h];
  const us = flip[0] ? [...columns].reverse() : columns;
  const vs = flip[1] ? [...rows].reverse() : rows;

  for (let row = 0; row + 1 < ys.length; row += 1) {
    for (let column = 0; column + 1 < xs.length; column += 1) {
      const x0 = xs[column] ?? 0;
      const y0 = ys[row] ?? 0;
      const cell = { x: x0, y: y0, w: (xs[column + 1] ?? 0) - x0, h: (ys[row + 1] ?? 0) - y0 };
      const cellUv: Uv = [us[column] ?? 0, vs[row] ?? 0, us[column + 1] ?? 0, vs[row + 1] ?? 0];
      addQuad(geometry, cell, cellUv, color, screen, rect);
    }
  }
  return true;
}

/** The drawn edges, left, right, top and bottom, shrunk to share an axis they overfill. */
function fitted(
  [left, right, top, bottom]: readonly [number, number, number, number],
  rect: PixelRect,
): [number, number, number, number] {
  const across = left + right > rect.w && left + right > 0 ? rect.w / (left + right) : 1;
  const down = top + bottom > rect.h && top + bottom > 0 ? rect.h / (top + bottom) : 1;
  return [left * across, right * across, top * down, bottom * down];
}

/**
 * The texture edges of one axis: four where the slice cuts it, two where it does not. A
 * manifest slice names no edges and places them from `uv` and the texture's size.
 */
function sliceEdges(
  slice: ViewSlice,
  axis: 0 | 1,
  uv: Uv,
  size: readonly [number, number] | null,
): readonly number[] | null {
  const cuts =
    slice.kind === "nine" ||
    (axis === 0 && slice.kind === "horizontal") ||
    (axis === 1 && slice.kind === "vertical");
  const [start, end] = axis === 0 ? [uv[0], uv[2]] : [uv[1], uv[3]];
  const given = axis === 0 ? slice.us : slice.vs;
  if (given !== null && given.length === (cuts ? 4 : 2)) return given;
  if (!cuts) return [start, end];
  if (size === null) return null;

  const extent = size[axis];
  const [near, far] =
    axis === 0 ? [slice.edges[0], slice.edges[1]] : [slice.edges[2], slice.edges[3]];
  return [start, start + near / extent, end - far / extent, end];
}

/** `uv` flipped per axis, as `FlipX` and `FlipY` flip the sprite. */
export function flipped(uv: Uv, flip: readonly [boolean, boolean]): Uv {
  const [u0, v0, u1, v1] = uv;
  return [flip[0] ? u1 : u0, flip[1] ? v1 : v0, flip[0] ? u0 : u1, flip[1] ? v0 : v1];
}

/** `uv` cropped to the aspect of `rect`, centred, as `FillType` 1 covers an element. */
export function covered(uv: Uv, rect: PixelRect, size: readonly [number, number] | null): Uv {
  if (size === null || rect.w <= 0 || rect.h <= 0) return uv;

  const [u0, v0, u1, v1] = uv;
  const spriteAspect = ((u1 - u0) * size[0]) / ((v1 - v0) * size[1]);
  const rectAspect = rect.w / rect.h;
  if (spriteAspect > rectAspect) {
    const keep = rectAspect / spriteAspect;
    const cut = ((u1 - u0) * (1 - keep)) / 2;
    return [u0 + cut, v0, u1 - cut, v1];
  }

  const keep = spriteAspect / rectAspect;
  const cut = ((v1 - v0) * (1 - keep)) / 2;
  return [u0, v0 + cut, u1, v1 - cut];
}
