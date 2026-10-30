import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  AlertBox,
  Code,
  EmptyState,
  LoadingState,
  SearchField,
  SegmentedControl,
  Stack,
  useConfirm,
} from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import {
  api,
  type AssetRef,
  type AudioEvent,
  type AudioEventResponse,
  type AudioEventsResponse,
  type BankEdit,
  type ContainerKind,
  type MediaReplacement,
  type NodeParent,
  type ObjectProperties,
} from "@/lib/tauri";

import { useSandbox } from "../../sandbox/state/SandboxContext";
import { audioQueries } from "../api/queries";
import type { BankDocument } from "../hooks/useBankDocument";
import { useEventPlayer } from "../hooks/useEventPlayer";
import { useTreePicks } from "../hooks/useTreePicks";
import { NodeNamesContext } from "../state/nodeNames";
import {
  addKey,
  type EventRow,
  eventKey,
  eventLabel,
  eventRows,
  eventVoices,
  type EventVoice,
  fieldKey,
  filterEvents,
  nodeVoices,
  type RandomSource,
  sortEvents,
  type TreeState,
} from "../utils/eventTree";
import {
  asksBeforeReplace,
  type FormatChange,
  formatChanges,
  REPLACE_EXTENSIONS,
} from "../utils/mediaReplace";
import {
  deleteEdit,
  duplicateEdit,
  type NodeTarget,
  propertyEdit,
  takesProperty,
  wrapEdit,
} from "../utils/nodeBatch";
import type { FieldTarget } from "../utils/nodeFields";
import { nodeNames, withActions } from "../utils/nodeNames";
import {
  isEditable,
  rowTarget,
  takesChild,
  type TreeEditing,
  voiceTarget,
} from "../utils/treeEditing";
import { structureRow, treeSelection, voiceSelection } from "../utils/viewRows";
import { replayOf, type VoiceRow, voiceRows } from "../utils/voices";
import { AudioPanelTools } from "./AudioToolbar";
import { EventMenu, type NodeActions } from "./EventMenu";
import { isPlayable } from "./EventRowParts";
import { EventTree } from "./EventTree";
import { NewEventEntry, type Naming } from "./NewEventEntry";
import { NoticeBand } from "./NoticeBand";
import { SoundTargetPicker } from "./SoundTargetPicker";
import { VoiceList } from "./VoiceList";
import { EventWaveform } from "./Waveform";
import { EventRowThumbnail, VoiceRowThumbnail } from "./WaveformThumbnail";

interface EventsPanelProps {
  readonly asset: AssetRef;
  /** The bank held open for edits by the document, which every read applies. */
  readonly bank: BankDocument;
  /** The source that a random container picks a child with. */
  readonly random?: RandomSource;
}

/** The view of the events: the voices each one plays, or the full Wwise tree. */
type EventsView = "voices" | "structure";

/**
 * The Events view of an event bank: its tools in the document toolbar, the notices about its
 * bank set, and the event tree with one player.
 *
 * An event's tree is fetched when the event expands or plays. The picked rows of a view take the
 * node actions and the knob edits together. Per "Event tree", "Editing", "New objects" and
 * "Selection" in docs/ux/AUDIO.md.
 */
export function EventsPanel({ asset, bank, random = Math.random }: EventsPanelProps) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const queryClient = useQueryClient();
  const revision = bank.revision;
  const events = useQuery(audioQueries.events(sandbox, asset, version, revision));
  const player = useEventPlayer();
  const copy = useCopyToClipboard();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [using, setUsing] = useState<AudioEvent | null>(null);
  const confirm = useConfirm();
  const [view, setView] = useState<EventsView>("voices");
  const voices = view === "voices";

  const imported = bank.state?.imported;
  const names = useMemo(
    () => nodeNames(events.data?.list.events ?? [], imported),
    [events.data, imported],
  );
  const listed = useMemo(
    () => sortEvents(filterEvents(events.data?.list.events ?? [], filter, names)),
    [events.data, filter, names],
  );
  const openEvents = listed.filter((event) => expanded.has(eventKey(event.id)));
  const trees = useQueries({
    queries: openEvents.map((event) =>
      audioQueries.event(sandbox, asset, version, event.id, revision),
    ),
  });

  /* The tree of an event of one sound decides if its row draws the sound inline. A drawn row
     reads it through `TreeProbe`, and these observers only pass the answer to the rows. */
  const probed = voices ? listed.filter((event) => isProbed(event, expanded)) : [];
  const probes = useQueries({
    queries: probed.map((event) => ({
      ...audioQueries.event(sandbox, asset, version, event.id, revision),
      enabled: false,
    })),
  });
  const read = trees.concat(probes);

  /* The knob edits of a selection read the picks through a ref, because the picks are read off
     the rows, which the editing builds. */
  const pickedTargets = useRef<readonly NodeTarget[]>([]);
  const editing = useTreeEditing(bank, read, pickedTargets);

  const treeStates = new Map<number, TreeState>();
  [...openEvents, ...probed].forEach((event, index) => {
    const query = read[index];
    if (query?.data) {
      treeStates.set(event.id, { kind: "ready", tree: query.data.tree });
    } else if (query?.error) {
      treeStates.set(event.id, { kind: "failed", message: errorSummary(query.error) });
    }
  });
  const shownNames = withActions(
    names,
    read.flatMap((query) => (query.data ? [query.data.tree] : [])),
  );

  const shownProperties = editing?.properties ?? properties(read);
  const addable = (into: NodeParent) =>
    editing !== null && (into.kind === "event" || isEditable(editing, into.container));
  const rows = voices
    ? []
    : eventRows(listed, expanded, treeStates, { properties: shownProperties, addable });
  const voiceList = voices
    ? voiceRows(listed, expanded, treeStates, {
        properties: shownProperties,
        editable: editing !== null,
      })
    : [];

  const byKey = new Map(rows.map((row) => [row.key, row]));
  const targetByKey = new Map<string, NodeTarget>();
  for (const row of voiceList) {
    const target = voiceTarget(row);
    if (target !== null) targetByKey.set(row.key, target);
  }
  for (const row of rows) {
    const target = rowTarget(row, byKey);
    if (target !== null) targetByKey.set(row.key, target);
  }
  const picks = useTreePicks(targetByKey, selected, setSelected);
  pickedTargets.current = picks.targets;
  const eventsById = useMemo(
    () => new Map((events.data?.list.events ?? []).map((event) => [event.id, event])),
    [events.data],
  );

  function expand(key: string, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Opens the add row that Add on `key` reaches, expanding the rows above it. */
  function openAdd(key: string) {
    const added = voices ? voiceAddKey(key) : treeAddKey(key);
    if (added === null) return;

    setSelected(added);
    setAdding(added);
  }

  function treeAddKey(key: string): string | null {
    const row = byKey.get(key);
    if (row === undefined) return null;

    switch (row.kind) {
      case "add":
        return row.key;
      case "event":
        expand(row.key, true);
        return addKey(row.key);
      case "children":
        expand(row.key, true);
        return addKey(row.key);
      case "action":
        return row.parent === null ? null : addKey(row.parent);
      case "node": {
        if (takesChild(row.node)) {
          const list = fieldKey(row.key, "children");
          expand(row.key, true);
          expand(list, true);
          return addKey(list);
        }
        const above = row.parent === null ? undefined : byKey.get(row.parent);
        if (above?.kind === "children") return addKey(above.key);
        return above?.kind === "action" && above.parent !== null ? addKey(above.parent) : null;
      }
      default:
        return null;
    }
  }

  function voiceAddKey(key: string): string | null {
    const row = voiceList.find((each) => each.key === key);
    if (row === undefined) return null;
    if (row.kind === "add") return row.key;

    const owner = eventKey(row.eventId);
    expand(owner, true);
    const chain = row.kind === "chain" ? row.key : row.kind === "voice" ? row.line.chain.key : null;
    const chainAdd =
      chain === null ? undefined : voiceList.find((each) => each.key === `${chain}:add`);
    return chainAdd?.key ?? `${owner}:add`;
  }

  async function voicesOf(row: EventRow): Promise<EventVoice[]> {
    if (!isPlayable(row)) return [];

    if (row.kind === "event") {
      const { tree } = await queryClient.fetchQuery(
        audioQueries.event(sandbox, asset, version, row.event.id, revision),
      );
      return eventVoices(tree, random);
    }
    if (row.kind === "action" && row.action.node !== null)
      return nodeVoices(row.action.node, random);
    if (row.kind === "node") return nodeVoices(row.node, random);
    return [];
  }

  /** Plays `row`, or every picked row together if `row` is one of several picks. */
  async function play(row: EventRow) {
    const together = picks.picked.size > 1 && picks.picked.has(row.key);
    const shown = together ? rows.filter((each) => picks.picked.has(each.key)) : [row];
    const voicesPlayed = (await Promise.all(shown.map(voicesOf))).flat();
    if (voicesPlayed.length > 0) player.play(row.key, voicesPlayed);
  }

  function playVoiceRow(row: VoiceRow) {
    const together = picks.picked.size > 1 && picks.picked.has(row.key);
    const shown = together ? voiceList.filter((each) => picks.picked.has(each.key)) : [row];
    const structured = shown.flatMap((each) => {
      const found = structureRow(each);
      return found === null ? [] : [found.row];
    });
    void Promise.all(structured.map(voicesOf)).then((each) => {
      const voicesPlayed = each.flat();
      if (voicesPlayed.length > 0) player.play(row.key, voicesPlayed);
    });
  }

  /* The read of an edited bank lands after the edit resolves, so an event replays from a read of
     the document rather than from the query of the revision before the edit. */
  async function replay(row: VoiceRow) {
    const what = replayOf(row);
    if (what === null) return;

    if (what.kind === "voice") {
      player.play(what.key, [{ media: what.media, delay: 0 }]);
      return;
    }

    const answer = await api.readAudioEvent(sandbox, asset, what.event, revision?.id ?? null);
    if (answer.ok) player.play(what.key, eventVoices(answer.value.tree, random));
  }

  /** Copies the names of the picked events and the IDs of the other picked objects. */
  function copyPicks() {
    const targets = picks.targets;
    if (targets.length === 0) return;

    const text = targets
      .map((target) => {
        const event = target.kind === "event" ? eventsById.get(target.object) : undefined;
        return event === undefined ? String(target.object) : eventLabel(event);
      })
      .join("\n");
    const only = targets.length === 1 ? targets[0] : undefined;
    const label = only?.kind === "event" ? m.audio_event_name_label() : m.audio_object_id_label();
    void copy(text, label);
  }

  /** Returns the actions of the picked rows, or null while the bank takes no edit. */
  function nodeActions(): NodeActions | null {
    if (editing === null) return null;

    const targets = picks.targets.filter(
      (target) =>
        target.kind === "event" || target.kind === "action" || isEditable(editing, target.object),
    );
    const removal = deleteEdit(targets);
    const copies = duplicateEdit(targets);
    const only = targets.length === 1 ? targets[0] : undefined;
    const copiedEvent = only?.kind === "event" ? eventsById.get(only.object) : undefined;
    const wraps = (kind: ContainerKind) => wrapEdit(targets, kind);
    const cursor = selected;

    return {
      add: cursor === null ? null : () => openAdd(cursor),
      duplicate:
        copiedEvent !== undefined
          ? () => setNaming({ copyOf: copiedEvent.id, initial: `${eventLabel(copiedEvent)}_copy` })
          : copies === null
            ? null
            : () => void editing.edit(copies),
      wrap:
        wraps("random") === null
          ? null
          : (kind) => {
              const edit = wraps(kind);
              if (edit !== null) void editing.edit(edit);
            },
      remove: removal === null ? null : () => void editing.edit(removal),
      copy: copyPicks,
      rename:
        copiedEvent === undefined
          ? null
          : (event) => setNaming({ copyOf: null, renames: event.id, initial: eventLabel(event) }),
      assignTo: copiedEvent === undefined ? null : setUsing,
      replace: only?.kind === "sound" ? (source) => void replaceMedia(source) : null,
    };
  }

  /**
   * Replaces the media `source` with a file the reader picks, after a confirm if several sounds
   * share the media or its format changes. Per "Replacing media" in docs/ux/AUDIO.md.
   */
  async function replaceMedia(source: number) {
    const file = await open({
      multiple: false,
      directory: false,
      title: m.audio_replace_file_title(),
      filters: [{ name: m.audio_replace_file_filter_label(), extensions: [...REPLACE_EXTENSIONS] }],
    });
    if (typeof file !== "string") return;

    const replacement = await bank.previewReplace(source, file);
    if (replacement === null) return;
    if (asksBeforeReplace(replacement) && !(await confirm(replaceQuestion(replacement)))) return;

    await bank.replaceMedia(source, file);
  }

  const actions = nodeActions();

  const announcement =
    player.playing === null ? m.audio_stopped_label() : m.audio_event_playing_label();

  const tools = (
    <AudioPanelTools
      mode={
        <SegmentedControl
          size="sm"
          aria-label={m.audio_events_view_label()}
          value={view}
          onChange={setView}
          options={[
            { value: "voices", label: m.audio_events_view_voices_label() },
            { value: "structure", label: m.audio_events_view_structure_label() },
          ]}
          className="shrink-0"
        />
      }
      filter={
        <SearchField
          value={filter}
          onChange={setFilter}
          label={m.audio_events_filter_label()}
          clearLabel={m.audio_filter_clear_label()}
        />
      }
      count={events.data && m.audio_events_total_label({ count: events.data.list.events.length })}
      selection={
        picks.picked.size > 1 && (
          <span className="shrink-0 text-meta text-surface-300">
            {m.audio_selection_count_label({ count: picks.picked.size })}
          </span>
        )
      }
      create={
        editing !== null && (
          <>
            {using !== null && using.name !== null && (
              <SoundTargetPicker
                revision={editing.revision}
                name={using.name}
                onPick={(target) => {
                  const name = using.name;
                  setUsing(null);
                  if (name !== null) void bank.assignEvent(target, name);
                }}
                onClose={() => setUsing(null)}
              />
            )}
            {using === null && (
              <NewEventEntry
                naming={naming}
                onNaming={setNaming}
                onCommit={(name, entry) => editing.edit(namingEdit(name, entry))}
              />
            )}
          </>
        )
      }
    />
  );

  if (events.error) {
    return (
      <>
        {tools}
        <EmptyState size="sm" title={m.audio_events_failed_empty()} />
      </>
    );
  }
  if (events.data === undefined) {
    return (
      <>
        {tools}
        <LoadingState />
      </>
    );
  }

  const files = events.data.list.files;
  return (
    <NodeNamesContext value={shownNames}>
      <Stack fill>
        {tools}
        <SetNotices response={events.data} />
        {bank.state !== null && !bank.state.editable && (
          <NoticeBand>
            <AlertBox tone="info">
              {m.audio_edit_legacy_description({ version: String(bank.state.version) })}
            </AlertBox>
          </NoticeBand>
        )}
        {events.data.list.events.length === 0 && (
          <EmptyState size="sm" title={m.audio_events_empty()} />
        )}
        {events.data.list.events.length > 0 && listed.length === 0 && (
          <EmptyState size="sm" title={m.audio_events_filtered_empty()} />
        )}
        {listed.length > 0 && voices && (
          <VoiceList
            rows={voiceList}
            expanded={expanded}
            onExpand={expand}
            selected={selected}
            picks={picks}
            player={player}
            onPlay={playVoiceRow}
            onReplay={(row) => void replay(row)}
            onPreview={(key, media) => player.play(key, [{ media, delay: 0 }])}
            onCopy={copyPicks}
            actions={actions}
            adding={adding}
            onAdding={setAdding}
            editing={editing}
            files={files}
            onStructure={() => setView("structure")}
            menu={(row) => {
              const shown = structureRow(row);
              if (shown === null) return null;

              return (
                <EventMenu
                  row={shown.row}
                  actions={actions}
                  count={picks.targets.length}
                  onCopy={copyPicks}
                />
              );
            }}
            thumbnail={(row) => (
              <>
                <VoiceRowThumbnail
                  asset={asset}
                  version={version}
                  row={row}
                  playing={player.playing === row.key}
                />
                {row.kind === "event" && isProbed(row.event, expanded) && (
                  <TreeProbe
                    query={audioQueries.event(sandbox, asset, version, row.event.id, revision)}
                  />
                )}
              </>
            )}
          />
        )}
        {listed.length > 0 && !voices && (
          <EventTree
            rows={rows}
            expanded={expanded}
            onExpand={expand}
            selected={selected}
            picks={picks}
            player={player}
            onPlay={(row) => void play(row)}
            onCopy={copyPicks}
            actions={actions}
            editing={editing}
            files={files}
            adding={adding}
            onAdding={setAdding}
            onPreview={(key, media) => player.play(key, [{ media, delay: 0 }])}
            menu={(row) => (
              <EventMenu
                row={row}
                actions={actions}
                count={picks.targets.length}
                onCopy={copyPicks}
              />
            )}
            thumbnail={(row) => (
              <EventRowThumbnail
                asset={asset}
                version={version}
                row={row}
                playing={player.playing === row.key}
              />
            )}
          />
        )}
        {listed.length > 0 && (
          <EventWaveform
            player={player}
            selection={voices ? voiceSelection(voiceList, selected) : treeSelection(rows, selected)}
          />
        )}
        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </Stack>
    </NodeNamesContext>
  );
}

/** Returns `true` if the row of `event` may draw its one sound inline, once its tree is read. */
function isProbed(event: AudioEvent, expanded: ReadonlySet<string>): boolean {
  return event.mediaCount === 1 && !expanded.has(eventKey(event.id));
}

/** Reads the tree of one event while it is mounted, and draws nothing. */
function TreeProbe({ query }: { query: ReturnType<typeof audioQueries.event> }) {
  useQuery(query);
  return null;
}

/**
 * Returns what the tree edits through while `bank` is open and takes edits, with the properties
 * of the objects of `trees`, and null otherwise.
 *
 * A property edit of a picked object applies to every picked object that takes the property, as
 * `propertyEdit` maps it, and a knob locks while one of the picks does not take its property.
 */
function useTreeEditing(
  bank: BankDocument,
  trees: readonly { readonly data?: AudioEventResponse }[],
  picked: { readonly current: readonly NodeTarget[] },
): TreeEditing | null {
  const { state, revision, edit, importWem } = bank;
  const edited = useMemo(() => new Set(state?.edited ?? []), [state?.edited]);
  const read = properties(trees);
  const latest = useRef(read);
  latest.current = read;

  const editPicked = useCallback(
    (change: BankEdit) => {
      const targets = picked.current;
      const batched =
        change.kind === "property" &&
        change.value !== null &&
        targets.length > 1 &&
        targets.some((target) => target.object === change.object);
      if (!batched || change.kind !== "property" || change.value === null) return edit(change);

      const after = change.value;
      const before =
        latest.current.get(change.object)?.values.find((each) => each.property === change.property)
          ?.value ?? after;
      const batch = propertyEdit(
        targets,
        change.property,
        change.object,
        before,
        after,
        latest.current,
      );
      return edit(batch ?? change);
    },
    [edit, picked],
  );

  const locked = useCallback(
    (target: FieldTarget) => {
      const targets = picked.current;
      if (target.kind !== "property" || targets.length < 2) return false;
      if (!targets.some((each) => each.object === target.object)) return false;

      return !takesProperty(targets, target.property);
    },
    [picked],
  );

  if (state === null || revision === null || !state.editable) return null;

  return { revision, properties: read, edited, edit: editPicked, importWem, locked };
}

/** Returns the properties of the objects of `trees`, by object ID. */
function properties(
  trees: readonly { readonly data?: AudioEventResponse }[],
): Map<number, ObjectProperties> {
  const byId = new Map<number, ObjectProperties>();
  for (const tree of trees) {
    for (const object of tree.data?.properties ?? []) byId.set(object.id, object);
  }
  return byId;
}

/** The notices about the bank set: the game's index, the fallback set and the missing files. */
function SetNotices({ response }: { response: AudioEventsResponse }) {
  const { list, index } = response;
  const missing = list.files.filter((file, at) => at > 0 && file.state.kind === "missing");
  const missingShown = list.origin === "units" && missing.length > 0;
  const shown = index.status !== "ready" || list.origin !== "units" || missingShown;
  if (!shown) return null;

  return (
    <NoticeBand>
      {index.status === "building" && (
        <AlertBox tone="info">{m.audio_events_index_building_description()}</AlertBox>
      )}
      {index.status === "failed" && (
        <AlertBox tone="warning" title={m.audio_events_index_failed_title()}>
          <span className="select-text">{index.message}</span>
        </AlertBox>
      )}
      {list.origin === "siblings" && (
        <AlertBox tone="info">{m.audio_events_siblings_description()}</AlertBox>
      )}
      {list.origin === "alone" && (
        <AlertBox tone="info">{m.audio_events_alone_description()}</AlertBox>
      )}
      {missingShown && (
        <AlertBox tone="warning" title={m.audio_events_files_missing_title()}>
          <Stack as="span" gap={0.5} align="start">
            {missing.map((file) => (
              <Code key={file.path} className="select-text">
                {file.path}
              </Code>
            ))}
          </Stack>
        </AlertBox>
      )}
    </NoticeBand>
  );
}

/** Returns the edit that the name entry commits: a new event, a copy or a rename. */
function namingEdit(name: string, naming: Naming): BankEdit {
  if (naming.renames != null) return { kind: "renameEvent", event: naming.renames, name };
  if (naming.copyOf !== null) return { kind: "copyEvent", event: naming.copyOf, name };
  return { kind: "newEvent", name };
}

const FORMAT_CHANGE_LABELS: Record<FormatChange, () => string> = {
  codec: m.audio_replace_change_codec_label,
  channels: m.audio_replace_change_channels_label,
  rate: m.audio_replace_change_rate_label,
};

/** The confirm of a replacement whose media several sounds share or whose format changes. */
function replaceQuestion(replacement: MediaReplacement) {
  const changes = formatChanges(replacement);
  const elsewhere = replacement.sounds.filter((sound) => !sound.opened).length;

  return {
    title: m.audio_replace_confirm_title(),
    heading: m.audio_replace_confirm_heading({ count: replacement.sounds.length }),
    description: (
      <Stack as="span" gap={1} align="start">
        {changes.length > 0 && (
          <span>
            {m.audio_replace_confirm_format_description({
              changes: changes.map((change) => FORMAT_CHANGE_LABELS[change]()).join(", "),
            })}
          </span>
        )}
        {elsewhere > 0 && (
          <span>{m.audio_replace_confirm_elsewhere_description({ count: elsewhere })}</span>
        )}
        <span className="flex flex-wrap gap-1 select-text">
          {replacement.sounds.map((sound) => (
            <Code key={sound.id}>{m.audio_replace_sound_label({ id: String(sound.id) })}</Code>
          ))}
        </span>
      </Stack>
    ),
    confirmLabel: m.audio_replace_confirm_action(),
    tone: "warning" as const,
  };
}
