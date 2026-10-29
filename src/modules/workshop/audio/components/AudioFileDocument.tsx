import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";

import { AlertBox, Code, EmptyState, Properties, Property, SearchField, Tabs } from "@/components";
import { m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import type { AssetRef, AudioContainer, AudioInfo, BankFacts, MediaRow } from "@/lib/tauri";
import { formatBytes } from "@/utils/formatBytes";

import { useAssetInfo } from "../../preview/api/useAssetInfo";
import { DocumentFrame } from "../../shared/components/DocumentFrame";
import { audioQueries } from "../api/queries";
import { useMediaActions } from "../hooks/useMediaActions";
import { useMediaPlayer } from "../hooks/useMediaPlayer";
import { filterRows, type MediaSort, sortRows } from "../utils/mediaRows";
import { MediaTable } from "./MediaTable";

interface AudioFileDocumentProps {
  readonly asset: AssetRef;
  /** The file name, which the document resolved. A reference may hold a hash. */
  readonly name: string;
}

const CONTAINER_LABELS: Record<AudioContainer, () => string> = {
  package: m.audio_container_package_label,
  bank: m.audio_container_bank_label,
  media: m.audio_container_media_label,
};

/**
 * A Wwise package, bank or WEM: its header facts, the reason the client rejects it, and the
 * table of its media.
 *
 * A bank with a hierarchy adds an Events tab, which shows the event count and opens first in a
 * bank without media. Per "The audio file document" in docs/ux/AUDIO.md.
 */
export function AudioFileDocument({ asset, name }: AudioFileDocumentProps) {
  const info = useAssetInfo(asset);
  const audio = info.data?.kind === "audio" ? info.data : null;
  const eventCount = audio?.bank?.eventCount ?? null;

  return (
    <DocumentFrame data-ui="AudioFileDocument">
      <div className="flex flex-col gap-3 border-b border-surface-700 px-4 py-3">
        <AudioHeadline name={name} audio={audio} />
        {audio !== null && <AudioNotices audio={audio} />}
        {audio?.bank && <BankFactRows bank={audio.bank} />}
      </div>
      {eventCount === null && <MediaPanel asset={asset} name={name} />}
      {eventCount !== null && (
        <Tabs.Root
          defaultValue={audio?.mediaCount === 0 ? "events" : "media"}
          className="min-h-0 flex-1"
        >
          <Tabs.List className="px-2">
            <Tabs.Tab value="media">{m.audio_tab_media_label()}</Tabs.Tab>
            <Tabs.Tab value="events">{m.audio_tab_events_label()}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="media" className="flex min-h-0 flex-1 flex-col">
            <MediaPanel asset={asset} name={name} />
          </Tabs.Panel>
          <Tabs.Panel value="events" className="px-4 py-3 text-meta text-surface-400">
            {m.audio_events_count_description({ count: eventCount })}
          </Tabs.Panel>
        </Tabs.Root>
      )}
    </DocumentFrame>
  );
}

/** The file name, its kind, its media count and its size, on one line. */
function AudioHeadline({ name, audio }: { name: string; audio: AudioInfo | null }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-row">
      <span className="font-medium text-surface-100 select-text">{name}</span>
      {audio !== null && (
        <>
          <span className="text-meta text-surface-400 select-none">
            {CONTAINER_LABELS[audio.container]()}
          </span>
          <span className="text-meta text-surface-400 select-none">
            {m.audio_media_count_label({ count: audio.mediaCount })}
          </span>
          <span className="font-mono text-meta text-code text-surface-400">
            {formatBytes(audio.sizeBytes)}
          </span>
        </>
      )}
    </div>
  );
}

/** The read failure, the rejection and the header ID mismatch of a file, each as a notice. */
function AudioNotices({ audio }: { audio: AudioInfo }) {
  const bank = audio.bank;
  const mismatch = bank !== null && bank.nameId !== null && bank.nameId !== bank.headerId;

  return (
    <>
      {audio.failure !== null && (
        <AlertBox tone="danger" title={m.audio_read_failure_title()}>
          <span className="select-text">{audio.failure}</span>
        </AlertBox>
      )}
      {bank?.rejection != null && (
        <AlertBox tone="warning" title={m.audio_rejection_title()}>
          <span className="select-text">{bank.rejection}</span>
        </AlertBox>
      )}
      {mismatch && (
        <AlertBox tone="info">
          {m.audio_id_mismatch_description({
            header: String(bank.headerId),
            name: String(bank.nameId),
          })}
        </AlertBox>
      )}
    </>
  );
}

/** The `BKHD` facts of a bank as label and value rows. */
function BankFactRows({ bank }: { bank: BankFacts }) {
  return (
    <Properties className="text-meta">
      <Property label={m.audio_fact_version_label()}>
        <Code>{bank.version}</Code>
      </Property>
      <Property label={m.audio_fact_bank_type_label()}>
        <Code>{bank.bankType}</Code>
      </Property>
      <Property label={m.audio_fact_alignment_label()}>
        <Code>{bank.alignment}</Code>
      </Property>
      <Property label={m.audio_fact_header_id_label()}>
        <Code>{bank.headerId}</Code>
      </Property>
      {bank.nameId !== null && (
        <Property label={m.audio_fact_name_id_label()}>
          <Code>{bank.nameId}</Code>
        </Property>
      )}
    </Properties>
  );
}

/** The filter, the table of media and the one `<audio>` element that plays them. */
function MediaPanel({ asset, name }: AudioFileDocumentProps) {
  const version = useAssetVersion(asset);
  const media = useQuery(audioQueries.media(asset, version));
  const player = useMediaPlayer(asset);
  const actions = useMediaActions(asset, name);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<MediaSort | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo(
    () => sortRows(filterRows(media.data ?? [], filter), sort),
    [media.data, filter, sort],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-surface-700 px-2 py-1.5">
        <SearchField
          value={filter}
          onChange={setFilter}
          label={m.audio_filter_label()}
          clearLabel={m.audio_filter_clear_label()}
        />
      </div>
      <MediaBody
        media={media.data}
        failed={media.error !== null}
        rows={rows}
        filtered={filter.trim() !== ""}
      >
        <MediaTable
          rows={rows}
          sort={sort}
          onSort={setSort}
          selected={selected}
          onSelect={setSelected}
          player={player}
          actions={actions}
        />
      </MediaBody>
      <audio ref={player.element} hidden onEnded={player.onEnded} onError={player.onError} />
      <span aria-live="polite" className="sr-only">
        {player.playing === null
          ? m.audio_stopped_label()
          : m.audio_playing_label({ source: String(player.playing) })}
      </span>
    </div>
  );
}

interface MediaBodyProps {
  readonly media: MediaRow[] | undefined;
  readonly failed: boolean;
  readonly rows: readonly MediaRow[];
  readonly filtered: boolean;
  readonly children: ReactNode;
}

/** The table, or the state that stands in for it while it reads, fails or is empty. */
function MediaBody({ media, failed, rows, filtered, children }: MediaBodyProps) {
  if (failed) return <EmptyState size="sm" title={m.audio_media_failed_empty()} />;
  if (media === undefined) return <EmptyState size="sm" title={m.audio_media_loading_label()} />;
  if (media.length === 0) return <EmptyState size="sm" title={m.audio_media_empty()} />;
  if (rows.length === 0 && filtered) {
    return <EmptyState size="sm" title={m.audio_media_filtered_empty()} />;
  }
  return children;
}
