import { type ClassLayout, classLayout } from "../../bin/classes/utils/classLayouts";
import { nameHash } from "../../bin/shared/utils/binHash";
import type { ShellKind } from "../../bin/shell/utils/shellPanes";
import { assetKey } from "../../preview/utils/assetRef";
import type { ObjectRowNode, ObjectTreeNode } from "./objectTree";

/**
 * What a tile's preview draws: a particle system, a character, a material on a sphere, the
 * sprite of a UI icon, a view controller's screen, one UI element, or a font's sample.
 */
export type ObjectPreviewKind = "vfx" | "skin" | "material" | "ui" | "view" | "element" | "font";

const UI_ICON = nameHash("UiElementIconData");

/** The kind each shell previews as. A map is a whole scene, too heavy for a tile. */
const SHELL_KINDS: Partial<Record<ShellKind, ObjectPreviewKind>> = {
  vfx: "vfx",
  skin: "skin",
  material: "material",
  atlas: "view",
  element: "element",
  font: "font",
};

const NO_LAYOUTS: ReadonlyMap<string, ClassLayout> = new Map();

/**
 * The renderable declaration shared by a tile and its document. `inherited` is
 * `useInheritedLayouts`'s answer, without which a class drawn through its base previews nothing.
 */
export function objectPreviewKind(
  node: ObjectTreeNode,
  inherited: ReadonlyMap<string, ClassLayout> = NO_LAYOUTS,
): ObjectPreviewKind | null {
  if (node.type !== "object") {
    return null;
  }

  const declaration = node.declarations[0];
  if (declaration === undefined) return null;
  if (declaration.classHash === UI_ICON) return "ui";

  const shell = (classLayout(declaration.classHash) ?? inherited.get(declaration.classHash))?.shell;
  return shell === undefined ? null : (SHELL_KINDS[shell] ?? null);
}

/**
 * Whether a hovered tile plays: a particle loops, a character and a material turn, and a view
 * or an element runs its effects.
 */
export function playsOnHover(kind: ObjectPreviewKind | null): boolean {
  return kind !== null && kind !== "ui" && kind !== "font";
}

/** Whether a kind draws through the Atlas renderer, which composites its own frame. */
export function drawsAtlas(kind: ObjectPreviewKind | null): boolean {
  return kind === "view" || kind === "element" || kind === "font";
}

/** The declaration identity of a rendered object. */
export function objectPreviewKey(node: ObjectRowNode): string {
  const declaration = node.declarations[0];
  return `${declaration ? assetKey(declaration.asset) : ""}:${node.objectHash}`;
}
