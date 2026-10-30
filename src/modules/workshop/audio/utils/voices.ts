import type {
  AudioEvent,
  EventAction,
  EventNode,
  EventTree,
  MediaLocation,
  NodeParent,
  ObjectProperties,
} from "@/lib/tauri";

import { childrenOf, eventKey, shownChildOrder, type TreeState } from "./eventTree";
import { type NodeField, nodeFields } from "./nodeFields";
import { takesChild } from "./treeEditing";

/** A node that holds children: a random, sequence, switch or layer container, or an actor-mixer. */
export type ContainerNode = Extract<EventNode, { kind: "random" | "switch" | "layer" | "mixer" }>;

/** A switch container. */
export type SwitchNode = Extract<ContainerNode, { kind: "switch" }>;

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
  /** The Play action whose tree holds the voice. */
  readonly play: EventAction;
}

/** The switch state that a group header stands for: the default switch, or one other child. */
export type SwitchState =
  | { readonly kind: "default" }
  /** `child` is the index of the child in the `children` of the switch container. */
  | { readonly kind: "other"; readonly child: number };

/** The switch state of a group header, and the switch container that the state belongs to. */
export interface GroupState {
  readonly switch: SwitchNode;
  readonly state: SwitchState;
}

/** One header of the Voices view: a container that holds voices, and what is under it. */
export interface VoiceGroup {
  readonly key: string;
  /**
   * The container whose fields the header shows. Null for the header of a Play action that plays
   * a sound directly.
   */
  readonly container: ContainerNode | null;
  /** The containers above `container` that each hold one container child, outermost first. */
  readonly wrappers: readonly ContainerNode[];
  /** The switch state of the header, or null for a header outside a switch. */
  readonly state: GroupState | null;
  /** The Play action whose tree holds the header. */
  readonly play: EventAction;
  /** `true` for the header of one Play action of an event with several. */
  readonly actionHeader: boolean;
  /** The containers from the action's node down to the header's parent, as a voice names them. */
  readonly path: readonly VoiceStep[];
  readonly items: readonly GroupItem[];
  /** The count of the voices under the header, at every depth. */
  readonly count: number;
  /** `false` for the header of a switch state other than the default, which starts folded. */
  readonly defaultOpen: boolean;
}

/** A row under a header: another header, or a voice. */
export type GroupItem =
  | { readonly kind: "group"; readonly group: VoiceGroup }
  | { readonly kind: "voice"; readonly voice: Voice };

function isContainer(node: EventNode): node is ContainerNode {
  return (
    node.kind === "random" ||
    node.kind === "switch" ||
    node.kind === "layer" ||
    node.kind === "mixer"
  );
}

/** Returns the indexes of the children of `node` on its default switch. */
function defaultBranch(node: SwitchNode): ReadonlySet<number> {
  return new Set(node.pick.kind === "default" ? node.pick.nodes : [0]);
}

/** Returns the count of the voices of `items`, at every depth. */
function voiceCount(items: readonly GroupItem[]): number {
  return items.reduce((sum, item) => sum + (item.kind === "voice" ? 1 : item.group.count), 0);
}

interface GroupDraft {
  readonly key: string;
  readonly container: ContainerNode | null;
  readonly wrappers?: readonly ContainerNode[];
  readonly state?: GroupState | null;
  readonly play: EventAction;
  readonly actionHeader?: boolean;
  readonly path: readonly VoiceStep[];
  readonly items: readonly GroupItem[];
}

function groupItem(draft: GroupDraft): GroupItem {
  const state = draft.state ?? null;
  return {
    kind: "group",
    group: {
      wrappers: [],
      actionHeader: false,
      ...draft,
      state,
      count: voiceCount(draft.items),
      defaultOpen: state?.state.kind !== "other",
    },
  };
}

/** The switch state that a walk carries into the header of the state's one container. */
interface PendingState {
  readonly key: string;
  readonly state: GroupState;
}

/** Returns `true` if a header folds `node` into itself: a container of another kind than switch. */
function foldable(node: EventNode | undefined): node is ContainerNode {
  return node !== undefined && isContainer(node) && node.kind !== "switch";
}

/**
 * Returns the header items of the node `node` at `nodeKey`, under the containers of `path`.
 *
 * A container whose only child is a container gives no header of its own and is named on the
 * header below it. A switch container gives one header per switch state.
 */
function nodeItems(
  play: EventAction,
  node: EventNode,
  nodeKey: string,
  path: readonly VoiceStep[],
  wrappers: readonly ContainerNode[],
  pending: PendingState | null,
): GroupItem[] {
  if (!isContainer(node)) {
    if (node.kind !== "sound" && node.kind !== "missing" && node.kind !== "unsupported") return [];

    return [{ kind: "voice", voice: { key: nodeKey, node, path, play } }];
  }

  if (node.kind === "switch" && pending === null) {
    return switchItems(play, node, nodeKey, path, wrappers);
  }

  const step: VoiceStep = { container: node, branch: null };
  const children = childrenOf(node);
  const only = children.length === 1 ? children[0] : undefined;
  if (foldable(only) && pending === null) {
    return nodeItems(play, only, `${nodeKey}.0`, [...path, step], [...wrappers, node], null);
  }

  const items = shownChildOrder(node).flatMap((at) => {
    const child = children[at];
    if (child === undefined) return [];

    return nodeItems(play, child, `${nodeKey}.${at}`, [...path, step], [], null);
  });

  return [
    groupItem({
      key: pending?.key ?? nodeKey,
      container: node,
      wrappers,
      state: pending?.state ?? null,
      play,
      path,
      items,
    }),
  ];
}

/** Returns one header per switch state of `node`: the default state first, then each other child. */
function switchItems(
  play: EventAction,
  node: SwitchNode,
  nodeKey: string,
  path: readonly VoiceStep[],
  wrappers: readonly ContainerNode[],
): GroupItem[] {
  const children = node.children;
  const defaults = defaultBranch(node);
  const listed = children.map((_, at) => at);
  const states: { state: SwitchState; members: number[] }[] = [
    { state: { kind: "default" }, members: listed.filter((at) => defaults.has(at)) },
    ...listed
      .filter((at) => !defaults.has(at))
      .map((child) => ({ state: { kind: "other", child } as const, members: [child] })),
  ];

  return states.flatMap(({ state, members }) => {
    if (members.length === 0) return [];

    const id = state.kind === "default" ? "default" : String(state.child);
    const pending: PendingState = { key: `${nodeKey}~${id}`, state: { switch: node, state } };
    const step: VoiceStep = { container: node, branch: state.kind };
    const [first] = members;
    const lone = members.length === 1 && first !== undefined ? children[first] : undefined;
    if (foldable(lone)) {
      return nodeItems(play, lone, `${nodeKey}.${first}`, [...path, step], wrappers, pending);
    }

    const items = members.flatMap((at) => {
      const child = children[at];
      if (child === undefined) return [];

      return nodeItems(play, child, `${nodeKey}.${at}`, [...path, step], [], null);
    });
    return [
      groupItem({
        key: pending.key,
        container: node,
        wrappers,
        state: pending.state,
        play,
        path,
        items,
      }),
    ];
  });
}

/**
 * Returns the header items of the Play actions of `tree`, keyed under the event row `eventKey`.
 *
 * A random or sequence container lists its children in playlist order, and every other container
 * in file order. An event of one Play action lists the headers of its node. An event of several
 * gives one header per action, which is the header of its node when the node gives one. Per
 * "Group headers" in docs/ux/AUDIO.md.
 */
export function voiceGroups(tree: EventTree, eventKey: string): GroupItem[] {
  const plays = tree.actions.flatMap((action, index) =>
    action.node === null ? [] : [{ action, node: action.node, key: `${eventKey}/${index}` }],
  );
  const many = plays.length > 1;

  return plays.flatMap(({ action, node, key }) => {
    const items = nodeItems(action, node, `${key}.0`, [], [], null);
    if (!many) return items;

    const [only, ...rest] = items;
    if (only?.kind === "group" && rest.length === 0) {
      return [{ kind: "group", group: { ...only.group, actionHeader: true } }];
    }

    const container = isContainer(node) ? node : null;
    return [groupItem({ key, container, play: action, actionHeader: true, path: [], items })];
  });
}

/**
 * Returns the voice of an event whose items are one sound without a header.
 *
 * Returns null for any other event.
 */
export function inlineVoice(items: readonly GroupItem[]): Voice | null {
  const [only, ...rest] = items;
  return only?.kind === "voice" && rest.length === 0 ? only.voice : null;
}

/**
 * Returns the delay in milliseconds of the one Play action of `tree`, which the event row shows.
 *
 * Returns null if the delay is 0, and for an event with no or several Play actions.
 */
export function playDelay(tree: EventTree): number | null {
  const [only, ...rest] = tree.actions.filter((action) => action.node !== null);
  if (only === undefined || rest.length > 0 || only.delay === 0) return null;

  return only.delay;
}

/** A cell of a voice row or a header row. The name cell is `media`. */
export type VoiceCell = "media" | "volume" | "pitch" | "weight" | "delay" | "lpf" | "hpf";

/** A cell of a row that holds a field. */
export type FieldCell = Exclude<VoiceCell, "media">;

/** The cells of a row, in the order that the row draws them. */
const CELL_ORDER: readonly VoiceCell[] = [
  "media",
  "volume",
  "pitch",
  "weight",
  "delay",
  "lpf",
  "hpf",
];

/** The cells that a row draws only when their value is not 0. */
const ZERO_HIDDEN: ReadonlySet<string> = new Set(["delay", "lpf", "hpf"]);

/** The fields of a voice or a header that its row draws. */
export interface VoiceFields {
  /** The source of a sound, and null for a container or an object that does not play. */
  readonly source: NodeField | null;
  readonly cells: Partial<Record<FieldCell, NodeField>>;
}

const NO_FIELDS: VoiceFields = { source: null, cells: {} };

/** Returns the parent container of `voice`, or null for a sound under its action. */
export function voiceParent(voice: { readonly path: readonly VoiceStep[] }): ContainerNode | null {
  return voice.path.at(-1)?.container ?? null;
}

/**
 * Returns the fields that the row of `node` under `parent` draws.
 *
 * The row draws the volume and the pitch, and the weight if the parent's pick reads weights. The
 * delay, the low-pass and the high-pass filter are drawn only if they are not 0.
 */
function rowFields(
  node: EventNode,
  parent: ContainerNode | null,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  if (node.kind !== "sound" && !isContainer(node)) return NO_FIELDS;

  const fields = nodeFields({ kind: "node", node }, properties, parent);
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

/** Returns the fields that the row of `voice` draws, as `rowFields` lists them. */
export function voiceFields(
  voice: Voice,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  return rowFields(voice.node, voiceParent(voice), properties);
}

/** Returns the fields that the header row of `group` draws: those of its container. */
export function groupFields(
  group: VoiceGroup,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  if (group.container === null) return NO_FIELDS;

  return rowFields(group.container, voiceParent(group), properties);
}

/** Returns the cells that a list of rows lines up: every cell that one of `fields` draws. */
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
  /** `true` if the row's children are drawn. */
  readonly open: boolean;
  /** `true` for a row that is open until it is folded: a header other than a switch state's. */
  readonly defaultOpen: boolean;
  /** The ID of the event that the row belongs to. */
  readonly eventId: number;
}

/** The fields of a row and the cells that the rows of its event line up. */
export interface RowCells {
  readonly fields: VoiceFields;
  readonly columns: readonly VoiceCell[];
}

/** A voice drawn on a row, with the cells that the rows of its event line up. */
export interface VoiceLine extends RowCells {
  readonly voice: Voice;
}

/**
 * One row of the Voices view: an event, a group header, a voice, the add row, or the state of a
 * fetch.
 */
export type VoiceRow =
  | (RowBase & {
      readonly kind: "event";
      readonly event: AudioEvent;
      /** The voice of an event that plays one sound alone, which the event row draws. */
      readonly inline: VoiceLine | null;
      /** The delay of the event's one Play action in milliseconds, or null, per `playDelay`. */
      readonly delay: number | null;
      /** The Play actions of the event's tree, or none while the tree is not read. */
      readonly plays: readonly EventAction[];
    })
  | (RowBase & {
      readonly kind: "group";
      readonly group: VoiceGroup;
      readonly cells: RowCells;
      /** `true` for a random container whose pick reads the weights. */
      readonly weighted: boolean;
    })
  | (RowBase & { readonly kind: "voice"; readonly line: VoiceLine })
  /** The add row of a container, or of an event. `exclude` is what a moved node may not be. */
  | (RowBase & {
      readonly kind: "add";
      readonly into: NodeParent;
      readonly exclude: ReadonlySet<number>;
    })
  | (RowBase & { readonly kind: "empty" })
  | (RowBase & { readonly kind: "loading" })
  | (RowBase & { readonly kind: "failed"; readonly message: string });

/** Returns the voice that `row` draws, or null for a row without one. */
export function voiceLine(row: VoiceRow | undefined): VoiceLine | null {
  if (row?.kind === "voice") return row.line;
  if (row?.kind === "event") return row.inline;

  return null;
}

/** Returns the fields and the cells that `row` draws, or null for a row without cells. */
export function rowCells(row: VoiceRow | undefined): RowCells | null {
  if (row?.kind === "group") return row.cells;

  return voiceLine(row);
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

/**
 * Returns the key whose presence in the expanded keys flips the fold of `row`.
 *
 * A row that is open by default is folded by `<key>:closed`, and any other row is opened by its
 * own key.
 */
export function foldKey(row: { readonly key: string; readonly defaultOpen: boolean }): string {
  return row.defaultOpen ? `${row.key}:closed` : row.key;
}

/** Returns `true` if the row `key` is open, with the keys in `expanded` flipping the default. */
function isOpen(key: string, defaultOpen: boolean, expanded: ReadonlySet<string>): boolean {
  return defaultOpen !== expanded.has(foldKey({ key, defaultOpen }));
}

/** What `voiceRows` reads beside the trees. */
export interface VoiceRowOptions {
  /** The properties of the objects of the trees, by object ID. */
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  /** `true` if the bank takes edits, which draws the add rows. */
  readonly editable: boolean;
}

/**
 * Flattens `events` into the rows of the Voices view, with the folds of `expanded` flipped.
 *
 * An expanded event draws its group headers, per `voiceGroups`. An open header draws its voices
 * and headers, then the add row of a container that takes a child. An expanded event of an
 * editable bank ends in its own add row. An event that plays one sound alone draws it on its own
 * row and does not expand. The cells of the rows of one event line up. Per "Voices" in
 * docs/ux/AUDIO.md.
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
    const items = state?.kind === "ready" ? voiceGroups(state.tree, key) : null;
    const single = items === null ? null : inlineVoice(items);
    const inline = single === null ? null : lineOf(single, [single]);
    const open = inline === null && expanded.has(key);
    rows.push({
      kind: "event",
      key,
      depth: 0,
      parent: null,
      expandable: inline === null,
      open,
      defaultOpen: false,
      eventId,
      event,
      inline,
      delay: state?.kind === "ready" ? playDelay(state.tree) : null,
      plays:
        state?.kind === "ready" ? state.tree.actions.filter((action) => action.node !== null) : [],
    });
    if (!open) continue;

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

    if (items === null || items.length === 0) {
      rows.push({ kind: "empty", key: `${key}:empty`, ...leaf(key, 1, eventId) });
    } else {
      const columns: VoiceCell[] = [];
      const listed: VoiceFields[] = [];
      pushItems(items, key, 1, eventId, columns, listed);
      columns.push(...voiceColumns(listed));
    }

    if (editable) {
      rows.push({
        kind: "add",
        key: `${key}:add`,
        ...leaf(key, 1, eventId),
        into: { kind: "event", event: eventId },
        exclude: new Set(),
      });
    }
  }

  function lineOf(voice: Voice, list: readonly Voice[]): VoiceLine {
    const columns = voiceColumns(list.map((each) => voiceFields(each, properties)));
    return { voice, fields: voiceFields(voice, properties), columns };
  }

  /* `columns` is filled once every row of the event is listed, so it lines up all of them. */
  function pushItems(
    items: readonly GroupItem[],
    parent: string,
    depth: number,
    eventId: number,
    columns: readonly VoiceCell[],
    listed: VoiceFields[],
  ) {
    for (const item of items) {
      if (item.kind === "voice") {
        const fields = voiceFields(item.voice, properties);
        listed.push(fields);
        rows.push({
          kind: "voice",
          key: item.voice.key,
          ...leaf(parent, depth, eventId),
          line: { voice: item.voice, fields, columns },
        });
        continue;
      }

      const { group } = item;
      const fields = groupFields(group, properties);
      const open = isOpen(group.key, group.defaultOpen, expanded);
      listed.push(fields);
      rows.push({
        kind: "group",
        key: group.key,
        depth,
        parent,
        expandable: true,
        open,
        defaultOpen: group.defaultOpen,
        eventId,
        group,
        cells: { fields, columns },
        weighted:
          group.container?.kind === "random" &&
          group.container.mode === "random" &&
          properties.get(group.container.id)?.weights?.weighted === true,
      });
      if (!open) continue;

      pushItems(group.items, group.key, depth + 1, eventId, columns, listed);

      const { container } = group;
      const addable =
        editable &&
        container !== null &&
        takesChild(container) &&
        properties.get(container.id)?.editable === true;
      if (addable) {
        rows.push({
          kind: "add",
          key: `${group.key}:add`,
          ...leaf(group.key, depth + 1, eventId),
          into: { kind: "container", container: container.id },
          exclude: new Set([container.id, ...container.children.map((child) => child.id)]),
        });
      }
    }
  }

  return rows;
}

function leaf(parent: string, depth: number, eventId: number) {
  return { depth, parent, expandable: false, open: false, defaultOpen: false, eventId };
}

/** What a committed edit plays again: one voice, or a new press of its event. */
export type Replay =
  | { readonly kind: "voice"; readonly key: string; readonly media: MediaLocation }
  | { readonly kind: "event"; readonly key: string; readonly event: number };

/**
 * Returns what plays once after an edit on `row` lands.
 *
 * A voice row and an event row that draws its voice replay that voice. A header row and an event
 * row of another event replay the event. Returns null for a voice without media and for any
 * other row.
 */
export function replayOf(row: VoiceRow): Replay | null {
  if (row.kind === "group" || (row.kind === "event" && row.inline === null)) {
    return { kind: "event", key: eventKey(row.eventId), event: row.eventId };
  }

  const node = voiceLine(row)?.voice.node;
  if (node?.kind !== "sound" || node.media === null) return null;

  return { kind: "voice", key: row.key, media: node.media };
}
