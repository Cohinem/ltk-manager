import { Matrix4, type Object3D } from "three";

const SCALE = new Matrix4();

/**
 * Give `mesh` the matrix that scales a detached skin by `scale` about its parent's origin.
 *
 * A detached bind skins a vertex by the bones' world matrices, which hold every transform
 * above the character, and then applies the mesh's world matrix on top. The matrix written
 * here undoes the parent's world matrix before the scale, so a parent that is moved or
 * turned, such as the skin preview's placement, is applied once.
 *
 * `mesh` keeps `matrixAutoUpdate` off, or the next update overwrites the matrix.
 */
export function scaleAboutParent(mesh: Object3D, scale: ArrayLike<number>): void {
  SCALE.makeScale(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);

  const parent = mesh.parent;
  if (parent === null) {
    mesh.matrix.copy(SCALE);
  } else {
    parent.updateWorldMatrix(true, false);
    mesh.matrix.copy(parent.matrixWorld).invert().premultiply(SCALE);
  }

  mesh.matrixWorldNeedsUpdate = true;
}
