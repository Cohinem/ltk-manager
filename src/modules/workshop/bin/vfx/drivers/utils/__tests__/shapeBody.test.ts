import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { Point } from "../../../engine/model/rig";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { NO_TRANSFORM } from "../../../engine/simulation/integrate";
import { identityInto } from "../../../engine/utils/basis";
import {
  placeInto,
  SEGMENTS,
  spawnFrameInto,
  spawnOriginInto,
  wireframeInto,
} from "../../../rendering/utils/emitterShape";
import { bodyMatrixInto, shapeBody } from "../shapeBody";
import { spawnCloud } from "../spawnCloud";

const IDENTITY = identityInto(new Float32Array(9));

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
    expect(body?.turns?.getAttribute("position").count).toBeGreaterThan(2);
    expect(shapeBody(still.shape, spawnCloud(still))?.turns ?? null).toBeNull();
  });
});
