import { CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import { useQueries } from "@tanstack/react-query";
import { Fragment, type ReactNode, useState } from "react";

import { Button, Combobox, Tooltip } from "@/components";
import { m } from "@/i18n";
import { assetVersion, useAssetVersions } from "@/lib/assetVersions";
import type { SetFile, SoundStream } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { NAME_COLUMN_CLASSES } from "../../shared/components/PropertyRowParts";
import { nameColumnCols, rowNameCols } from "../../shared/utils/propertyRows";
import { audioQueries } from "../api/queries";
import { fileName } from "../utils/bankUnits";
import { objectLabel } from "../utils/eventTree";
import { type MediaCandidate, matchingMedia, mediaCandidates } from "../utils/mediaPicker";
import type { TreeEditing } from "../utils/treeEditing";
import type {
  ChainSegment,
  ContainerNode,
  FieldCell,
  VoiceCell,
  VoiceLine,
  VoiceRow,
  VoiceStep,
} from "../utils/voices";
import { FieldValue } from "./FieldRows";
import { nodeTitle, Status } from "./RowContent";

/** The room each field cell takes, so the cells of a list line up. */
const CELL_WIDTHS: Record<FieldCell, string> = {
  volume: "w-24",
  pitch: "w-28",
  weight: "w-40",
  delay: "w-20",
  lpf: "w-24",
  hpf: "w-24",
};

/** The cells drawn with their name before the value, as their unit alone does not name them. */
const NAMED_CELLS: Partial<Record<FieldCell, () => string>> = {
  lpf: m.audio_edit_lpf_label,
  hpf: m.audio_edit_hpf_label,
};

/** The classes of the cell that the arrows reached, while the list has keyboard focus. */
const ACTIVE_CELL_CLASSES = "rounded-sm group-focus-visible/audio-list:bg-surface-veil";

/** Returns the name that a container takes on the chain line. */
function containerLabel(container: ContainerNode, weighted: boolean): string {
  switch (container.kind) {
    case "random":
      if (container.mode === "sequence") return m.audio_voices_sequence_label();
      return weighted ? m.audio_voices_random_weighted_label() : m.audio_voices_random_label();
    case "switch":
      if (container.pick.kind === "firstChild") return m.audio_voices_switch_first_label();
      return m.audio_voices_switch_label({ id: String(container.defaultSwitch) });
    case "layer":
      return m.audio_voices_layer_label();
    case "mixer":
      return m.audio_voices_mixer_label();
  }
}

/** Returns the name of one step of a voice's path. */
function stepLabel(step: VoiceStep): string {
  if (step.branch === "default") return m.audio_voices_switch_default_label();
  if (step.branch === "other") return m.audio_voices_switch_other_label();

  return containerLabel(step.container, false);
}

/** Returns the text before a voice's media that names the path to it. */
export function prefixText(prefix: readonly VoiceStep[]): string {
  return prefix.map(stepLabel).join(" / ");
}

/** The characters that the play button takes in the name cell of a voice row. */
const PLAY_COLS = 3;

/** Returns the width of the name column over the field and voice rows of `rows`. */
export function voiceNameColumns(rows: readonly VoiceRow[]): number {
  const widths: number[] = [];
  for (const row of rows) {
    if (row.kind === "field") widths.push(rowNameCols(row.depth, row.field.name, []));
    if (row.kind !== "voice") continue;

    const { node } = row.line.voice;
    const media = node.kind === "sound" && node.media !== null ? fileName(node.media.path) : "";
    const id = node.kind === "sound" ? objectLabel(node.source) : objectLabel(node.id);
    widths.push(rowNameCols(row.depth, prefixText(row.prefix), [media, id]) + PLAY_COLS);
  }

  return nameColumnCols(widths);
}

interface ChainLineProps {
  readonly segments: readonly ChainSegment[];
  /** Returns `true` if the fields of the object `id` are open. */
  readonly isOpen: (id: number) => boolean;
  /** Opens or closes the fields of the object `id`. */
  readonly onToggle: (id: number) => void;
  /** The index of the press that the arrows reached, or null while the row is not selected. */
  readonly active: number | null;
}

/**
 * The line between an event and its voices: the Play action, the containers of the run and the
 * voice count.
 *
 * The Play and each container are a press that opens the object's fields under the line.
 */
export function ChainLine({ segments, isOpen, onToggle, active }: ChainLineProps) {
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      {segments.map((segment, at) => (
        <Fragment key={at}>
          {at > 0 && (
            <CaretRightIcon
              aria-hidden
              weight="bold"
              className="size-3 shrink-0 text-surface-500"
            />
          )}
          <Segment segment={segment} isOpen={isOpen} onToggle={onToggle} active={active === at} />
        </Fragment>
      ))}
    </span>
  );
}

interface SegmentProps {
  readonly segment: ChainSegment;
  readonly isOpen: (id: number) => boolean;
  readonly onToggle: (id: number) => void;
  readonly active: boolean;
}

function Segment({ segment, isOpen, onToggle, active }: SegmentProps) {
  if (segment.kind === "count") {
    return (
      <span className="shrink-0 px-1 text-meta text-surface-400">
        {m.audio_voices_count_label({ count: segment.count })}
      </span>
    );
  }

  const id = segment.kind === "play" ? segment.action.id : segment.container.id;
  const label =
    segment.kind === "play"
      ? (segment.action.label ?? objectLabel(segment.action.id))
      : containerLabel(segment.container, segment.weighted);
  const title =
    segment.kind === "play" ? objectLabel(segment.action.id) : nodeTitle(segment.container);
  const delay = segment.kind === "play" && segment.delay > 0 ? segment.delay : null;

  return (
    <Tooltip content={title}>
      <Button
        variant="ghost"
        size="xs"
        tabIndex={-1}
        aria-pressed={isOpen(id)}
        className={twMerge(
          "h-5 shrink-0 px-1 text-row font-normal text-surface-200 aria-pressed:bg-accent-500/15 aria-pressed:text-accent-300",
          active && ACTIVE_CELL_CLASSES,
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(id);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {label}
        {delay !== null && (
          <span className="text-meta text-surface-400">
            {m.audio_voices_delay_label({ ms: String(delay) })}
          </span>
        )}
      </Button>
    </Tooltip>
  );
}

interface VoiceNameProps {
  readonly line: VoiceLine;
  readonly prefix: readonly VoiceStep[];
  /** The guides, the caret and the play button before the name. */
  readonly lead: ReactNode;
  /** `true` if the arrows reached the name cell. */
  readonly active: boolean;
  /** The media picker in place of the name, while it is open. */
  readonly picker: ReactNode;
  /** Opens the media picker on a double click. Absent if the source takes no edit. */
  readonly onSwap?: () => void;
  /** Takes the width of the name column of the list unless `false`. */
  readonly column?: boolean;
}

/**
 * The name cell of a voice row: the path prefix, the file name of the media and its source ID.
 *
 * A voice whose media is missing, or that does not play, is greyed and shows the reason.
 */
export function VoiceName({
  line,
  prefix,
  lead,
  active,
  picker,
  onSwap,
  column = true,
}: VoiceNameProps) {
  const { node } = line.voice;
  const prefixed = prefix.length > 0 ? prefixText(prefix) : null;

  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5 self-stretch",
        column && NAME_COLUMN_CLASSES,
      )}
    >
      {lead}
      {picker}
      {picker === null && (
        <span
          className={twMerge(
            "flex min-w-0 items-baseline gap-1.5 px-0.5",
            active && ACTIVE_CELL_CLASSES,
          )}
          onDoubleClick={(event) => {
            if (onSwap === undefined) return;

            event.stopPropagation();
            onSwap();
          }}
        >
          {prefixed !== null && (
            <span className="shrink-0 text-meta text-surface-400">{prefixed}</span>
          )}
          <VoiceLabel node={node} />
        </span>
      )}
    </span>
  );
}

function VoiceLabel({ node }: { node: VoiceLine["voice"]["node"] }) {
  switch (node.kind) {
    case "sound":
      if (node.media === null) {
        return (
          <>
            <span className="shrink-0 font-mono text-code text-surface-400 select-text">
              {objectLabel(node.source)}
            </span>
            <Status tone="warning">{m.audio_event_media_missing_label()}</Status>
          </>
        );
      }
      return (
        <>
          <span className="truncate text-surface-200 select-text">{fileName(node.media.path)}</span>
          <span className="shrink-0 font-mono text-meta text-code text-surface-400 select-text">
            {objectLabel(node.source)}
          </span>
        </>
      );
    case "missing":
      return <Status tone="warning">{m.audio_node_missing_label({ id: String(node.id) })}</Status>;
    case "unsupported":
      return (
        <>
          <span className="truncate text-surface-400">
            {m.audio_node_unsupported_label({ kind: node.kindName, id: String(node.id) })}
          </span>
          <span className="shrink-0 text-meta text-surface-400">
            {node.music ? m.audio_node_music_hint() : m.audio_node_unsupported_hint()}
          </span>
        </>
      );
  }
}

interface VoiceCellsProps {
  readonly line: VoiceLine;
  readonly editing: TreeEditing | null;
  /** The cell whose entry is open, or null. */
  readonly entering: FieldCell | null;
  readonly onEntering: (cell: FieldCell, open: boolean) => void;
  readonly onLeave: () => void;
  /** An edit of a cell landed. */
  readonly onCommitted: () => void;
  /** The cell that the arrows reached, or null while the row is not selected. */
  readonly active: VoiceCell | null;
}

/**
 * The field cells of a voice row, each a knob and its value, in the columns of its list.
 *
 * A column that the voice has no value for stays empty, so the cells of a list line up.
 */
export function VoiceCells({
  line,
  editing,
  entering,
  onEntering,
  onLeave,
  onCommitted,
  active,
}: VoiceCellsProps) {
  return (
    <>
      {line.columns.map((cell) => {
        if (cell === "media") return null;

        const field = line.fields.cells[cell];
        const named = NAMED_CELLS[cell];
        return (
          <span
            key={cell}
            className={twMerge(
              "flex shrink-0 items-center gap-1 px-0.5",
              CELL_WIDTHS[cell],
              active === cell && ACTIVE_CELL_CLASSES,
            )}
          >
            {field !== undefined && named !== undefined && (
              <span className="shrink-0 text-meta text-surface-400">{named()}</span>
            )}
            {field !== undefined && (
              <FieldValue
                field={field}
                editing={editing}
                entering={entering === cell}
                onEntering={(open) => onEntering(cell, open)}
                onLeave={onLeave}
                onCommitted={onCommitted}
                compact={named !== undefined}
              />
            )}
          </span>
        );
      })}
    </>
  );
}

interface MediaPickerProps {
  readonly files: readonly SetFile[];
  /** The stream type of the sound, whose files the picker lists, or null for a new sound. */
  readonly stream: SoundStream | null;
  /** The source ID that the sound plays, which the picker leaves out, or null. */
  readonly current: number | null;
  /** Plays a candidate before it is chosen. */
  readonly onPreview: (candidate: MediaCandidate) => void;
  readonly onPick: (candidate: MediaCandidate) => void;
  readonly onClose: () => void;
}

/** Returns the label of `candidate` in the picker: its file name and its source ID. */
function candidateLabel(candidate: MediaCandidate): string {
  return m.audio_voices_media_option({ name: candidate.name, id: String(candidate.media.source) });
}

/**
 * The inline picker of the media that a voice plays: the media of the bank set that its sound can
 * read, filtered by source ID or file name as the text is typed.
 *
 * A highlighted candidate plays. Enter picks the highlighted one and Escape closes the picker.
 */
export function MediaPicker({
  files,
  stream,
  current,
  onPreview,
  onPick,
  onClose,
}: MediaPickerProps) {
  const versions = useAssetVersions();
  const found = files.flatMap((file) =>
    file.asset !== null && file.state.kind === "found" ? [{ file, asset: file.asset }] : [],
  );
  const reads = useQueries({
    queries: found.map(({ asset }) => audioQueries.media(asset, assetVersion(versions, asset))),
  });
  const [query, setQuery] = useState("");
  const held = found.map(({ file }, at) => ({ file, media: reads[at]?.data ?? [] }));
  const matches = matchingMedia(mediaCandidates(held, stream), query, current ?? -1);

  return (
    <Combobox.Root<MediaCandidate>
      items={matches}
      filter={null}
      inputValue={query}
      onInputValueChange={setQuery}
      onItemHighlighted={(candidate, details) => {
        if (candidate !== undefined && details.reason !== "none") onPreview(candidate);
      }}
      onValueChange={(candidate) => candidate && onPick(candidate)}
      onOpenChange={(open, details) => {
        if (!open && details.reason !== "item-press") onClose();
      }}
      itemToStringLabel={candidateLabel}
      defaultOpen
    >
      <Combobox.Input
        size="xs"
        autoFocus
        aria-label={m.audio_voices_media_label()}
        placeholder={m.audio_voices_media_label()}
        className="w-56"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      />
      <Combobox.Content positionerClassName="min-w-(--anchor-width)" className="max-h-72">
        <Combobox.List>
          {(candidate: MediaCandidate) => (
            <Combobox.Item
              key={`${candidate.media.path}#${candidate.media.source}`}
              value={candidate}
              className="gap-2 pr-2"
            >
              <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              <span className="shrink-0 font-mono text-code text-surface-400">
                {objectLabel(candidate.media.source)}
              </span>
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>{m.audio_voices_media_empty()}</Combobox.Empty>
      </Combobox.Content>
    </Combobox.Root>
  );
}

/** The press of the add row, which opens the child picker of the chain's last container. */
export function AddVariation({ onAdd }: { onAdd: () => void }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      tabIndex={-1}
      left={<PlusIcon weight="bold" />}
      className="h-5 px-1 text-row font-normal text-surface-300"
      onClick={(event) => {
        event.stopPropagation();
        onAdd();
      }}
    >
      {m.audio_voices_add_action()}
    </Button>
  );
}
