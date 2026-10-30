import type {
  AudioEvent,
  EventAction,
  EventNode,
  EventTree,
  MediaLocation,
  NodeParent,
  ObjectProperties,
} from "@/lib/tauri";

import { eventKey, shownChildOrder, type TreeState } from "./eventTree";
import { type NodeField, nodeFields } from "./nodeFields";
import { takesChild } from "./treeEditing";
import type { MixPath } from "./voiceMix";

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

/**
 * One header of the event tree: a container, a switch state or a Play action, and what is under
 * it.
 */
export interface VoiceGroup {
  readonly key: string;
  /**
   * The container whose fields the header shows. Null for the header of a Play action and for a
   * switch state that is not one container.
   */
  readonly container: ContainerNode | null;
  /** `true` for the one-line header of a container whose only child is a container. */
  readonly compact: boolean;
  /** The switch state of the header, or null for a header outside a switch. */
  readonly state: GroupState | null;
  /** The Play action whose tree holds the header. */
  readonly play: EventAction;
  /** `true` for the header of one Play action of an event with several. */
  readonly actionHeader: boolean;
  /** The containers from the action's node down to the header's parent, as a voice names them. */
  readonly path: readonly VoiceStep[];
  readonly items: readonly TreeItem[];
  /** The count of the voices under the header, at every depth. */
  readonly count: number;
  /** `false` for the header of a switch state other than the default, which starts folded. */
  readonly defaultOpen: boolean;
}

/** A row of the event tree under an event or a header: a header, a voice, or another action. */
export type TreeItem =
  | { readonly kind: "group"; readonly group: VoiceGroup }
  | { readonly kind: "voice"; readonly voice: Voice }
  /** An action that is not a Play with a tree, such as a Stop or a SetSwitch. */
  | { readonly kind: "action"; readonly key: string; readonly action: EventAction };

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
function voiceCount(items: readonly TreeItem[]): number {
  return items.reduce((sum, item) => {
    if (item.kind === "voice") return sum + 1;
    if (item.kind === "group") return sum + item.group.count;

    return sum;
  }, 0);
}

/** Returns `true` for a container other than a switch whose only child is a container. */
function isWrapper(container: ContainerNode | null): boolean {
  if (container === null || container.kind === "switch") return false;

  const [only, ...rest] = container.children;
  return only !== undefined && rest.length === 0 && isContainer(only);
}

interface GroupDraft {
  readonly key: string;
  readonly container: ContainerNode | null;
  readonly state?: GroupState | null;
  readonly play: EventAction;
  readonly actionHeader?: boolean;
  readonly path: readonly VoiceStep[];
  readonly items: readonly TreeItem[];
}

function groupItem(draft: GroupDraft): TreeItem {
  const state = draft.state ?? null;
  return {
    kind: "group",
    group: {
      actionHeader: false,
      ...draft,
      compact: isWrapper(draft.container),
      state,
      count: voiceCount(draft.items),
      defaultOpen: state?.state.kind !== "other",
    },
  };
}

/** Returns the rows of the node `node` at `nodeKey`, under the containers of `path`. */
function nodeItems(
  play: EventAction,
  node: EventNode,
  nodeKey: string,
  path: readonly VoiceStep[],
): TreeItem[] {
  if (isContainer(node)) return [containerItem(play, node, nodeKey, path, nodeKey, null)];
  if (node.kind !== "sound" && node.kind !== "missing" && node.kind !== "unsupported") return [];

  return [{ kind: "voice", voice: { key: nodeKey, node, path, play } }];
}

/**
 * Returns the header of `node`, keyed `key`, for the switch state `state` or outside a switch.
 *
 * A switch container lists one header per switch state, and every other container its children.
 */
function containerItem(
  play: EventAction,
  node: ContainerNode,
  nodeKey: string,
  path: readonly VoiceStep[],
  key: string,
  state: GroupState | null,
): TreeItem {
  if (node.kind === "switch") {
    const items = switchStates(play, node, nodeKey, path);
    return groupItem({ key, container: node, state, play, path, items });
  }

  const step: VoiceStep = { container: node, branch: null };
  const items = shownChildOrder(node).flatMap((at) => {
    const child = node.children[at];
    if (child === undefined) return [];

    return nodeItems(play, child, `${nodeKey}.${at}`, [...path, step]);
  });

  return groupItem({ key, container: node, state, play, path, items });
}

/**
 * Returns one header per switch state of `node`: the default state first, then each other child.
 *
 * A state of one container is the header of that container.
 */
function switchStates(
  play: EventAction,
  node: SwitchNode,
  nodeKey: string,
  path: readonly VoiceStep[],
): TreeItem[] {
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
    const key = `${nodeKey}~${id}`;
    const owner: GroupState = { switch: node, state };
    const below = [...path, { container: node, branch: state.kind }];
    const [first] = members;
    const lone = members.length === 1 && first !== undefined ? children[first] : undefined;
    if (lone !== undefined && isContainer(lone)) {
      return [containerItem(play, lone, `${nodeKey}.${first}`, below, key, owner)];
    }

    const items = members.flatMap((at) => {
      const child = children[at];
      if (child === undefined) return [];

      return nodeItems(play, child, `${nodeKey}.${at}`, below);
    });
    return [groupItem({ key, container: null, state: owner, play, path: below, items })];
  });
}

/**
 * Returns the rows under the event row `eventKey` of `tree`, in the order of its actions.
 *
 * The node of the one Play action of an event is listed under the event, and an event of several
 * Play actions gives each one a header. An action that plays no tree is an action row. A random
 * or sequence container lists its children in playlist order, and every other container in file
 * order. Per "Group headers" in docs/ux/AUDIO.md.
 */
export function treeItems(tree: EventTree, eventKey: string): TreeItem[] {
  const plays = tree.actions.filter((action) => action.node !== null).length;

  return tree.actions.flatMap((action, index): TreeItem[] => {
    const key = `${eventKey}/${index}`;
    if (action.node === null) return [{ kind: "action", key, action }];

    const items = nodeItems(action, action.node, `${key}.0`, []);
    if (plays === 1) return items;

    return [groupItem({ key, container: null, play: action, actionHeader: true, path: [], items })];
  });
}

/** Returns the one Play action of `tree` that plays a tree, or null for none or several. */
export function onlyPlay(tree: EventTree): EventAction | null {
  const [only, ...rest] = tree.actions.filter((action) => action.node !== null);

  return only !== undefined && rest.length === 0 ? only : null;
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

/** The fields of a voice, a header or an action that its row draws. */
export interface VoiceFields {
  /** The source of a sound, and null for a container or an object that does not play. */
  readonly source: NodeField | null;
  /** The target of an action, which its name cell edits, and null for a node. */
  readonly target: NodeField | null;
  readonly cells: Partial<Record<FieldCell, NodeField>>;
}

const NO_FIELDS: VoiceFields = { source: null, target: null, cells: {} };

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

  return { source: fields.find((field) => field.name === "source") ?? null, target: null, cells };
}

/** Returns the fields that the row of `action` draws: its target, which the name cell edits. */
function actionFields(
  action: EventAction,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  const fields = nodeFields({ kind: "action", action }, properties, null);

  return { ...NO_FIELDS, target: fields.find((field) => field.name === "target") ?? null };
}

/** Returns the fields that the row of `voice` draws, as `rowFields` lists them. */
export function voiceFields(
  voice: Voice,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  return rowFields(voice.node, voiceParent(voice), properties);
}

/**
 * Returns the fields that the header row of `group` draws: those of its container, or the target
 * of the Play action of an action header.
 */
export function groupFields(
  group: VoiceGroup,
  properties: ReadonlyMap<number, ObjectProperties>,
): VoiceFields {
  if (group.actionHeader) return actionFields(group.play, properties);
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
 * One row of the event tree: an event, a header, a voice, an action, the add row, or the state
 * of a fetch.
 */
export type VoiceRow =
  | (RowBase & {
      readonly kind: "event";
      readonly event: AudioEvent;
      /** The one Play action that the event row draws, per `onlyPlay`, or null. */
      readonly play: EventAction | null;
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
  | (RowBase & { readonly kind: "action"; readonly action: EventAction; readonly cells: RowCells })
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
  return row?.kind === "voice" ? row.line : null;
}

/** Returns the fields and the cells that `row` draws, or null for a row without cells. */
export function rowCells(row: VoiceRow | undefined): RowCells | null {
  if (row?.kind === "group" || row?.kind === "action") return row.cells;

  return voiceLine(row);
}

/** Returns the Play action of the header row `row` or the action of an action row, or null. */
export function rowAction(row: VoiceRow | undefined): EventAction | null {
  if (row?.kind === "action") return row.action;
  if (row?.kind === "group" && row.group.actionHeader) return row.group.play;

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
 * Returns the container that the add row under `group` adds to, or null if the header has none.
 *
 * A switch lists its states rather than an add row. A state of a switch that is not one container
 * adds to the switch if it is the default state, which a child added to a switch joins.
 */
function addTarget(group: VoiceGroup): ContainerNode | null {
  const { container, state } = group;
  if (container === null) return state?.state.kind === "default" ? state.switch : null;
  if (container.kind === "switch" || !takesChild(container)) return null;

  return container;
}

/**
 * Flattens `events` into the rows of the event tree, with the folds of `expanded` flipped.
 *
 * An expanded event draws the rows of `treeItems`. An open header draws its rows, then the add row
 * of the container that it adds to. An expanded event of an editable bank ends in its own add row.
 * The cells of the rows of one event line up. Per "Event tree" in docs/ux/AUDIO.md.
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
    const ready = state?.kind === "ready" ? state.tree : null;
    const items = ready === null ? null : treeItems(ready, key);
    const open = expanded.has(key);
    rows.push({
      kind: "event",
      key,
      depth: 0,
      parent: null,
      expandable: true,
      open,
      defaultOpen: false,
      eventId,
      event,
      play: ready === null ? null : onlyPlay(ready),
      plays: ready?.actions.filter((action) => action.node !== null) ?? [],
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

  /* `columns` is filled once every row of the event is listed, so it lines up all of them. */
  function pushItems(
    items: readonly TreeItem[],
    parent: string,
    depth: number,
    eventId: number,
    columns: readonly VoiceCell[],
    listed: VoiceFields[],
  ) {
    for (const item of items) {
      if (item.kind === "action") {
        const fields = actionFields(item.action, properties);
        listed.push(fields);
        rows.push({
          kind: "action",
          key: item.key,
          ...leaf(parent, depth, eventId),
          action: item.action,
          cells: { fields, columns },
        });
        continue;
      }

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

      const container = addTarget(group);
      const addable =
        editable && container !== null && properties.get(container.id)?.editable === true;
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

/** Returns the IDs of the containers of a voice's `path`, the innermost first. */
export function stepAncestors(path: readonly VoiceStep[]): number[] {
  return path.map((step) => step.container.id).reverse();
}

/**
 * What a committed edit plays again: one voice, or a new press of its event.
 *
 * `object` is the object of the edited row, which a voice that plays it may already follow.
 */
export type Replay =
  | {
      readonly kind: "voice";
      readonly key: string;
      readonly object: number;
      readonly media: MediaLocation;
      readonly path: MixPath;
    }
  | {
      readonly kind: "event";
      readonly key: string;
      readonly object: number;
      readonly event: number;
    };

/**
 * Returns what plays once after an edit on `row` lands.
 *
 * A voice row replays its voice, with the containers above it. An event, a header and an action
 * row replay the event. Returns null for a voice without media and for any other row.
 */
export function replayOf(row: VoiceRow): Replay | null {
  const event = { kind: "event", key: eventKey(row.eventId), event: row.eventId } as const;
  if (row.kind === "group") {
    return { ...event, object: row.group.container?.id ?? row.group.play.id };
  }
  if (row.kind === "action") return { ...event, object: row.action.id };
  if (row.kind === "event") return { ...event, object: row.eventId };

  const voice = voiceLine(row)?.voice;
  const node = voice?.node;
  if (voice === undefined || node?.kind !== "sound" || node.media === null) return null;

  const path = { nodes: [node.id, ...stepAncestors(voice.path)], action: null };
  return { kind: "voice", key: row.key, object: node.id, media: node.media, path };
}
