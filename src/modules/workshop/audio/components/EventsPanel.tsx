import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  AlertBox,
  Code,
  ContextMenu,
  EmptyState,
  LoadingState,
  SearchField,
  SegmentedControl,
  Stack,
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
  type MediaLocation,
  type ObjectProperties,
} from "@/lib/tauri";

import { previewDocument } from "../../documents/utils/contentDocument";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useSandbox } from "../../sandbox/state/SandboxContext";
import { useOpenDocumentAs } from "../../state";
import { audioQueries } from "../api/queries";
import type { BankDocument } from "../hooks/useBankDocument";
import { useEventPlayer } from "../hooks/useEventPlayer";
import { useOpenSiteRow } from "../hooks/useOpenSiteRow";
import { useFocusMedia } from "../state/mediaFocus";
import {
  type EventRow,
  eventKey,
  eventLabel,
  eventRows,
  eventVoices,
  fieldKey,
  filterEvents,
  nodeVoices,
  type RandomSource,
  sortEvents,
  type TreeState,
} from "../utils/eventTree";
import {
  containerOf,
  isEditable,
  rowObject,
  takesChild,
  type TreeEditing,
} from "../utils/treeEditing";
import { structureRow, treeSelection, voiceSelection } from "../utils/viewRows";
import { replayOf, type VoiceRow, voiceRows } from "../utils/voices";
import { AudioPanelTools } from "./AudioToolbar";
import { isPlayable } from "./EventRowParts";
import { EventTree } from "./EventTree";
import { NoticeBand } from "./NoticeBand";
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
 * An event's tree is fetched when the event expands or plays. Per "Event tree" and "Editing" in
 * docs/ux/AUDIO.md.
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
  const [view, setView] = useState<EventsView>("voices");
  const voices = view === "voices";

  const listed = useMemo(
    () => sortEvents(filterEvents(events.data?.list.events ?? [], filter)),
    [events.data, filter],
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
  const editing = useTreeEditing(bank, read);

  const treeStates = new Map<number, TreeState>();
  [...openEvents, ...probed].forEach((event, index) => {
    const query = read[index];
    if (query?.data) {
      treeStates.set(event.id, { kind: "ready", tree: query.data.tree });
    } else if (query?.error) {
      treeStates.set(event.id, { kind: "failed", message: errorSummary(query.error) });
    }
  });

  const shownProperties = editing?.properties ?? properties(read);
  const rows = voices ? [] : eventRows(listed, expanded, treeStates, shownProperties);
  const voiceList = voices
    ? voiceRows(listed, expanded, treeStates, {
        properties: shownProperties,
        editable: editing !== null,
      })
    : [];

  function expand(key: string, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /* The picker draws in the container's children row, so the row and the container open. */
  function openPicker(key: string | null) {
    if (key !== null) {
      expand(key, true);
      expand(fieldKey(key, "children"), true);
    }
    setAdding(key);
  }

  async function playEvent(key: string, event: number) {
    const { tree } = await queryClient.fetchQuery(
      audioQueries.event(sandbox, asset, version, event, revision),
    );
    player.play(key, eventVoices(tree, random));
  }

  async function play(row: EventRow) {
    if (!isPlayable(row)) return;

    if (row.kind === "event") {
      await playEvent(row.key, row.event.id);
      return;
    }
    if (row.kind === "action" && row.action.node !== null) {
      player.play(row.key, nodeVoices(row.action.node, random));
      return;
    }
    if (row.kind === "node") player.play(row.key, nodeVoices(row.node, random));
  }

  function playVoiceRow(row: VoiceRow) {
    if (row.kind === "event" && row.event.mediaCount > 0) void playEvent(row.key, row.event.id);
    if (row.kind === "chain" && row.chain.action.node !== null) {
      player.play(row.key, nodeVoices(row.chain.action.node, random));
    }
    if (row.kind === "voice") player.play(row.key, nodeVoices(row.line.voice.node, random));
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

  function copyRow(row: EventRow) {
    const copied = copiedText(row);
    if (copied !== null) void copy(copied.text, copied.label);
  }

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

  return (
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
          onSelect={setSelected}
          player={player}
          onPlay={playVoiceRow}
          onReplay={(row) => void replay(row)}
          onPreview={(key, media) => player.play(key, [{ media, delay: 0 }])}
          onCopy={(row) => {
            const shown = structureRow(row);
            if (shown !== null) copyRow(shown.row);
          }}
          editing={editing}
          files={events.data.list.files}
          onStructure={() => setView("structure")}
          menu={(row) => {
            const shown = structureRow(row);
            if (shown === null) return null;

            return (
              <EventMenu
                row={shown.row}
                parent={shown.parent}
                editing={editing}
                onCopy={copyRow}
                onAdd={openPicker}
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
          onSelect={setSelected}
          player={player}
          onPlay={(row) => void play(row)}
          onCopy={copyRow}
          editing={editing}
          adding={adding}
          onAdding={openPicker}
          menu={(row) => (
            <EventMenu
              row={row}
              parent={row.parent === null ? undefined : rows.find((r) => r.key === row.parent)}
              editing={editing}
              onCopy={copyRow}
              onAdd={openPicker}
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
 */
function useTreeEditing(
  bank: BankDocument,
  trees: readonly { readonly data?: AudioEventResponse }[],
): TreeEditing | null {
  const { state, revision, edit } = bank;
  const edited = useMemo(() => new Set(state?.edited ?? []), [state?.edited]);
  if (state === null || revision === null || !state.editable) return null;

  return { revision, properties: properties(trees), edited, edit };
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

/** Returns what Copy takes from `row`: an event's label, or the ID of an object. */
function copiedText(row: EventRow): { text: string; label: string } | null {
  if (row.kind === "event") {
    return { text: eventLabel(row.event), label: m.audio_event_name_label() };
  }
  if (row.kind === "action")
    return { text: String(row.action.id), label: m.audio_object_id_label() };
  if (row.kind === "node") return { text: String(row.node.id), label: m.audio_object_id_label() };
  return null;
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

interface EventMenuProps {
  readonly row: EventRow;
  readonly parent: EventRow | undefined;
  readonly editing: TreeEditing | null;
  readonly onCopy: (row: EventRow) => void;
  /** Opens the child picker on the row `key`. */
  readonly onAdd: (key: string) => void;
}

/**
 * The context menu of one row: the copies, Show media on a sound whose media is found, and the
 * child edits of an editable bank.
 */
function EventMenu({ row, parent, editing, onCopy, onAdd }: EventMenuProps) {
  const project = useOptionalProjectContext();
  const media = row.kind === "node" && row.node.kind === "sound" ? row.node.media : null;
  const container = containerOf(parent);
  const child = rowObject(row);
  const addable = row.kind === "node" && takesChild(row.node) && isEditable(editing, row.node.id);
  const removable = container !== null && child !== null && isEditable(editing, container.id);

  return (
    <>
      {editing !== null && addable && (
        <ContextMenu.Item onClick={() => onAdd(row.key)}>
          {m.audio_edit_add_child_action()}
        </ContextMenu.Item>
      )}
      {editing !== null && removable && (
        <ContextMenu.Item
          onClick={() => void editing.edit({ kind: "delete", object: child, parent: container.id })}
        >
          {m.audio_edit_remove_child_action()}
        </ContextMenu.Item>
      )}
      {row.kind === "event" && (
        <ContextMenu.Item onClick={() => onCopy(row)}>
          {m.audio_event_copy_name_action()}
        </ContextMenu.Item>
      )}
      {(row.kind === "action" || row.kind === "node") && (
        <ContextMenu.Item onClick={() => onCopy(row)}>
          {m.audio_event_copy_id_action()}
        </ContextMenu.Item>
      )}
      {media !== null && project !== null && <ShowMediaItem media={media} />}
      {row.kind === "event" && project !== null && <EventSiteItems event={row.event} />}
    </>
  );
}

/**
 * Show contextual rule, which opens the first rule that plays `event`, and Show in bank unit,
 * which opens the `events[i]` row of the unit that lists its name.
 *
 * Rendered only inside a project, which owns the editor tabs.
 */
function EventSiteItems({ event }: { event: AudioEvent }) {
  const openRow = useOpenSiteRow();
  const rule = event.contexts[0]?.row ?? null;
  const listed = event.listed;

  return (
    <>
      {rule !== null && rule.asset !== null && (
        <ContextMenu.Item onClick={() => openRow(rule)}>
          {m.audio_event_show_rule_action()}
        </ContextMenu.Item>
      )}
      {listed !== null && listed.asset !== null && (
        <ContextMenu.Item onClick={() => openRow(listed)}>
          {m.audio_event_show_in_unit_action()}
        </ContextMenu.Item>
      )}
    </>
  );
}

/**
 * Opens the document of the file that contains `media`, on its Media tab with the row selected.
 *
 * Rendered only inside a project, which owns the editor tabs.
 */
function ShowMediaItem({ media }: { media: MediaLocation }) {
  const open = useOpenDocumentAs();
  const focus = useFocusMedia();

  return (
    <ContextMenu.Item
      onClick={() => {
        focus(media.asset, media.source);
        open(previewDocument(media.asset, media.path), "default");
      }}
    >
      {m.audio_event_show_media_action()}
    </ContextMenu.Item>
  );
}
