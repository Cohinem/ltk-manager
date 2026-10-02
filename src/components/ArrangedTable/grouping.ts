/** A way of filing items under headings, which an arranged table groups its rows by. */
export interface Grouping<T, Ctx = void> {
  /** The values one item files under. None files it under the empty group. */
  keys: (item: T, ctx: Ctx) => string[];
  label: (key: string, ctx: Ctx) => string;
  /** A fixed order for the groups. Without one they sort by label. */
  order?: readonly string[];
  emptyLabel?: () => string;
}

/** One heading and the items filed under it. */
export interface ItemGroup<T> {
  key: string;
  label: string;
  /** What the group files under, or null for the empty group. */
  value: string | null;
  items: T[];
  expanded: boolean;
}

/** The group an item with no value files under, which sorts last. */
const EMPTY_KEY = "\u0000none";

interface GroupItemsOptions<Ctx> {
  /** What a group's key starts with, so a fold is remembered per grouping. */
  prefix: string;
  ctx: Ctx;
  collapsed: Set<string>;
  /** Whether a search or a filter stands, which opens every group holding a match. */
  narrowed: boolean;
}

/** File `items` under `grouping`, in heading order. An item with several values files under each. */
export function groupItems<T, Ctx>(
  items: T[],
  grouping: Grouping<T, Ctx>,
  { prefix, ctx, collapsed, narrowed }: GroupItemsOptions<Ctx>,
): ItemGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const keys = grouping.keys(item, ctx);
    for (const key of keys.length > 0 ? keys : [EMPTY_KEY]) {
      const list = byKey.get(key) ?? [];
      list.push(item);
      byKey.set(key, list);
    }
  }

  const label = (key: string) =>
    key === EMPTY_KEY ? (grouping.emptyLabel?.() ?? "") : grouping.label(key, ctx);
  const order = grouping.order;
  const keys = [...byKey.keys()].sort((a, b) => {
    if (a === EMPTY_KEY || b === EMPTY_KEY) return a === EMPTY_KEY ? 1 : -1;
    if (order) return order.indexOf(a) - order.indexOf(b);
    return label(a).localeCompare(label(b));
  });

  return keys.map((key) => {
    const groupKey = `${prefix}:${key}`;
    return {
      key: groupKey,
      label: label(key),
      value: key === EMPTY_KEY ? null : key,
      items: byKey.get(key) ?? [],
      expanded: narrowed || !collapsed.has(groupKey),
    };
  });
}
