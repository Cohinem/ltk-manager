import { DotsThreeVerticalIcon, InfoIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useRef, useState } from "react";

import {
  AlertBox,
  Code,
  EmptyState,
  IconButton,
  LoadingState,
  Menu,
  Popover,
  Properties,
  Property,
  SearchField,
  Stack,
  Tabs,
} from "@/components";
import { m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import type { AssetRef, AudioContainer, AudioInfo, MediaRow } from "@/lib/tauri";
import { formatBytes } from "@/utils/formatBytes";

import { useAssetInfo } from "../../preview/api/useAssetInfo";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { fileReferences, useFindReferences } from "../../references/api/useFindReferences";
import { useSandbox } from "../../sandbox/state/SandboxContext";
import { DocumentFrame } from "../../shared/components/DocumentFrame";
import { audioQueries } from "../api/queries";
import { type BankDocument, useBankDocument } from "../hooks/useBankDocument";
import { useMediaActions } from "../hooks/useMediaActions";
import { useMediaPlayer } from "../hooks/useMediaPlayer";
import { useMediaFocus } from "../state/mediaFocus";
import { filterRows, type MediaSort, sortRows } from "../utils/mediaRows";
import { AudioPanelTools, AudioToolbar, AudioToolsSlotContext, BankHistory } from "./AudioToolbar";
import { BankUnitMenu } from "./BankUnits";
import { EventsPanel } from "./EventsPanel";
import { MediaTable } from "./MediaTable";
import { NoticeBand } from "./NoticeBand";
import { MediaWaveform } from "./Waveform";

interface AudioFileDocumentProps {
  readonly asset: AssetRef;
  /** The file name, which the document resolved. A reference may contain a hash. */
  readonly name: string;
  /** The id of the tab, which takes the unsaved dot and the undo keys of an event bank. */
  readonly documentId?: string | null;
  /** This document is the one on screen. Only the active document's toolbar shows. */
  readonly active: boolean;
  /** The menu items of the tab that move the file out, listed in the kebab. */
  readonly fileActions?: ReactNode;
}

/** The two panels of a bank with a hierarchy. */
type AudioView = "media" | "events";

const CONTAINER_LABELS: Record<AudioContainer, () => string> = {
  package: m.audio_container_package_label,
  bank: m.audio_container_bank_label,
  media: m.audio_container_media_label,
};

/**
 * A Wwise package, bank or WEM: one toolbar, the notices about the file, and the table of its
 * media.
 *
 * A bank with a hierarchy adds an Events view with the event tree, which opens first in a bank
 * without media. A "Show media" request for the file switches to the Media view. The `BKHD`
 * facts open from the kebab. Per "The audio file document" in docs/ux/AUDIO.md.
 */
export function AudioFileDocument({
  asset,
  name,
  documentId = null,
  active,
  fileActions = null,
}: AudioFileDocumentProps) {
  const info = useAssetInfo(asset);
  const audio = info.data?.kind === "audio" ? info.data : null;
  const hierarchy = audio?.bank?.eventCount != null;
  const bank = useBankDocument(asset, documentId, hierarchy);
  const focus = useMediaFocus(asset);
  const [view, setView] = useState<AudioView | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [tools, setTools] = useState<HTMLSpanElement | null>(null);
  const shownView: AudioView = hierarchy ? (view ?? defaultView(audio)) : "media";

  if (focus !== null && focus.serial !== focused) {
    setFocused(focus.serial);
    setView("media");
  }

  return (
    <DocumentFrame data-ui="AudioFileDocument">
      <Tabs.Root
        value={shownView}
        onValueChange={(value) => setView(value as AudioView)}
        className="min-h-0 flex-1"
      >
        <AudioToolbar
          active={active}
          history={bank.state?.editable === true && <BankHistory bank={bank} />}
          views={hierarchy && <ViewSwitch />}
          toolsRef={setTools}
          unit={audio !== null && audio.container !== "media" && <BankUnitMenu asset={asset} />}
          menu={<AudioFileMenu asset={asset} audio={audio} fileActions={fileActions} />}
        />
        {audio !== null && <AudioNotices asset={asset} audio={audio} view={shownView} />}
        <AudioToolsSlotContext value={tools}>
          {!hierarchy && <MediaPanel asset={asset} name={name} />}
          {hierarchy && <ViewPanels asset={asset} name={name} bank={bank} />}
        </AudioToolsSlotContext>
      </Tabs.Root>
    </DocumentFrame>
  );
}

/** Returns the view that a bank with a hierarchy opens on: Events if it holds no media. */
function defaultView(audio: AudioInfo | null): AudioView {
  return audio?.mediaCount === 0 ? "events" : "media";
}

/** The Media and Events switch of a bank with a hierarchy. */
function ViewSwitch() {
  return (
    <Tabs.List variant="pills" aria-label={m.audio_views_label()} className="h-7 shrink-0">
      <Tabs.Tab value="media">{m.audio_tab_media_label()}</Tabs.Tab>
      <Tabs.Tab value="events">{m.audio_tab_events_label()}</Tabs.Tab>
    </Tabs.List>
  );
}

interface ViewPanelsProps {
  readonly asset: AssetRef;
  readonly name: string;
  readonly bank: BankDocument;
}

/** The Media and Events panels of a bank with a hierarchy, one shown at a time. */
function ViewPanels({ asset, name, bank }: ViewPanelsProps) {
  return (
    <>
      <Tabs.Panel value="media" className="flex min-h-0 flex-1 flex-col">
        <MediaPanel asset={asset} name={name} />
      </Tabs.Panel>
      <Tabs.Panel value="events" className="flex min-h-0 flex-1 flex-col">
        <EventsPanel asset={asset} bank={bank} />
      </Tabs.Panel>
    </>
  );
}

interface AudioFileMenuProps {
  readonly asset: AssetRef;
  readonly audio: AudioInfo | null;
  readonly fileActions: ReactNode;
}

/**
 * The kebab of the file: the details popover, the tab's file actions, and Find references on
 * the game path that the bank units name the file by.
 *
 * Find references is listed only inside a project, which owns the References document.
 */
function AudioFileMenu({ asset, audio, fileActions }: AudioFileMenuProps) {
  const project = useOptionalProjectContext();
  const anchor = useRef<HTMLSpanElement>(null);
  const [details, setDetails] = useState(false);
  const detailsLabel =
    audio?.bank != null ? m.audio_details_bank_action() : m.audio_details_file_action();

  return (
    <span ref={anchor} className="inline-flex shrink-0">
      <Menu.Root>
        <Menu.Trigger
          render={
            <IconButton
              icon={<DotsThreeVerticalIcon />}
              aria-label={m.audio_file_actions_label()}
            />
          }
        />
        <Menu.Content align="end" sideOffset={4} className="w-60">
          <Menu.Item
            icon={<InfoIcon className="size-4" />}
            disabled={audio === null}
            /* The menu is still closing, and it takes focus back first. */
            onClick={() => setTimeout(() => setDetails(true), 0)}
          >
            {detailsLabel}
          </Menu.Item>
          {fileActions !== null && (
            <>
              <Menu.Separator />
              {fileActions}
            </>
          )}
          {project !== null && <FindReferencesItem asset={asset} />}
        </Menu.Content>
      </Menu.Root>
      {audio !== null && (
        <Popover.Root open={details} onOpenChange={setDetails}>
          <Popover.Content
            anchor={anchor}
            side="bottom"
            align="end"
            sideOffset={8}
            aria-label={detailsLabel}
            className="w-64 p-3"
            data-ui="AudioFileDocument:details"
          >
            <Stack gap={2}>
              <Popover.Title>{detailsLabel}</Popover.Title>
              <FileFacts audio={audio} />
            </Stack>
          </Popover.Content>
        </Popover.Root>
      )}
    </span>
  );
}

/** Find references on the game path that the bank units name the file by. */
function FindReferencesItem({ asset }: { asset: AssetRef }) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const references = useQuery(audioQueries.references(sandbox, asset, version));
  const findReferences = useFindReferences();
  const path = references.data?.path ?? null;

  return (
    <Menu.Item
      icon={<MagnifyingGlassIcon className="size-4" />}
      disabled={path === null}
      onClick={() => path !== null && findReferences(fileReferences(path))}
    >
      {m.audio_file_find_references_action()}
    </Menu.Item>
  );
}

/** The `BKHD` facts of a bank, then its size and media count, as label and value rows. */
function FileFacts({ audio }: { audio: AudioInfo }) {
  const bank = audio.bank;

  return (
    <Properties className="text-meta">
      {bank === null && (
        <Property label={m.audio_fact_kind_label()}>{CONTAINER_LABELS[audio.container]()}</Property>
      )}
      {bank !== null && (
        <>
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
            <Code className="select-text">{bank.headerId}</Code>
          </Property>
          {bank.nameId !== null && (
            <Property label={m.audio_fact_name_id_label()}>
              <Code className="select-text">{bank.nameId}</Code>
            </Property>
          )}
        </>
      )}
      <Property label={m.audio_fact_size_label()} className="tabular-nums">
        {formatBytes(audio.sizeBytes)}
      </Property>
      <Property label={m.audio_fact_media_label()} className="tabular-nums">
        {audio.mediaCount}
      </Property>
    </Properties>
  );
}

interface AudioNoticesProps {
  readonly asset: AssetRef;
  readonly audio: AudioInfo;
  readonly view: AudioView;
}

/**
 * The read failure, the rejection, the header ID mismatch and the building audio index of a
 * file, each as a notice.
 *
 * The Events view shows its own notice for the building index, so this one shows in the Media
 * view alone.
 */
function AudioNotices({ asset, audio, view }: AudioNoticesProps) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const named = audio.container !== "media";
  const references = useQuery({
    ...audioQueries.references(sandbox, asset, version),
    enabled: named,
  });

  const bank = audio.bank;
  const mismatch = bank !== null && bank.nameId !== null && bank.nameId !== bank.headerId;
  const building = named && view === "media" && references.data?.index.status === "building";
  if (audio.failure === null && bank?.rejection == null && !mismatch && !building) return null;

  return (
    <NoticeBand>
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
      {building && <AlertBox tone="info">{m.audio_units_index_building_description()}</AlertBox>}
    </NoticeBand>
  );
}

/** The filter and count in the toolbar, the table of media and the live region that names what plays. */
function MediaPanel({ asset, name }: { asset: AssetRef; name: string }) {
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
      <AudioPanelTools
        filter={
          <SearchField
            value={filter}
            onChange={setFilter}
            label={m.audio_filter_label()}
            clearLabel={m.audio_filter_clear_label()}
          />
        }
        count={media.data && m.audio_media_count_label({ count: media.data.length })}
      />
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
