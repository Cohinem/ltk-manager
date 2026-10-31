import type {
  AudioEvent,
  EventNode,
  EventPlaylistItem,
  EventTree,
  MediaLocation,
} from "@/lib/tauri";

import { NO_NAMES, nodeMatches, type NodeNames } from "./nodeNames";
import type { MixPath } from "./voiceMix";

/** The fetch state of one event's tree, as the rows read it. */
export type TreeState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly tree: EventTree };

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

/** Returns the key of the add row under the row `owner`. */
export function addKey(owner: string): string {
  return `${owner}:add`;
}

/** Returns the text an object without a name shows: `#` and its decimal ID. */
export function objectLabel(id: number): string {
  return `#${id}`;
}

/** Returns the text an event names itself by: its name, or `#` and its decimal ID. */
export function eventLabel(event: { readonly id: number; readonly name: string | null }): string {
  return event.name ?? objectLabel(event.id);
}

/**
 * Returns the events whose name or decimal ID contains `filter`, without regard to case, and the
 * events that reach a node whose derived name in `names` or decimal ID contains it.
 *
 * A leading `#` of the filter is dropped.
 */
export function filterEvents(
  events: readonly AudioEvent[],
  filter: string,
  names: NodeNames = NO_NAMES,
): AudioEvent[] {
  const needle = filter.trim().replace(/^#/, "").toLowerCase();
  if (needle === "") return [...events];

  return events.filter(
    (event) =>
      String(event.id).includes(needle) ||
      (event.name?.toLowerCase().includes(needle) ?? false) ||
      event.nodes.some((node) => nodeMatches(names, node.id, needle)),
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

/** One media of a press and the objects whose properties it plays with. */
export interface EventVoice {
  readonly media: MediaLocation;
  readonly path: MixPath;
}

/** One media that a pick plays, and the nodes from its sound up to the picked node. */
interface PickedSound {
  readonly media: MediaLocation;
  readonly nodes: readonly number[];
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
  return pickedSounds(node, random).map((pick) => pick.media);
}

/** Returns the picks of one press on `node`, as `pickSounds` picks them, with their nodes. */
function pickedSounds(node: EventNode, random: RandomSource): PickedSound[] {
  const below = (child: EventNode | undefined): PickedSound[] => {
    if (child === undefined) return [];

    return pickedSounds(child, random).map((pick) => ({
      media: pick.media,
      nodes: [...pick.nodes, node.id],
    }));
  };
  const childSounds = (index: number) => below(childrenOf(node)[index]);

  switch (node.kind) {
    case "sound":
      return node.media === null ? [] : [{ media: node.media, nodes: [node.id] }];
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
      return node.children.flatMap(below);
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

/**
 * Returns the media of one press on `node`, under the containers `above` it, innermost first.
 *
 * A press on a node waits on no Play action.
 */
export function nodeVoices(
  node: EventNode,
  random: RandomSource,
  above: readonly number[] = [],
): EventVoice[] {
  return pickedSounds(node, random).map((pick) => ({
    media: pick.media,
    path: { nodes: [...pick.nodes, ...above], action: null },
  }));
}

/** Returns the media of one press of the event `tree`, each under the Play action that picks it. */
export function eventVoices(tree: EventTree, random: RandomSource): EventVoice[] {
  return tree.actions.flatMap((action) => {
    if (action.node === null) return [];

    const played = { id: action.id, delay: action.delay / MS_PER_SECOND };
    return pickedSounds(action.node, random).map((pick) => ({
      media: pick.media,
      path: { nodes: pick.nodes, action: played },
    }));
  });
}

const MS_PER_SECOND = 1000;
