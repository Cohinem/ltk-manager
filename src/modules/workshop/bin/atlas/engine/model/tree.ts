import type { View, ViewElement, ViewScene } from "./view";

/**
 * A view's scenes and elements linked into their tree, per "Model" in
 * docs/plans/atlas-ui-editor.md.
 *
 * A scene hangs under its `ParentScene`, an element under its `Scene`, and a group's `Elements`
 * make each listed element that group's child. A link to an object the file does not declare is
 * dropped, so a scene whose parent is missing is a root.
 */
export interface ViewTree {
  readonly view: View;
  readonly scenes: ReadonlyMap<string, ViewScene>;
  readonly elements: ReadonlyMap<string, ViewElement>;
  /** The scenes under each scene, and the roots under `null`, in file order. */
  readonly sceneChildren: ReadonlyMap<string | null, readonly string[]>;
  /** The elements of each scene that no group holds, in file order. */
  readonly sceneElements: ReadonlyMap<string, readonly string[]>;
  /** The group holding each element that a group lists. */
  readonly groupOf: ReadonlyMap<string, string>;
  /** Each element's place in the file, the last key of the draw order. */
  readonly fileOrder: ReadonlyMap<string, number>;
}

export function buildTree(view: View): ViewTree {
  const scenes = new Map(view.scenes.map((scene) => [scene.key, scene]));
  const elements = new Map(view.elements.map((element) => [element.key, element]));

  const sceneChildren = new Map<string | null, string[]>();
  for (const scene of view.scenes) {
    const parent = scene.parent !== null && scenes.has(scene.parent) ? scene.parent : null;
    push(sceneChildren, parent, scene.key);
  }

  const groupOf = new Map<string, string>();
  for (const element of view.elements) {
    if (element.look.kind !== "group") continue;

    for (const child of element.look.children) {
      if (elements.has(child) && !groupOf.has(child)) groupOf.set(child, element.key);
    }
  }

  const sceneElements = new Map<string, string[]>();
  for (const element of view.elements) {
    if (groupOf.has(element.key) || element.scene === null || !scenes.has(element.scene)) {
      continue;
    }
    push(sceneElements, element.scene, element.key);
  }

  const fileOrder = new Map(view.elements.map((element, at) => [element.key, at]));
  return { view, scenes, elements, sceneChildren, sceneElements, groupOf, fileOrder };
}

/** The scene an element draws in: its own `Scene`, or its outermost group's. */
export function sceneOf(tree: ViewTree, key: string): string | null {
  let at: string | undefined = key;
  const seen = new Set<string>();
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const scene = tree.elements.get(at)?.scene ?? null;
    if (scene !== null && tree.scenes.has(scene)) return scene;
    at = tree.groupOf.get(at);
  }
  return null;
}

/** `key` and every element under it, through the groups that list them. */
export function subtreeOf(tree: ViewTree, key: string): Set<string> {
  const keys = new Set<string>();
  const visit = (at: string) => {
    if (keys.has(at)) return;

    keys.add(at);
    const look = tree.elements.get(at)?.look;
    if (look?.kind !== "group") return;

    for (const child of look.children) {
      if (tree.groupOf.get(child) === at) visit(child);
    }
  };
  visit(key);
  return keys;
}

/** `scene` and every scene above it, nearest first. */
export function sceneAncestry(tree: ViewTree, scene: string): string[] {
  const chain: string[] = [];
  let at: string | null = scene;
  while (at !== null && !chain.includes(at)) {
    chain.push(at);
    const parent: string | null = tree.scenes.get(at)?.parent ?? null;
    at = parent !== null && tree.scenes.has(parent) ? parent : null;
  }
  return chain;
}

function push<K>(map: Map<K, string[]>, key: K, value: string): void {
  const held = map.get(key);
  if (held === undefined) map.set(key, [value]);
  else held.push(value);
}
