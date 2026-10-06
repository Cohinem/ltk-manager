import { Group, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { scaleAboutParent } from "../attachedPlace";

/** A mesh with `matrixAutoUpdate` off, as an attached skin has it. */
function held(): Object3D {
  const mesh = new Object3D();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

describe("scaleAboutParent", () => {
  it("applies a moved and turned parent once to a vertex the bones already placed", () => {
    const placement = new Group();
    placement.position.set(120, 0, -40);
    placement.rotation.set(0, Math.PI / 3, 0);
    const mesh = held();
    placement.add(mesh);

    scaleAboutParent(mesh, [1, 1, 1]);
    placement.updateMatrixWorld(true);

    /* A point the bones skinned into world space, the placement included. */
    const skinned = new Vector3(5, 10, 15).applyMatrix4(placement.matrixWorld);
    const drawn = skinned.clone().applyMatrix4(mesh.matrixWorld);

    expect(drawn.distanceTo(skinned)).toBeLessThan(1e-9);
  });

  it("scales about the parent's origin, in the parent's own axes", () => {
    const placement = new Group();
    placement.position.set(120, 0, -40);
    placement.rotation.set(0, Math.PI / 3, 0);
    const mesh = held();
    placement.add(mesh);

    scaleAboutParent(mesh, [2, 3, 2]);
    placement.updateMatrixWorld(true);

    const skinned = new Vector3(5, 10, 15).applyMatrix4(placement.matrixWorld);
    const drawn = skinned.clone().applyMatrix4(mesh.matrixWorld);
    const expected = new Vector3(10, 30, 30).applyMatrix4(placement.matrixWorld);

    expect(drawn.distanceTo(expected)).toBeLessThan(1e-9);
  });

  it("reads a parent moved since the last matrix update", () => {
    const placement = new Group();
    const mesh = held();
    placement.add(mesh);
    placement.updateMatrixWorld(true);

    placement.position.set(50, 0, 0);
    scaleAboutParent(mesh, [1, 1, 1]);
    placement.updateMatrixWorld(true);

    const skinned = new Vector3(1, 2, 3).applyMatrix4(placement.matrixWorld);

    expect(skinned.clone().applyMatrix4(mesh.matrixWorld).distanceTo(skinned)).toBeLessThan(1e-9);
  });

  it("scales about the scene's origin with no parent", () => {
    const mesh = held();

    scaleAboutParent(mesh, [2, 2, 2]);
    mesh.updateMatrixWorld(true);

    expect(new Vector3(1, 2, 3).applyMatrix4(mesh.matrixWorld).toArray()).toEqual([2, 4, 6]);
  });
});
