import type {
  AudioEvent,
  EventAction,
  EventNode,
  EventPlaylistItem,
  EventTree,
  MediaLocation,
  NodeParent,
  ObjectProperties,
} from "@/lib/tauri";

import { type NodeField, nodeFields } from "./nodeFields";

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

/**
 * One row of the event tree: an event, an action, a node, a field of an action or a node, the
 * children of a container, or the state of a fetch.
 */
export type EventRow =
  | (RowBase & { readonly kind: "event"; readonly event: AudioEvent })
  | (RowBase & { readonly kind: "action"; readonly action: EventAction })
  | (RowBase & { readonly kind: "node"; readonly node: EventNode })
  | (RowBase & { readonly kind: "field"; readonly field: NodeField })
  | (RowBase & { readonly kind: "children"; readonly node: EventNode; readonly count: number })
  /** The add row at the end of an event's actions or a container's children. */
  | (RowBase & { readonly kind: "add"; readonly into: NodeParent })
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
 * Returns the indexes into the children of `node` in the order that the tree draws them.
 *
 * A random or sequence container draws its playlist items in playlist order, then the children
 * outside the playlist. Every other node draws its children in file order.
 */
export function shownChildOrder(node: EventNode): number[] {
  const children = childrenOf(node);
  const natural = children.map((_, index) => index);
  if (node.kind !== "random") return natural;

  const listed = [...new Set(node.playlist.map((item) => item.child))];
  const shown = new Set(listed);
  return [...listed, ...natural.filter((index) => !shown.has(index))];
}

/** Returns the key of the field row `name` under the row `owner`. */
export function fieldKey(owner: string, name: string): string {
  return `${owner}:${name}`;
}

/** The name of the row that holds the children of a container. */
const CHILDREN = "children";

/** Returns the key of the add row under the row `owner`. */
export function addKey(owner: string): string {
  return `${owner}:add`;
}

/** What `eventRows` reads beside the trees. */
export interface EventRowOptions {
  /** The properties of the objects of the trees, by object ID. */
  readonly properties?: ReadonlyMap<number, ObjectProperties>;
  /** Returns `true` if `into` takes a new node, which draws its add row. */
  readonly addable?: (into: NodeParent) => boolean;
}

/**
 * Flattens `events` into the rows the tree draws, with the children of every key in `expanded`.
 *
 * An expanded event draws the rows of its tree from `trees`, or one loading or failed row while
 * the fetch has not answered. An expanded action or node draws its fields from `properties`
 * first. A container then draws a children row, which expands into its children. An event and a
 * container that `addable` takes end in an add row. Per "Rows" and "New objects" in
 * docs/ux/AUDIO.md.
 */
export function eventRows(
  events: readonly AudioEvent[],
  expanded: ReadonlySet<string>,
  trees: ReadonlyMap<number, TreeState>,
  { properties = new Map(), addable = () => false }: EventRowOptions = {},
): EventRow[] {
  const rows: EventRow[] = [];

  function pushAdd(owner: string, depth: number, into: NodeParent) {
    rows.push({ kind: "add", key: addKey(owner), depth, parent: owner, expandable: false, into });
  }

  function pushFields(fields: readonly NodeField[], owner: string, depth: number) {
    for (const field of fields) {
      rows.push({
        kind: "field",
        key: fieldKey(owner, field.name),
        depth,
        parent: owner,
        expandable: false,
        field,
      });
    }
  }

  function pushNode(
    node: EventNode,
    key: string,
    parent: string,
    depth: number,
    container: EventNode | null,
  ) {
    const fields = nodeFields({ kind: "node", node }, properties, container);
    const children = childrenOf(node);
    const adds = takesNewChild(node) && addable({ kind: "container", container: node.id });
    const expandable = fields.length > 0 || children.length > 0 || adds;
    rows.push({ kind: "node", key, depth, parent, expandable, node });
    if (!expanded.has(key)) return;

    pushFields(fields, key, depth + 1);
    if (children.length === 0 && !adds) return;

    const listKey = fieldKey(key, CHILDREN);
    rows.push({
      kind: "children",
      key: listKey,
      depth: depth + 1,
      parent: key,
      expandable: true,
      node,
      count: children.length,
    });
    if (!expanded.has(listKey)) return;

    for (const index of shownChildOrder(node)) {
      const child = children[index];
      if (child !== undefined) pushNode(child, `${key}.${index}`, listKey, depth + 2, node);
    }
    if (adds) pushAdd(listKey, depth + 2, { kind: "container", container: node.id });
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
      const fields = nodeFields({ kind: "action", action }, properties, null);
      rows.push({
        kind: "action",
        key: actionKey,
        depth: 1,
        parent: key,
        expandable: fields.length > 0 || action.node !== null,
        action,
      });
      if (!expanded.has(actionKey)) return;

      pushFields(fields, actionKey, 2);
      if (action.node !== null) pushNode(action.node, `${actionKey}.0`, actionKey, 2, null);
    });

    const into: NodeParent = { kind: "event", event: event.id };
    if (addable(into)) pushAdd(key, 1, into);
  }
  return rows;
}

/**
 * Returns `true` for a node that takes a new child: a random, sequence or switch container, or an
 * actor-mixer. A layer container names its children in its layers.
 */
function takesNewChild(node: EventNode): boolean {
  return node.kind === "random" || node.kind === "switch" || node.kind === "mixer";
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

/** One media of a press and the seconds that it waits before it starts. */
export interface EventVoice {
  readonly media: MediaLocation;
  readonly delay: number;
}

/**
 * Returns the media that `node` plays on one press.
 *
 * A random container plays one playlist item picked by weight, a sequence container its first
 * playlist item, a switch container the nodes of its default switch or else its first child, a
 * layer container and an actor-mixer every child, and a sound its media. A sound without media
 * and an object that does not play give none. Per "What plays" in docs/ux/AUDIO.md.
 */
export function pickSounds(node: EventNode, random: RandomSource): MediaLocation[] {
  const childSounds = (index: number) => {
    const child = node.kind === "sound" ? undefined : childrenOf(node)[index];
    return child === undefined ? [] : pickSounds(child, random);
  };

  switch (node.kind) {
    case "sound":
      return node.media === null ? [] : [node.media];
    case "random": {
      const item =
        node.mode === "sequence" ? node.playlist[0] : weightedItem(node.playlist, random);
      return item === undefined ? [] : childSounds(item.child);
    }
    case "switch": {
      const nodes = node.pick.kind === "default" ? node.pick.nodes : [0];
      return nodes.flatMap(childSounds);
    }
    case "layer":
    case "mixer":
      return node.children.flatMap((child) => pickSounds(child, random));
    default:
      return [];
  }
}

/** Returns the item of `playlist` that `random` picks by weight, or uniformly if no item weighs. */
function weightedItem(
  playlist: readonly EventPlaylistItem[],
  random: RandomSource,
): EventPlaylistItem | undefined {
  const total = playlist.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return playlist[Math.floor(random() * playlist.length)];

  let left = random() * total;
  for (const item of playlist) {
    left -= item.weight;
    if (left < 0) return item;
  }
  return playlist.at(-1);
}

/** Returns the media that one press of the event `tree` plays: the picks of its Play actions. */
export function eventSounds(tree: EventTree, random: RandomSource): MediaLocation[] {
  return eventVoices(tree, random).map((voice) => voice.media);
}

/** Returns the media of one press on `node`, each without a delay. */
export function nodeVoices(node: EventNode, random: RandomSource): EventVoice[] {
  return pickSounds(node, random).map((media) => ({ media, delay: 0 }));
}

/** Returns the media of one press of the event `tree`, each after the delay of its action. */
export function eventVoices(tree: EventTree, random: RandomSource): EventVoice[] {
  return tree.actions.flatMap((action) => {
    if (action.node === null) return [];

    const delay = action.delay / MS_PER_SECOND;
    return pickSounds(action.node, random).map((media) => ({ media, delay }));
  });
}

const MS_PER_SECOND = 1000;
