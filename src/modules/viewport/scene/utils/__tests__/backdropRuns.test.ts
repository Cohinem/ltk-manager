import { Box3, Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { type MeshRun, runsInView } from "../backdropRuns";

/** A run of one group whose first index is `id`, in a unit box centred on `at`. */
function run(id: number, at: [number, number, number]): MeshRun {
  const centre = new Vector3(...at);
  return {
    box: new Box3().setFromCenterAndSize(centre, new Vector3(1, 1, 1)),
    groups: [{ startIndex: id, indexCount: 3, material: 0 }],
    depth: 0,
  };
}

/** The frustum and the eye of a camera at the origin that looks down the negative z axis. */
function view(): { frustum: Frustum; eye: Vector3 } {
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const projection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return { frustum: new Frustum().setFromProjectionMatrix(projection), eye: camera.position };
}

const ids = (runs: readonly MeshRun[]) => runs.map((each) => each.groups[0]?.startIndex);

describe("runsInView", () => {
  it("returns the runs whose box is in the frustum and leaves out the others", () => {
    const { frustum, eye } = view();
    const runs = [
      run(1, [0, 0, -10]),
      run(2, [0, 0, 10]),
      run(3, [500, 0, -10]),
      run(4, [0, 0, -500]),
    ];

    expect(ids(runsInView(runs, frustum, eye, []))).toEqual([1]);
  });

  it("orders the runs in view nearest to the eye first", () => {
    const { frustum, eye } = view();
    const runs = [run(1, [0, 0, -50]), run(2, [0, 0, -5]), run(3, [0, 0, -20])];

    expect(ids(runsInView(runs, frustum, eye, []))).toEqual([2, 3, 1]);
  });

  it("keeps the given order of runs at the same distance", () => {
    const { frustum, eye } = view();
    const runs = [run(1, [1, 0, -10]), run(2, [-1, 0, -10]), run(3, [0, 1, -10])];

    expect(ids(runsInView(runs, frustum, eye, []))).toEqual([1, 2, 3]);
  });

  it("writes into the given array and replaces what it held", () => {
    const { frustum, eye } = view();
    const out = [run(9, [0, 0, -1])];

    const returned = runsInView([run(1, [0, 0, -10])], frustum, eye, out);

    expect(returned).toBe(out);
    expect(ids(out)).toEqual([1]);
  });

  it("records the distance from the eye to each run in view", () => {
    const { frustum, eye } = view();
    const near = run(1, [0, 0, -10]);

    runsInView([near], frustum, eye, []);

    expect(near.depth).toBeCloseTo(9.5);
  });
});
