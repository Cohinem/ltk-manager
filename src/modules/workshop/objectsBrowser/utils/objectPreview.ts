import { classLayout } from "../../bin/classes/utils/classLayouts";
import { assetKey } from "../../preview/utils/assetRef";
import type { ObjectRowNode, ObjectTreeNode } from "./objectTree";

/** The renderable declaration shared by a tile and its document. */
export function objectPreviewKind(node: ObjectTreeNode): "vfx" | "skin" | null {
  if (node.type !== "object") {
    return null;
  }

  const declaration = node.declarations[0];
  const shell = declaration && classLayout(declaration.classHash)?.shell;
  return shell === "vfx" || shell === "skin" ? shell : null;
}

/** The declaration identity of a rendered object. */
export function objectPreviewKey(node: ObjectRowNode): string {
  const declaration = node.declarations[0];
  return `${declaration ? assetKey(declaration.asset) : ""}:${node.objectHash}`;
}
