import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AlertBox, Code, ContextMenu, EmptyState, SearchField } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import type { AssetRef, AudioEvent, AudioEventsResponse, MediaLocation } from "@/lib/tauri";

import { previewDocument } from "../../documents/utils/contentDocument";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useSandbox } from "../../sandbox/state/SandboxContext";
import { useOpenDocumentAs } from "../../state";
import { audioQueries } from "../api/queries";
import { useEventPlayer } from "../hooks/useEventPlayer";
import { useOpenSiteRow } from "../hooks/useOpenSiteRow";
import { useFocusMedia } from "../state/mediaFocus";
import {
  type EventRow,
  eventKey,
  eventLabel,
  eventRows,
  eventSounds,
  filterEvents,
  pickSounds,
  type RandomSource,
  sortEvents,
  type TreeState,
} from "../utils/eventTree";
import { EventTree, isPlayable } from "./EventTree";

interface EventsPanelProps {
  readonly asset: AssetRef;
  /** The source that a random container picks a child with. */
  readonly random?: RandomSource;
}

/**
 * The Events tab of an event bank: the filter, the notices about its bank set, and the event
 * tree with one player.
 *
 * An event's tree is fetched when the event expands or plays. Per "Event tree" in
 * docs/ux/AUDIO.md.
 */
export function EventsPanel({ asset, random = Math.random }: EventsPanelProps) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const queryClient = useQueryClient();
  const events = useQuery(audioQueries.events(sandbox, asset, version));
  const player = useEventPlayer();
  const copy = useCopyToClipboard();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const listed = useMemo(
    () => sortEvents(filterEvents(events.data?.list.events ?? [], filter)),
    [events.data, filter],
  );
  const openEvents = listed.filter((event) => expanded.has(eventKey(event.id)));
  const trees = useQueries({
    queries: openEvents.map((event) => audioQueries.event(sandbox, asset, version, event.id)),
  });

  const treeStates = new Map<number, TreeState>();
  openEvents.forEach((event, index) => {
    const query = trees[index];
    if (query?.data) {
      treeStates.set(event.id, { kind: "ready", tree: query.data });
    } else if (query?.error) {
      treeStates.set(event.id, { kind: "failed", message: errorSummary(query.error) });
    }
  });
  const rows = eventRows(listed, expanded, treeStates);

  function expand(key: string, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function play(row: EventRow) {
    if (!isPlayable(row)) return;

    if (row.kind === "event") {
      const tree = await queryClient.fetchQuery(
        audioQueries.event(sandbox, asset, version, row.event.id),
      );
      player.play(row.key, eventSounds(tree, random));
      return;
    }
    if (row.kind === "action" && row.action.node !== null) {
      player.play(row.key, pickSounds(row.action.node, random));
      return;
    }
    if (row.kind === "node") player.play(row.key, pickSounds(row.node, random));
  }

  function copyRow(row: EventRow) {
    const copied = copiedText(row);
    if (copied !== null) void copy(copied.text, copied.label);
  }

  const announcement =
    player.playing === null ? m.audio_stopped_label() : m.audio_event_playing_label();

  if (events.error) {
    return <EmptyState size="sm" title={m.audio_events_failed_empty()} />;
  }
  if (events.data === undefined) {
    return <EmptyState size="sm" title={m.audio_events_loading_label()} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-surface-700 px-2 py-1.5">
        <SearchField
          value={filter}
          onChange={setFilter}
          label={m.audio_events_filter_label()}
          clearLabel={m.audio_filter_clear_label()}
        />
        <span className="text-meta text-surface-400 select-none">
          {m.audio_events_total_label({ count: events.data.list.events.length })}
        </span>
      </div>
      <SetNotices response={events.data} />
      {events.data.list.events.length === 0 && (
        <EmptyState size="sm" title={m.audio_events_empty()} />
      )}
      {events.data.list.events.length > 0 && listed.length === 0 && (
        <EmptyState size="sm" title={m.audio_events_filtered_empty()} />
      )}
      {listed.length > 0 && (
        <EventTree
          rows={rows}
          expanded={expanded}
          onExpand={expand}
          selected={selected}
          onSelect={setSelected}
          player={player}
          onPlay={(row) => void play(row)}
          onCopy={copyRow}
          menu={(row) => <EventMenu row={row} onCopy={copyRow} />}
        />
      )}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
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

  return (
    <div className="flex flex-col gap-2 px-2 py-2 empty:hidden">
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
      {list.origin === "units" && missing.length > 0 && (
        <AlertBox tone="warning" title={m.audio_events_files_missing_title()}>
          <span className="flex flex-col gap-0.5 select-text">
            {missing.map((file) => (
              <Code key={file.path}>{file.path}</Code>
            ))}
          </span>
        </AlertBox>
      )}
    </div>
  );
}

/** The context menu of one row: the copies, and Show media on a sound whose media is found. */
function EventMenu({ row, onCopy }: { row: EventRow; onCopy: (row: EventRow) => void }) {
  const project = useOptionalProjectContext();
  const media = row.kind === "node" && row.node.kind === "sound" ? row.node.media : null;

  return (
    <>
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
 * Opens the document of the file that holds `media`, on its Media tab with the row selected.
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
