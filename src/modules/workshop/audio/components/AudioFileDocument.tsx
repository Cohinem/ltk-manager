import { DotsThreeVerticalIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";

import {
  AlertBox,
  Code,
  EmptyState,
  IconButton,
  Inline,
  LoadingState,
  Menu,
  Properties,
  Property,
  SearchField,
  Stack,
  Tabs,
} from "@/components";
import { m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import type { AssetRef, AudioContainer, AudioInfo, BankFacts, MediaRow } from "@/lib/tauri";
import { formatBytes } from "@/utils/formatBytes";

import { useAssetInfo } from "../../preview/api/useAssetInfo";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { fileReferences, useFindReferences } from "../../references/api/useFindReferences";
import { useSandbox } from "../../sandbox/state/SandboxContext";
import { DocumentFrame } from "../../shared/components/DocumentFrame";
import { audioQueries } from "../api/queries";
import { useMediaActions } from "../hooks/useMediaActions";
import { useMediaPlayer } from "../hooks/useMediaPlayer";
import { useMediaFocus } from "../state/mediaFocus";
import { filterRows, type MediaSort, sortRows } from "../utils/mediaRows";
import { AudioToolbar } from "./AudioToolbar";
import { BankUnits } from "./BankUnits";
import { EventsPanel } from "./EventsPanel";
import { MediaTable } from "./MediaTable";
import { MediaWaveform } from "./Waveform";

interface AudioFileDocumentProps {
  readonly asset: AssetRef;
  /** The file name, which the document resolved. A reference may contain a hash. */
  readonly name: string;
  /** The id of the tab, which takes the unsaved dot and the undo keys of an event bank. */
  readonly documentId?: string | null;
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
 * A bank or a package lists the bank units that name it under its facts. A bank with a
 * hierarchy adds an Events tab with the event tree, which opens first in a bank without media.
 * A "Show media" request for the file switches to the Media tab. Per "The audio file document"
 * in docs/ux/AUDIO.md.
 */
export function AudioFileDocument({ asset, name, documentId = null }: AudioFileDocumentProps) {
  const info = useAssetInfo(asset);
  const audio = info.data?.kind === "audio" ? info.data : null;
  const eventCount = audio?.bank?.eventCount ?? null;
  const focus = useMediaFocus(asset);
  const [tab, setTab] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const shownTab = tab ?? (audio?.mediaCount === 0 ? "events" : "media");

  if (focus !== null && focus.serial !== focused) {
    setFocused(focus.serial);
    setTab("media");
  }

  return (
    <DocumentFrame data-ui="AudioFileDocument">
      <AudioHead>
        <AudioHeadline asset={asset} name={name} audio={audio} />
        {audio !== null && <AudioNotices audio={audio} />}
        {audio?.bank && <BankFactRows bank={audio.bank} />}
        {audio !== null && audio.container !== "media" && <BankUnits asset={asset} />}
      </AudioHead>
      {eventCount === null && <MediaPanel asset={asset} name={name} />}
      {eventCount !== null && (
        <Tabs.Root
          value={shownTab}
          onValueChange={(value) => setTab(String(value))}
          className="min-h-0 flex-1"
        >
          <Tabs.List className="px-2">
            <Tabs.Tab value="media">{m.audio_tab_media_label()}</Tabs.Tab>
            <Tabs.Tab value="events">{m.audio_tab_events_label()}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="media" className="flex min-h-0 flex-1 flex-col">
            <MediaPanel asset={asset} name={name} />
          </Tabs.Panel>
          <Tabs.Panel value="events" className="flex min-h-0 flex-1 flex-col">
            <EventsPanel asset={asset} documentId={documentId} />
          </Tabs.Panel>
        </Tabs.Root>
      )}
    </DocumentFrame>
  );
}

interface AudioHeadlineProps {
  readonly asset: AssetRef;
  readonly name: string;
  readonly audio: AudioInfo | null;
}

/** The head of the document over its tabs, ruled off from them. */
function AudioHead({ children }: { children: ReactNode }) {
  return (
    <div
      data-ui="AudioFileDocument:head"
      className="shrink-0 border-b border-surface-700 px-4 py-3 text-row"
    >
      <Stack gap={3}>{children}</Stack>
    </div>
  );
}

/** The file name, its kind, its media count and its size on one line, then the file's menu. */
function AudioHeadline({ asset, name, audio }: AudioHeadlineProps) {
  const project = useOptionalProjectContext();

  return (
    <Inline gap={2} justify="between">
      <Inline gap={2} rowGap={1} wrap align="baseline">
        <span className="font-medium text-surface-100 select-text">{name}</span>
        {audio !== null && <AudioFacts audio={audio} />}
      </Inline>
      {project !== null && <AudioFileMenu asset={asset} />}
    </Inline>
  );
}

/** The kind, the media count and the size of a file, apart by middle dots. */
function AudioFacts({ audio }: { audio: AudioInfo }) {
  return (
    <span className="text-meta text-surface-400 tabular-nums">
      <Inline as="span" gap={2} align="baseline">
        <span className="select-none">{CONTAINER_LABELS[audio.container]()}</span>
        <FactDot />
        <span className="select-none">
          {m.audio_media_count_label({ count: audio.mediaCount })}
        </span>
        <FactDot />
        <span>{formatBytes(audio.sizeBytes)}</span>
      </Inline>
    </span>
  );
}

function FactDot() {
  return (
    <span aria-hidden className="select-none">
      ·
    </span>
  );
}

/** The kebab of the file: Find references on the game path that the bank units name it by. */
function AudioFileMenu({ asset }: { asset: AssetRef }) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const references = useQuery(audioQueries.references(sandbox, asset, version));
  const findReferences = useFindReferences();
  const path = references.data?.path ?? null;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            size="sm"
            icon={<DotsThreeVerticalIcon />}
            aria-label={m.audio_file_actions_label()}
          />
        }
      />
      <Menu.Content align="end" sideOffset={4} className="w-56">
        <Menu.Item
          icon={<MagnifyingGlassIcon className="size-4" />}
          disabled={path === null}
          onClick={() => path !== null && findReferences(fileReferences(path))}
        >
          {m.audio_file_find_references_action()}
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
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

/** The filter, the table of media and the live region that names what plays. */
function MediaPanel({ asset, name }: AudioFileDocumentProps) {
  const version = useAssetVersion(asset);
  const media = useQuery(audioQueries.media(asset, version));
  const player = useMediaPlayer(asset);
  const actions = useMediaActions(asset, name);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<MediaSort | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const focus = useMediaFocus(asset);
  const [focused, setFocused] = useState<number | null>(null);

  if (focus !== null && focus.serial !== focused) {
    setFocused(focus.serial);
    setSelected(focus.source);
    setFilter("");
  }

  const rows = useMemo(
    () => sortRows(filterRows(media.data ?? [], filter), sort),
    [media.data, filter, sort],
  );
  const announcement =
    player.playing === null
      ? m.audio_stopped_label()
      : m.audio_playing_label({ source: String(player.playing) });

  return (
    <Stack fill>
      <AudioToolbar>
        <SearchField
          value={filter}
          onChange={setFilter}
          label={m.audio_filter_label()}
          clearLabel={m.audio_filter_clear_label()}
        />
      </AudioToolbar>
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
      {media.data !== undefined && media.data.length > 0 && (
        <MediaWaveform player={player} rows={media.data} selected={selected} />
      )}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Stack>
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
  if (media === undefined) return <LoadingState />;
  if (media.length === 0) return <EmptyState size="sm" title={m.audio_media_empty()} />;
  if (rows.length === 0 && filtered) {
    return <EmptyState size="sm" title={m.audio_media_filtered_empty()} />;
  }
  return children;
}
