import type { AudioEvent, EventAction, EventNode, EventTree, MediaLocation } from "@/lib/tauri";

/** The fetch state of one event's tree, as the rows read it. */
export type TreeState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly tree: EventTree };

interface RowBase {
  /** Unique within the tree: the path of indexes from the event down. */
  readonly key: string;
  readonly depth: number;
  /** The key of the row above in the tree, or `null` for an event. */
  readonly parent: string | null;
  /** `true` if the row has children, fetched or not. */
  readonly expandable: boolean;
}

/** One row of the event tree: an event, an action, a node, or the state of a fetch. */
export type EventRow =
  | (RowBase & { readonly kind: "event"; readonly event: AudioEvent })
  | (RowBase & { readonly kind: "action"; readonly action: EventAction })
  | (RowBase & { readonly kind: "node"; readonly node: EventNode })
  | (RowBase & { readonly kind: "loading" })
  | (RowBase & { readonly kind: "failed"; readonly message: string });

/** Returns the key of the row of the event `id`. */
export function eventKey(id: number): string {
  return `e${id}`;
}

/** Returns the children of a container node, or none for a node of another kind. */
export function childrenOf(node: EventNode): readonly EventNode[] {
  switch (node.kind) {
    case "random":
    case "switch":
    case "layer":
    case "mixer":
      return node.children;
    default:
      return [];
  }
}

/**
 * Flattens `events` into the rows the tree draws, with the children of every key in `expanded`.
 *
 * An expanded event draws the rows of its tree from `trees`, or one loading or failed row while
 * the fetch has not answered.
 */
export function eventRows(
  events: readonly AudioEvent[],
  expanded: ReadonlySet<string>,
  trees: ReadonlyMap<number, TreeState>,
): EventRow[] {
  const rows: EventRow[] = [];

  function pushNode(node: EventNode, key: string, parent: string, depth: number) {
    const children = childrenOf(node);
    rows.push({ kind: "node", key, depth, parent, expandable: children.length > 0, node });
    if (!expanded.has(key)) return;

    children.forEach((child, index) => pushNode(child, `${key}.${index}`, key, depth + 1));
  }

  for (const event of events) {
    const key = eventKey(event.id);
    rows.push({ kind: "event", key, depth: 0, parent: null, expandable: true, event });
    if (!expanded.has(key)) continue;

    const state = trees.get(event.id) ?? { kind: "loading" };
    if (state.kind === "loading") {
      rows.push({
        kind: "loading",
        key: `${key}:loading`,
        depth: 1,
        parent: key,
        expandable: false,
      });
      continue;
    }
    if (state.kind === "failed") {
      rows.push({
        kind: "failed",
        key: `${key}:failed`,
        depth: 1,
        parent: key,
        expandable: false,
        message: state.message,
      });
      continue;
    }

    state.tree.actions.forEach((action, index) => {
      const actionKey = `${key}/${index}`;
      rows.push({
        kind: "action",
        key: actionKey,
        depth: 1,
        parent: key,
        expandable: action.node !== null,
        action,
      });
      if (action.node !== null && expanded.has(actionKey)) {
        pushNode(action.node, `${actionKey}.0`, actionKey, 2);
      }
    });
  }
  return rows;
}

/** Returns the text an object without a name shows: `#` and its decimal ID. */
export function objectLabel(id: number): string {
  return `#${id}`;
}

/** Returns the text an event names itself by: its name, or `#` and its decimal ID. */
export function eventLabel(event: { readonly id: number; readonly name: string | null }): string {
  return event.name ?? objectLabel(event.id);
}

/** Returns the events whose name or decimal ID contains `filter`, without regard to case. */
export function filterEvents(events: readonly AudioEvent[], filter: string): AudioEvent[] {
  const needle = filter.trim().toLowerCase();
  if (needle === "") return [...events];

  return events.filter(
    (event) =>
      String(event.id).includes(needle) || (event.name?.toLowerCase().includes(needle) ?? false),
  );
}

/** Returns `events` with the named ones first, by name, then the unnamed ones, by ID. */
export function sortEvents(events: readonly AudioEvent[]): AudioEvent[] {
  return [...events].sort((a, b) => {
    if (a.name !== null && b.name !== null) return a.name.localeCompare(b.name);
    if (a.name !== null) return -1;
    if (b.name !== null) return 1;
    return a.id - b.id;
  });
}

/** A source of numbers in `[0, 1)`, `Math.random` unless a test seeds one. */
export type RandomSource = () => number;

/**
 * Returns the media that `node` plays on one press.
 *
 * A random container plays one child picked uniformly, a switch container its first child, a
 * layer container and an actor-mixer every child, and a sound its media. A sound without media
 * and an object that does not play give none. Per "Event tree" in docs/ux/AUDIO.md.
 */
export function pickSounds(node: EventNode, random: RandomSource): MediaLocation[] {
  switch (node.kind) {
    case "sound":
      return node.media === null ? [] : [node.media];
    case "random": {
      const child = node.children[Math.floor(random() * node.children.length)];
      return child === undefined ? [] : pickSounds(child, random);
    }
    case "switch": {
      const first = node.children[0];
      return first === undefined ? [] : pickSounds(first, random);
    }
    case "layer":
    case "mixer":
      return node.children.flatMap((child) => pickSounds(child, random));
    default:
      return [];
  }
}

/** Returns the media that one press of the event `tree` plays: the picks of its Play actions. */
export function eventSounds(tree: EventTree, random: RandomSource): MediaLocation[] {
  return tree.actions.flatMap((action) =>
    action.node === null ? [] : pickSounds(action.node, random),
  );
}
