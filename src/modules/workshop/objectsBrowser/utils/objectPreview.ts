import { classLayout } from "../../bin/classes/utils/classLayouts";
import { nameHash } from "../../bin/shared/utils/binHash";
import { assetKey } from "../../preview/utils/assetRef";
import type { ObjectRowNode, ObjectTreeNode } from "./objectTree";

/**
 * What a tile's preview draws: a particle system, a character, a material on a sphere, or the
 * sprite of a UI icon.
 */
export type ObjectPreviewKind = "vfx" | "skin" | "material" | "ui";

const UI_ICON = nameHash("UiElementIconData");

/** The renderable declaration shared by a tile and its document. */
export function objectPreviewKind(node: ObjectTreeNode): ObjectPreviewKind | null {
  if (node.type !== "object") {
    return null;
  }

  const declaration = node.declarations[0];
  if (declaration?.classHash === UI_ICON) return "ui";

  const shell = declaration && classLayout(declaration.classHash)?.shell;
  return shell === "vfx" || shell === "skin" || shell === "material" ? shell : null;
}

/** Whether a hovered tile plays: a particle loops, and a character and a material turn. */
export function playsOnHover(kind: ObjectPreviewKind | null): boolean {
  return kind !== null && kind !== "ui";
}

/** The declaration identity of a rendered object. */
export function objectPreviewKey(node: ObjectRowNode): string {
  const declaration = node.declarations[0];
  return `${declaration ? assetKey(declaration.asset) : ""}:${node.objectHash}`;
}
