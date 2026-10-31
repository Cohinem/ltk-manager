import { m } from "@/i18n";
import type {
  AudioEvent,
  EventAction,
  EventNode,
  EventTree,
  ImportedMedia,
  NodeRole,
} from "@/lib/tauri";

/** The derived names of the objects of one bank set, by ID. */
export interface NodeNames {
  /** The name of each sound and container that a named event reaches, by object ID. */
  readonly nodes: ReadonlyMap<number, string>;
  /** The stem that the name of each named container starts with, by object ID. */
  readonly stems: ReadonlyMap<number, string>;
  /** The name of each media that an imported file or a named sound gives, by source ID. */
  readonly media: ReadonlyMap<number, string>;
  /** The name of each Play action of a read tree, by object ID. */
  readonly actions: ReadonlyMap<number, string>;
}

/** The prefix of a shipped event name: the verb, the category and the champion or skin. */
const EVENT_PREFIX = /^[a-z]+_(?:sfx|vo|mus|amb)_[^_]+_(?=[^_])/i;

const ROLE_LABELS: Record<NodeRole, () => string> = {
  sound: m.audio_node_sound_label,
  random: m.audio_node_random_label,
  sequence: m.audio_node_sequence_label,
  switch: m.audio_node_switch_label,
  layer: m.audio_node_layer_label,
  mixer: m.audio_node_mixer_label,
};

/** Returns `name` without its `Play_sfx_<Champion>_` prefix, or `name` if it has none. */
export function eventStem(name: string): string {
  return name.replace(EVENT_PREFIX, "");
}

/** The fewest characters that a shared stem takes, below which it names nothing. */
const MIN_SHARED_STEM = 3;

/** Returns `true` if `prefix` ends `text` or a `_`-separated segment of it. */
function endsSegment(text: string, prefix: string): boolean {
  return text.length === prefix.length || text[prefix.length] === "_";
}

/**
 * Returns the longest common stem of `stems`, compared without regard to case.
 *
 * A common prefix that cuts a segment short falls back to the last whole segment, unless it holds
 * no `_`. Returns null if no stem of three or more characters remains.
 */
export function sharedStem(stems: readonly string[]): string | null {
  const [first, ...rest] = stems;
  if (first === undefined) return null;
  if (rest.length === 0) return first;

  const lower = stems.map((stem) => stem.toLowerCase());
  let length = 0;
  while (
    length < first.length &&
    lower.every((stem) => stem[length] !== undefined && stem[length] === lower[0]?.[length])
  ) {
    length += 1;
  }

  let prefix = first.slice(0, length);
  const cut = !stems.every((stem) => endsSegment(stem, prefix));
  if (cut && prefix.includes("_")) prefix = prefix.slice(0, prefix.lastIndexOf("_"));
  prefix = prefix.replace(/_+$/, "");

  return prefix.length >= MIN_SHARED_STEM ? prefix : null;
}

/** Returns the file name `file` without its extension. */
function fileStem(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

/** What the events of a bank say about one node. */
interface Reach {
  readonly role: NodeRole;
  readonly source: number | null;
  /** The stems of the named events that reach the node, in event order. */
  readonly stems: string[];
  /** The 1-based place of a sound among the sounds of the first named event that reaches it. */
  slot: number | null;
}

/**
 * Returns the derived names of the nodes that the Play actions of `events` reach, and of their
 * media.
 *
 * `events` is every event of the bank, in file order. A container takes the stem of its events
 * and its role. A sound takes the stem and its slot, or the file name of a media of `imported`. A
 * node that no named event reaches, or whose events share no stem, takes no name. A media takes
 * the name of the first sound that plays it. Per "Names" in docs/ux/AUDIO.md.
 */
export function nodeNames(
  events: readonly AudioEvent[],
  imported: readonly ImportedMedia[] = [],
): NodeNames {
  const reaches = new Map<number, Reach>();
  for (const event of events) {
    const stem = event.name === null ? null : eventStem(event.name);
    let slot = 0;
    for (const node of event.nodes) {
      if (node.role === "sound") slot += 1;

      let reach = reaches.get(node.id);
      if (reach === undefined) {
        reach = { role: node.role, source: node.source, stems: [], slot: null };
        reaches.set(node.id, reach);
      }
      if (stem === null) continue;

      if (!reach.stems.includes(stem)) reach.stems.push(stem);
      if (node.role === "sound" && reach.slot === null) reach.slot = slot;
    }
  }

  const files = new Map(imported.map((media) => [media.source, fileStem(media.file)]));
  const nodes = new Map<number, string>();
  const stems = new Map<number, string>();
  const media = new Map(files);
  for (const [id, reach] of reaches) {
    const stem = sharedStem(reach.stems);
    const name = derivedName(reach, stem, files);
    if (name === null) continue;

    nodes.set(id, name);
    if (stem !== null && reach.role !== "sound") stems.set(id, stem);
    if (reach.source !== null && !media.has(reach.source)) media.set(reach.source, name);
  }
  return { nodes, stems, media, actions: new Map() };
}

/** Returns `names` with the names of the Play actions of `trees`, which `actionName` derives. */
export function withActions(names: NodeNames, trees: Iterable<EventTree>): NodeNames {
  const actions = new Map<number, string>();
  for (const tree of trees) {
    for (const action of tree.actions) {
      const name = actionName(tree.name, action);
      if (name !== null) actions.set(action.id, name);
    }
  }
  return { ...names, actions };
}

/**
 * Returns the stem that each container of a run of `ids` draws before its role, or null where it
 * draws none: for an ID that is null, and for a container whose stem the container before it
 * draws.
 */
export function runStems(ids: readonly (number | null)[], names: NodeNames): (string | null)[] {
  let last: string | null = null;
  return ids.map((id) => {
    if (id === null) return null;

    const stem = names.stems.get(id) ?? null;
    const shown = stem === last ? null : stem;
    last = stem;
    return shown;
  });
}

/** The names of an empty bank set, which name no node. */
export const NO_NAMES: NodeNames = {
  nodes: new Map(),
  stems: new Map(),
  media: new Map(),
  actions: new Map(),
};

/** The class of a Play action, the high byte of its type. */
const PLAY_CLASS = 0x0400;

/** Returns the role of a sound or container node, or null for a node that does not play. */
function roleOf(node: EventNode): NodeRole | null {
  switch (node.kind) {
    case "random":
      return node.mode === "sequence" ? "sequence" : "random";
    case "sound":
    case "switch":
    case "layer":
    case "mixer":
      return node.kind;
    default:
      return null;
  }
}

/**
 * Returns the name that a row of `node` shows before its ID: its derived name, or else its kind.
 *
 * An object that does not play shows its object kind, and a missing one shows its ID.
 */
export function nodeName(names: NodeNames, node: EventNode): string {
  const named = names.nodes.get(node.id);
  if (named !== undefined) return named;
  if (node.kind === "unsupported") return node.kindName;
  if (node.kind === "missing") return m.audio_node_missing_label({ id: String(node.id) });

  const role = roleOf(node);
  return role === null ? "" : ROLE_LABELS[role]();
}

/** Returns the name of `node` and its ID on one line, as a tooltip or a picker writes it. */
export function nodeText(names: NodeNames, node: EventNode): string {
  if (node.kind === "missing") return nodeName(names, node);

  return m.audio_node_named_label({ name: nodeName(names, node), id: String(node.id) });
}

/** Returns the name of a Play action of the event `event`, or null if it takes none. */
export function actionName(event: string | null, action: EventAction): string | null {
  if (event === null || action.class !== PLAY_CLASS) return null;

  return m.audio_node_derived_label({ stem: eventStem(event), role: m.audio_node_play_label() });
}

/** Returns `true` if the name or the decimal ID of the node `id` contains `needle`. */
export function nodeMatches(names: NodeNames, id: number, needle: string): boolean {
  return (
    String(id).includes(needle) || (names.nodes.get(id)?.toLowerCase().includes(needle) ?? false)
  );
}

function derivedName(
  reach: Reach,
  stem: string | null,
  files: ReadonlyMap<number, string>,
): string | null {
  const file = reach.source === null ? undefined : files.get(reach.source);
  if (file !== undefined) return file;
  if (stem === null) return null;
  if (reach.role !== "sound") {
    return m.audio_node_derived_label({ stem, role: ROLE_LABELS[reach.role]() });
  }

  return reach.slot === null ? null : m.audio_node_slot_label({ stem, slot: String(reach.slot) });
}
