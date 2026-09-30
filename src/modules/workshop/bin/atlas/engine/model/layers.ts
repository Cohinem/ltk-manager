import { classAlias } from "./classNames";
import type { ViewTree } from "./tree";
import type { ViewLook } from "./view";

/** One row of the layers pane. */
export type LayerRow =
  | {
      readonly type: "scene";
      /** The row's key in the list, which a scene and an element never share. */
      readonly id: string;
      readonly key: string;
      readonly depth: number;
      readonly label: string;
      readonly layer: number;
      /** The file switches the scene on itself, where most leave it to the controller. */
      readonly enabled: boolean;
      readonly open: boolean;
      readonly folds: boolean;
    }
  | {
      readonly type: "element";
      readonly id: string;
      readonly key: string;
      readonly depth: number;
      readonly label: string;
      readonly className: string;
      readonly kind: ViewLook["kind"];
      readonly open: boolean;
      readonly folds: boolean;
    };

/** What a search of the layers pane keeps. */
export interface LayerMatches {
  /** The elements whose name, path or class holds the query. */
  readonly matched: ReadonlySet<string>;
  /** Every scene and group above a matched element, which the search unfolds. */
  readonly above: ReadonlySet<string>;
  /** The matched elements and everything above them, the rows the pane lists. */
  readonly kept: ReadonlySet<string>;
}

/** The elements `query` finds in the tree, ignoring case, and null for a blank query. */
export function layerMatches(tree: ViewTree, query: string): LayerMatches | null {
  const needle = query.trim().toLowerCase();
  if (needle === "") return null;

  const matched = new Set<string>();
  const above = new Set<string>();
  for (const element of tree.elements.values()) {
    const words = [
      labelOf(element.label, element.path, element.key),
      element.path ?? "",
      element.class,
      classAlias(element.class),
    ];
    if (!words.some((word) => word.toLowerCase().includes(needle))) continue;

    matched.add(element.key);
    for (const fold of foldsAbove(tree, element.key)) above.add(fold);
  }
  return { matched, above, kept: new Set([...matched, ...above]) };
}

/**
 * The tree as rows, per "Panes" in docs/plans/atlas-ui-editor.md: each scene with its child
 * scenes and then its elements under it, topmost first as the draw order stacks them, and a
 * group's children under the group. Only what `open` holds is unfolded, and where `kept` is
 * given only what it holds is listed.
 */
export function layerRows(
  tree: ViewTree,
  open: ReadonlySet<string>,
  kept: ReadonlySet<string> | null = null,
): LayerRow[] {
  const rows: LayerRow[] = [];
  const listed = (key: string) => kept === null || kept.has(key);
  const groupChildren = new Map<string, string[]>();
  for (const [child, group] of tree.groupOf) {
    const held = groupChildren.get(group);
    if (held === undefined) groupChildren.set(group, [child]);
    else held.push(child);
  }

  const topmostFirst = (keys: readonly string[]) =>
    [...keys].sort((a, b) => {
      const left = tree.elements.get(a);
      const right = tree.elements.get(b);
      return (
        (right?.layer ?? 0) - (left?.layer ?? 0) ||
        (tree.fileOrder.get(b) ?? 0) - (tree.fileOrder.get(a) ?? 0)
      );
    });

  const addElement = (key: string, depth: number, seen: Set<string>) => {
    const element = tree.elements.get(key);
    if (element === undefined || seen.has(key) || !listed(key)) return;

    seen.add(key);
    const children = (groupChildren.get(key) ?? []).filter(listed);
    const unfolded = open.has(key);
    rows.push({
      type: "element",
      id: `element:${key}`,
      key,
      depth,
      label: labelOf(element.label, element.path, key),
      className: classAlias(element.class),
      kind: element.look.kind,
      open: unfolded,
      folds: children.length > 0,
    });
    if (!unfolded) return;

    for (const child of topmostFirst(children)) addElement(child, depth + 1, seen);
  };

  const addScene = (key: string, depth: number, seen: Set<string>) => {
    const scene = tree.scenes.get(key);
    if (scene === undefined || seen.has(key) || !listed(key)) return;

    seen.add(key);
    const scenes = (tree.sceneChildren.get(key) ?? []).filter(listed);
    const elements = (tree.sceneElements.get(key) ?? []).filter(listed);
    const unfolded = open.has(key);
    rows.push({
      type: "scene",
      id: `scene:${key}`,
      key,
      depth,
      label: labelOf(scene.label, scene.path, key),
      layer: scene.layer,
      enabled: scene.enabled,
      open: unfolded,
      folds: scenes.length + elements.length > 0,
    });
    if (!unfolded) return;

    const byLayer = [...scenes].sort(
      (a, b) => (tree.scenes.get(b)?.layer ?? 0) - (tree.scenes.get(a)?.layer ?? 0),
    );
    for (const child of byLayer) addScene(child, depth + 1, seen);
    for (const element of topmostFirst(elements)) addElement(element, depth + 1, seen);
  };

  const seen = new Set<string>();
  const roots = [...(tree.sceneChildren.get(null) ?? [])].sort(
    (a, b) => (tree.scenes.get(b)?.layer ?? 0) - (tree.scenes.get(a)?.layer ?? 0),
  );
  for (const root of roots) addScene(root, 0, seen);
  return rows;
}

/** Every scene and group above `key`, which a pick made on the canvas unfolds to show it. */
export function foldsAbove(tree: ViewTree, key: string): string[] {
  const above: string[] = [];
  let at: string | undefined = key;
  const seen = new Set<string>();
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const group = tree.groupOf.get(at);
    if (group !== undefined) {
      above.push(group);
      at = group;
      continue;
    }

    let scene = tree.elements.get(at)?.scene ?? null;
    while (scene !== null && !above.includes(scene) && tree.scenes.has(scene)) {
      above.push(scene);
      scene = tree.scenes.get(scene)?.parent ?? null;
    }
    break;
  }
  return above;
}

/**
 * The last segment of an object's `name` field, else of its path, else its hash. A scene bin
 * writes the whole object path into `name`.
 */
export function labelOf(label: string, path: string | null, key: string): string {
  const named = label !== "" ? label : path;
  if (named === null) return key;
  return named.slice(named.lastIndexOf("/") + 1);
}
