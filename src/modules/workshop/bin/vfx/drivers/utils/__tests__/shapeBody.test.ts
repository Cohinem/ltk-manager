import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { Point } from "../../../engine/model/rig";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { NO_TRANSFORM } from "../../../engine/simulation/integrate";
import { birth, sampleShape } from "../../../engine/simulation/spawnShape";
import { identityInto } from "../../../engine/utils/basis";
import { Rng } from "../../../engine/utils/Rng";
import {
  placeInto,
  SEGMENTS,
  spawnFrameInto,
  spawnOriginInto,
  surfaceBoxFaces,
  wireframeInto,
} from "../../../rendering/utils/emitterShape";
import { bodyMatrixInto, shapeBody } from "../shapeBody";
import { spawnCloud } from "../spawnCloud";

const IDENTITY = identityInto(new Float32Array(9));

function key(time: number, value: number) {
  return { time, values: [value] };
}

/** The distinct corners among `points`, rounded so a float's noise does not split one. */
function corners(points: Vector3[]): string[] {
  return [
    ...new Set(
      points.map((point) =>
        point
          .toArray()
          .map((value) => value.toFixed(2))
          .join(","),
      ),
    ),
  ].sort();
}

describe("shapeBody", () => {
  it("stands a turned box where the viewport's gizmo draws it", () => {
    const emitter = emitterOf(0, {
      shape: { kind: "box", size: [10, 20, 30], volume: true },
      rotationOverride: [30, 45, 10],
      translationOverride: [4, 5, 6],
    });
    const origin: Point = [100, 0, -50];
    const frame = new Float32Array(9);
    spawnFrameInto(emitter, IDENTITY, IDENTITY, frame);

    /* The frame's origin is the system's under `translationOverride`, and `EmitterPosition`
       stands inside the frame, which is how the gizmo and the overlay both place a shape. */
    const stood = new Float32Array(3);
    spawnOriginInto(emitter, NO_TRANSFORM, IDENTITY, origin, stood);
    const anchor: Point = [stood[0], stood[1], stood[2]];
    const stands: Point = [7, -8, 9];

    const positions = new Float32Array(SEGMENTS * 6);
    const vertices = wireframeInto(emitter, Float32Array.from(stands), 0, positions);
    for (let at = 0; at < vertices; at += 1) placeInto(positions, at * 3, frame, anchor);
    const gizmo = [];
    for (let at = vertices - 24; at < vertices; at += 1) {
      gizmo.push(new Vector3(positions[at * 3], positions[at * 3 + 1], positions[at * 3 + 2]));
    }

    const body = shapeBody(emitter.shape, spawnCloud(emitter))!;
    const matrix = bodyMatrixInto(frame, anchor, stands, new Matrix4());
    const edges = body.edges.getAttribute("position");
    const drawn = Array.from({ length: edges.count }, (_, at) =>
      new Vector3().fromBufferAttribute(edges, at).applyMatrix4(matrix),
    );

    expect(anchor).toEqual([104, 5, -44]);
    expect(corners(drawn)).toEqual(corners(gizmo));
  });

  it("sweeps a legacy offset through its emit rotations onto a sphere", () => {
    const full = { channel: 0, single: 0, keys: [key(0, 0), key(1, 360)] };
    const emitter = emitterOf(0, {
      shape: {
        kind: "legacy",
        offset: {
          constant: [1, 0, 0],
          keys: [],
          tables: [{ channel: 0, single: 0, keys: [key(0, 20), key(1, 100)] }],
        },
        translation: { constant: [0, 0, 0], keys: [], tables: [] },
        angles: [
          { constant: [1], keys: [], tables: [full] },
          { constant: [1], keys: [], tables: [full] },
        ],
        axes: [
          [0, 1, 0],
          [0, 0, 1],
        ],
      },
    });

    const body = shapeBody(emitter.shape, spawnCloud(emitter))!;
    const edges = body.edges.getAttribute("position");
    const lengths = Array.from({ length: edges.count }, (_, at) =>
      new Vector3().fromBufferAttribute(edges, at).length(),
    );
    body.edges.computeBoundingBox();
    const { min, max } = body.edges.boundingBox!;

    expect(Math.max(...lengths)).toBeLessThan(100.5);
    expect(min.toArray().every((value) => value < -95)).toBe(true);
    expect(max.toArray().every((value) => value > 95)).toBe(true);
    expect(body.turns?.getAttribute("position").count).toBe(4);
    expect(body.sweep?.getAttribute("position").count).toBeGreaterThan(edges.count);
  });

  it("draws a surface box on the rectangles sampleShape spawns on", () => {
    const shape = { kind: "box", size: [10, 20, 30], volume: false } as const;
    const faces = surfaceBoxFaces(shape.size);
    const rng = new Rng(1);
    const placed = birth();
    const hit = new Set<number>();
    for (let at = 0; at < 2000; at += 1) {
      sampleShape(shape, rng, 0.5, null, placed);
      const on = faces.findIndex((corners) =>
        [0, 1, 2].every((axis) => {
          const values = corners.map((corner) => corner[axis]!);
          const value = placed.offset[axis]!;
          return value >= Math.min(...values) - 1e-3 && value <= Math.max(...values) + 1e-3;
        }),
      );
      expect(on).toBeGreaterThanOrEqual(0);
      hit.add(on);
    }

    const body = shapeBody(shape, spawnCloud(emitterOf(0, { shape })))!;
    expect(hit.size).toBe(faces.length);
    expect(body.faces!.getAttribute("position").count).toBe(faces.length * 6);
  });

  it("leaves the caps off a surface cylinder", () => {
    const shape = { kind: "cylinder", radius: 10, height: 5, volume: false } as const;
    const surface = shapeBody(shape, spawnCloud(emitterOf(0, { shape })))!;
    const filled = shapeBody({ ...shape, volume: true }, spawnCloud(emitterOf(0, { shape })))!;

    expect(surface.faces!.getAttribute("position").count).toBeLessThan(
      filled.faces!.getAttribute("position").count,
    );
  });

  it("sweeps a legacy offset box through its emit rotation into a band", () => {
    const emitter = emitterOf(0, {
      shape: {
        kind: "legacy",
        offset: {
          constant: [28, 15, 0],
          keys: [],
          tables: [
            { channel: 0, single: 0, keys: [key(0, 0.9), key(1, 1)] },
            { channel: 1, single: 0, keys: [key(0, 0), key(1, 1)] },
          ],
        },
        translation: { constant: [0, 0, 0], keys: [], tables: [] },
        angles: [
          {
            constant: [1],
            keys: [],
            tables: [{ channel: 0, single: 0, keys: [key(0, 0), key(1, 360)] }],
          },
        ],
        axes: [[0, 1, 0]],
      },
    });

    const body = shapeBody(emitter.shape, spawnCloud(emitter))!;
    const faces = body.faces!.getAttribute("position");
    const radii = Array.from({ length: faces.count }, (_, at) =>
      Math.hypot(faces.getX(at), faces.getZ(at)),
    );
    body.faces!.computeBoundingBox();
    const { min, max } = body.faces!.boundingBox!;

    expect(Math.min(...radii)).toBeGreaterThan(25.2 - 1);
    expect(Math.max(...radii)).toBeLessThan(28 + 0.01);
    expect(min.x).toBeLessThan(-27);
    expect(max.z).toBeGreaterThan(27);
    expect(min.y).toBeGreaterThan(-0.01);
    expect(max.y).toBeGreaterThan(14);
  });

  it("draws a legacy shape's emit rotation as its axis and the arc its angle sweeps", () => {
    const turned = emitterOf(0, {
      shape: {
        kind: "legacy",
        offset: { constant: [0, 0, 10], keys: [], tables: [] },
        translation: { constant: [0, 0, 0], keys: [], tables: [] },
        angles: [
          {
            constant: [1],
            keys: [],
            tables: [
              {
                channel: 0,
                single: 0,
                keys: [
                  { time: 0, values: [0] },
                  { time: 1, values: [90] },
                ],
              },
            ],
          },
        ],
        axes: [[0, 1, 0]],
      },
    });
    const still = emitterOf(0, {
      shape: { ...turned.shape, axes: [[0, 0, 0]] } as typeof turned.shape,
    });

    const body = shapeBody(turned.shape, spawnCloud(turned));
    expect(body?.faces).toBeNull();
    expect(body?.edges.getAttribute("position").count).toBeGreaterThan(2);
    expect(body?.turns?.getAttribute("position").count).toBe(2);
    expect(shapeBody(still.shape, spawnCloud(still))?.turns ?? null).toBeNull();
  });
});
