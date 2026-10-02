/** `set` with `value` added, or taken out where it already is. */
export function toggledIn<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/**
 * `collapsed` with the branch `root` and every branch in `subtree` toggled together.
 *
 * A collapsed `root` expands with all of them, and an expanded one collapses with them.
 */
export function toggledSubtree(
  collapsed: ReadonlySet<string>,
  root: string,
  subtree: Iterable<string>,
): Set<string> {
  const next = new Set(collapsed);
  const collapse = !collapsed.has(root);

  for (const id of [root, ...subtree]) {
    if (collapse) next.add(id);
    else next.delete(id);
  }

  return next;
}
