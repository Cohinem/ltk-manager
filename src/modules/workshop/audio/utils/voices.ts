import type {
  AudioEvent,
  EventAction,
  EventNode,
  EventTree,
  MediaLocation,
  ObjectProperties,
} from "@/lib/tauri";

import { childrenOf, eventKey, fieldKey, shownChildOrder, type TreeState } from "./eventTree";
import { type NodeField, nodeFields } from "./nodeFields";
import { takesChild } from "./treeEditing";

/** A node that holds children: a random, sequence, switch or layer container, or an actor-mixer. */
export type ContainerNode = Extract<EventNode, { kind: "random" | "switch" | "layer" | "mixer" }>;

/** A leaf of a play tree: a sound, or an object that does not play. */
export type VoiceNode = Extract<EventNode, { kind: "sound" | "missing" | "unsupported" }>;

/** The branch of a switch that a path takes: a node of its default switch, or another node. */
export type SwitchBranch = "default" | "other";

/** One container on the path from a Play action to a voice. */
export interface VoiceStep {
  readonly container: ContainerNode;
  /** The branch that the path takes in a switch container, and null in a container of another kind. */
  readonly branch: SwitchBranch | null;
}

/** One sound that an event can play, with the containers above it. */
export interface Voice {
  /** The key of the voice's row: the path of child indexes from the action down. */
  readonly key: string;
  readonly node: VoiceNode;
  /** The containers from the action's node down to the voice's parent. */
  readonly path: readonly VoiceStep[];
}

/** The voices of one Play action and the path from the action to them. */
export interface VoiceChain {
  /** The key of the chain's row, as the event tree keys the action. */
  readonly key: string;
  readonly action: EventAction;
  /**
   * The containers from the action's node down, while each one holds a single container child.
   * Empty if the action plays a sound directly.
   */
  readonly run: readonly ContainerNode[];
  /** The voices of the default branches, in the order that the event tree draws them. */
  readonly voices: readonly Voice[];
  /** The voices that only another branch of a switch container reaches. */
  readonly others: readonly Voice[];
}

function isContainer(node: EventNode): node is ContainerNode {
  return (
    node.kind === "random" ||
    node.kind === "switch" ||
    node.kind === "layer" ||
    node.kind === "mixer"
  );
}

/** Returns the indexes of the children of `node` on the default branch of a switch. */
function defaultBranch(node: ContainerNode): ReadonlySet<number> | null {
  if (node.kind !== "switch") return null;

  return new Set(node.pick.kind === "default" ? node.pick.nodes : [0]);
}

/** Returns the containers from `node` down, while each one holds a single container child. */
function containerRun(node: EventNode): ContainerNode[] {
  const run: ContainerNode[] = [];
  let current: EventNode | undefined = node;
  while (current !== undefined && isContainer(current)) {
    run.push(current);

    const children = childrenOf(current);
    const only = children.length === 1 ? children[0] : undefined;
    current = only !== undefined && isContainer(only) ? only : undefined;
  }
  return run;
}

/**
 * Returns the voices of the Play actions of `tree`, one chain per action that plays a node.
 *
 * A random or sequence container lists its children in playlist order, and every other container
 * in file order. A switch container lists the nodes of its default switch, or its first child if
 * the switch names none, in `voices`, and its other children in `others`. Per "Voices" in
 * docs/ux/AUDIO.md.
 */
export function voiceChains(tree: EventTree, eventKey: string): VoiceChain[] {
  const chains: VoiceChain[] = [];
  tree.actions.forEach((action, index) => {
    if (action.node === null) return;

    const key = `${eventKey}/${index}`;
    const voices: Voice[] = [];
    const others: Voice[] = [];

    function walk(node: EventNode, nodeKey: string, path: readonly VoiceStep[], other: boolean) {
      if (!isContainer(node)) {
        if (node.kind === "sound" || node.kind === "missing" || node.kind === "unsupported") {
          (other ? others : voices).push({ key: nodeKey, node, path });
        }
        return;
      }

      const branch = defaultBranch(node);
      const children = childrenOf(node);
      for (const at of shownChildOrder(node)) {
        const child = children[at];
        if (child === undefined) continue;

        const taken: SwitchBranch | null =
          branch === null ? null : branch.has(at) ? "default" : "other";
        const step: VoiceStep = { container: node, branch: taken };
        walk(child, `${nodeKey}.${at}`, [...path, step], other || taken === "other");
      }
    }

    walk(action.node, `${key}.0`, [], false);
    chains.push({ key, action, run: containerRun(action.node), voices, others });
  });
  return chains;
}

/**
 * Returns the steps that the row of `voice` names before its media: the path below the end of
 * the chain's run, from the last container of the run on.
 *
 * Returns none if the voice's parent is the last container of the run.
 */
export function voicePrefix(voice: Voice, chain: VoiceChain): readonly VoiceStep[] {
  if (voice.path.length <= chain.run.length) return [];

  return voice.path.slice(Math.max(0, chain.run.length - 1));
}

/** One part of the chain line: the Play action, a container of the run, or the voice count. */
export type ChainSegment =
  /** `delay` is the action's `DelayTime` in milliseconds. */
  | { readonly kind: "play"; readonly action: EventAction; readonly delay: number }
  /** `weighted` is `true` for a random container whose pick reads the weights. */
  | { readonly kind: "container"; readonly container: ContainerNode; readonly weighted: boolean }
  | { readonly kind: "count"; readonly count: number };

/** Returns the parts of the line that names the path from the Play action of `chain` to its voices. */
export function chainLine(
  chain: VoiceChain,
  properties: ReadonlyMap<number, ObjectProperties>,
): ChainSegment[] {
  const containers = chain.run.map((container): ChainSegment => ({
    kind: "container",
    container,
    weighted:
      container.kind === "random" &&
      container.mode === "random" &&
      properties.get(container.id)?.weights?.weighted === true,
  }));

  return [
    { kind: "play", action: chain.action, delay: chain.action.delay },
    ...containers,
    { kind: "count", count: chain.voices.length + chain.others.length },
  ];
}

/** A voice that its event row draws, because the event plays it alone. */
export interface InlineVoice {
  readonly voice: Voice;
  readonly chain: VoiceChain;
}

/**
 * Returns the voice of an event whose Play actions play one sound without a container.
 *
 * Returns null for any other event.
 */
export function inlineVoice(chains: readonly VoiceChain[]): InlineVoice | null {
  const [chain, ...rest] = chains;
  if (chain === undefined || rest.length > 0 || chain.run.length > 0) return null;

  const [voice, ...more] = chain.voices;
  if (voice === undefined || more.length > 0 || chain.others.length > 0) return null;

  return { voice, chain };
}

/** A cell of a voice row. */
export type VoiceCell = "media" | "volume" | "pitch" | "weight" | "delay" | "lpf" | "hpf";

/** A cell of a voice row that holds a field. */
export type FieldCell = Exclude<VoiceCell, "media">;

/** The cells of a voice row, in the order that the row draws them. */
const CELL_ORDER: readonly VoiceCell[] = [
  "media",
  "volume",
  "pitch",
  "weight",
  "delay",
  "lpf",
  "hpf",
];

/** The cells that a voice row draws only when their value is not 0. */
const ZERO_HIDDEN: ReadonlySet<string> = new Set(["delay", "lpf", "hpf"]);

/** The fields of a voice that its row draws. */
export interface VoiceFields {
  /** The source of a sound, and null for an object that does not play. */
  readonly source: NodeField | null;
  readonly cells: Partial<Record<FieldCell, NodeField>>;
}

/** Returns the parent container of `voice`, or null for a sound under its action. */
export function voiceParent(voice: Voice): ContainerNode | null {
  return voice.path.at(-1)?.container ?? null;
}

/**
 * Returns the fields that the row of `voice` draws.
 *
 * The row draws the volume and the pitch, and the weight if the parent's pick reads weights. The
 * delay, the low-pass and the high-pass filter are drawn only if they are not 0.
 */
export function voiceFields(
  voice: Voice,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  if (voice.node.kind !== "sound") return { source: null, cells: {} };

  const fields = nodeFields({ kind: "node", node: voice.node }, properties, voiceParent(voice));
  const cells: Partial<Record<FieldCell, NodeField>> = {};
  for (const name of CELL_ORDER) {
    const field = fields.find((each) => each.name === name);
    if (field === undefined || name === "media") continue;
    if (ZERO_HIDDEN.has(name) && field.value === 0) continue;
    if (field.detail.kind === "weight" && field.detail.share === null) continue;

    cells[name] = field;
  }

  return { source: fields.find((field) => field.name === "source") ?? null, cells };
}

/** Returns the cells that a list of voice rows lines up: every cell that one of `fields` draws. */
export function voiceColumns(fields: readonly VoiceFields[]): VoiceCell[] {
  return CELL_ORDER.filter(
    (cell) => cell === "media" || fields.some((each) => each.cells[cell] !== undefined),
  );
}

/** Returns the cells of `columns` that hold a value in a row of `fields`, which the arrows visit. */
export function voiceCells(fields: VoiceFields, columns: readonly VoiceCell[]): VoiceCell[] {
  return columns.filter((cell) => cell === "media" || fields.cells[cell] !== undefined);
}

/**
 * Returns the cell that `key` moves to from the cell `at` of a row of `count` cells.
 *
 * ArrowRight stops at the last cell. Returns null for ArrowLeft on the first cell and for any
 * other key.
 */
export function movedCell(key: string, at: number, count: number): number | null {
  if (key === "ArrowRight") return Math.min(count - 1, at + 1);
  if (key === "ArrowLeft") return at > 0 ? at - 1 : null;

  return null;
}

interface RowBase {
  readonly key: string;
  readonly depth: number;
  /** The key of the row above in the tree, or null for an event. */
  readonly parent: string | null;
  readonly expandable: boolean;
  /** The ID of the event that the row belongs to. */
  readonly eventId: number;
}

/** A voice drawn on a row, with the cells that its list lines up. */
export interface VoiceLine {
  readonly voice: Voice;
  readonly chain: VoiceChain;
  readonly fields: VoiceFields;
  readonly columns: readonly VoiceCell[];
}

/**
 * One row of the Voices view: an event, the chain line of a Play action, a field of an object of
 * the chain, a voice, the fold of a switch's other branches, the add row, or the state of a fetch.
 */
export type VoiceRow =
  | (RowBase & {
      readonly kind: "event";
      readonly event: AudioEvent;
      /** The voice of an event that plays one sound alone, which the event row draws. */
      readonly inline: VoiceLine | null;
    })
  | (RowBase & {
      readonly kind: "chain";
      readonly chain: VoiceChain;
      readonly segments: readonly ChainSegment[];
    })
  | (RowBase & { readonly kind: "field"; readonly field: NodeField })
  | (RowBase & {
      readonly kind: "voice";
      readonly line: VoiceLine;
      readonly prefix: readonly VoiceStep[];
    })
  | (RowBase & { readonly kind: "others"; readonly count: number })
  | (RowBase & { readonly kind: "add"; readonly container: ContainerNode })
  | (RowBase & { readonly kind: "empty" })
  | (RowBase & { readonly kind: "loading" })
  | (RowBase & { readonly kind: "failed"; readonly message: string });

/** Returns the voice that `row` draws, or null for a row without one. */
export function voiceLine(row: VoiceRow | undefined): VoiceLine | null {
  if (row?.kind === "voice") return row.line;
  if (row?.kind === "event") return row.inline;

  return null;
}

/**
 * Returns `true` if the source of the voice of `line` takes another media of the bank set.
 *
 * A sound of a bank's media index and a streamed sound do. A prefetched sound does not, as its
 * media is in two files.
 */
export function takesMediaPick(line: VoiceLine): boolean {
  const { node } = line.voice;
  if (node.kind !== "sound" || line.fields.source?.editable !== true) return false;

  return node.stream === "dataBank" || node.stream === "streaming";
}

/** Returns the key that opens the field rows of the object `id` under the chain `chain`. */
export function segmentKey(chain: string, id: number): string {
  return `${chain}#${id}`;
}

/** Returns the key of the fold of the other switch branches of the chain `chain`. */
export function othersKey(chain: string): string {
  return `${chain}:others`;
}

/** What `voiceRows` reads beside the trees. */
export interface VoiceRowOptions {
  /** The properties of the objects of the trees, by object ID. */
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  /** `true` if the bank takes edits, which draws the add row. */
  readonly editable: boolean;
}

/**
 * Flattens `events` into the rows of the Voices view, with the children of every key in
 * `expanded`.
 *
 * An expanded event draws the chain line of each Play action, the fields of the objects whose
 * segment is open, the voices of the default branches, the fold of the other branches, and the
 * add row of a chain that ends in a random container or an actor-mixer. An event that plays one
 * sound alone draws it on its own row and does not expand. Per "Voices" in docs/ux/AUDIO.md.
 */
export function voiceRows(
  events: readonly AudioEvent[],
  expanded: ReadonlySet<string>,
  trees: ReadonlyMap<number, TreeState>,
  { properties, editable }: VoiceRowOptions,
): VoiceRow[] {
  const rows: VoiceRow[] = [];

  for (const event of events) {
    const key = eventKey(event.id);
    const eventId = event.id;
    const state = trees.get(event.id);
    const chains = state?.kind === "ready" ? voiceChains(state.tree, key) : null;
    const single = chains === null ? null : inlineVoice(chains);
    const inline = single === null ? null : lineOf(single.voice, single.chain, [single.voice]);
    rows.push({
      kind: "event",
      key,
      depth: 0,
      parent: null,
      expandable: inline === null,
      eventId,
      event,
      inline,
    });
    if (inline !== null || !expanded.has(key)) continue;

    if (state === undefined || state.kind === "loading") {
      rows.push({ kind: "loading", key: `${key}:loading`, ...leaf(key, 1, eventId) });
      continue;
    }
    if (state.kind === "failed") {
      rows.push({
        kind: "failed",
        key: `${key}:failed`,
        ...leaf(key, 1, eventId),
        message: state.message,
      });
      continue;
    }

    if (chains === null || chains.length === 0) {
      rows.push({ kind: "empty", key: `${key}:empty`, ...leaf(key, 1, eventId) });
      continue;
    }

    for (const chain of chains) pushChain(chain, eventId);
  }

  function lineOf(voice: Voice, chain: VoiceChain, list: readonly Voice[]): VoiceLine {
    const columns = voiceColumns(list.map((each) => voiceFields(each, properties)));
    return { voice, chain, fields: voiceFields(voice, properties), columns };
  }

  function pushChain(chain: VoiceChain, eventId: number) {
    rows.push({
      kind: "chain",
      key: chain.key,
      ...leaf(eventKey(eventId), 1, eventId),
      chain,
      segments: chainLine(chain, properties),
    });

    const owners = [
      {
        id: chain.action.id,
        fields: nodeFields({ kind: "action", action: chain.action }, properties, null),
      },
      ...chain.run.map((node) => ({
        id: node.id,
        fields: nodeFields({ kind: "node", node }, properties, null),
      })),
    ];
    for (const owner of owners) {
      const segment = segmentKey(chain.key, owner.id);
      if (!expanded.has(segment)) continue;

      for (const field of owner.fields) {
        rows.push({
          kind: "field",
          key: fieldKey(segment, field.name),
          ...leaf(chain.key, 2, eventId),
          field,
        });
      }
    }

    const listed = [...chain.voices, ...chain.others];
    for (const voice of chain.voices) {
      rows.push({
        kind: "voice",
        key: voice.key,
        ...leaf(chain.key, 2, eventId),
        line: lineOf(voice, chain, listed),
        prefix: voicePrefix(voice, chain),
      });
    }

    const last = chain.run.at(-1);
    const addable =
      editable && last !== undefined && takesChild(last) && properties.get(last.id)?.editable;
    if (addable === true) {
      rows.push({
        kind: "add",
        key: `${chain.key}:add`,
        ...leaf(chain.key, 2, eventId),
        container: last,
      });
    }

    if (chain.others.length === 0) return;

    const fold = othersKey(chain.key);
    rows.push({
      kind: "others",
      key: fold,
      depth: 2,
      parent: chain.key,
      expandable: true,
      eventId,
      count: chain.others.length,
    });
    if (!expanded.has(fold)) return;

    for (const voice of chain.others) {
      rows.push({
        kind: "voice",
        key: voice.key,
        ...leaf(fold, 3, eventId),
        line: lineOf(voice, chain, listed),
        prefix: voicePrefix(voice, chain),
      });
    }
  }

  return rows;
}

function leaf(parent: string, depth: number, eventId: number) {
  return { depth, parent, expandable: false, eventId };
}

/** What a committed edit plays again: one voice, or a new press of its event. */
export type Replay =
  | { readonly kind: "voice"; readonly key: string; readonly media: MediaLocation }
  | { readonly kind: "event"; readonly key: string; readonly event: number };

/**
 * Returns what plays once after an edit on `row` lands.
 *
 * A voice row and an event row that draws its voice replay that voice. A field row of the chain
 * replays the event. Returns null for a voice without media and for any other row.
 */
export function replayOf(row: VoiceRow): Replay | null {
  if (row.kind === "field")
    return { kind: "event", key: eventKey(row.eventId), event: row.eventId };

  const line = row.kind === "voice" ? row.line : row.kind === "event" ? row.inline : null;
  const node = line?.voice.node;
  if (node?.kind !== "sound" || node.media === null) return null;

  return { kind: "voice", key: row.key, media: node.media };
}
