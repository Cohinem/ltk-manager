import { useQueries } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { Combobox, Tooltip } from "@/components";
import { m } from "@/i18n";
import { assetVersion, useAssetVersions } from "@/lib/assetVersions";
import type { SetFile, SoundStream } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { NAME_COLUMN_CLASSES } from "../../shared/components/PropertyRowParts";
import { nameColumnCols, rowNameCols } from "../../shared/utils/propertyRows";
import { audioQueries } from "../api/queries";
import { useNodeNames } from "../state/nodeNames";
import { fileName } from "../utils/bankUnits";
import { objectLabel } from "../utils/eventTree";
import { type MediaCandidate, matchingMedia, mediaCandidates } from "../utils/mediaPicker";
import { eventStem, nodeName, type NodeNames } from "../utils/nodeNames";
import type { TreeEditing } from "../utils/treeEditing";
import type {
  ContainerNode,
  FieldCell,
  RowCells,
  VoiceCell,
  VoiceGroup,
  VoiceLine,
  VoiceRow,
} from "../utils/voices";
import { FieldValue } from "./FieldRows";
import { NamedId, Status } from "./RowContent";

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

/** Returns the name of the kind of a container, as a header names it. */
export function containerLabel(container: ContainerNode, weighted: boolean): string {
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

/** Returns the name of the switch state of `group`, or null for a header outside a switch. */
function stateLabel(group: VoiceGroup): string | null {
  const state = group.state?.state;
  if (state === undefined) return null;
  if (state.kind === "default") return m.audio_voices_switch_default_label();

  return m.audio_voices_switch_state_label({ index: String(state.child + 1) });
}

/** The text of a header's name cell: the muted wrapper names and the header's own name. */
export interface GroupText {
  /** The names of the containers that the header folds, joined, or null if it folds none. */
  readonly wrappers: string | null;
  readonly name: string;
}

/**
 * Returns the text of the header of `group`.
 *
 * A header of a Play action that plays a sound is named after the sound. A header of a switch state
 * names the state, then the kind of its container unless the container is the switch. `stem` is
 * the stem that the header draws before its kind, or null. Per "Group headers" in docs/ux/AUDIO.md.
 */
export function groupText(
  group: VoiceGroup,
  names: NodeNames,
  stem: string | null,
  weighted: boolean,
): GroupText {
  const wrappers =
    group.wrappers.length === 0
      ? null
      : group.wrappers.map((wrapper) => containerLabel(wrapper, false)).join(" / ");
  const { container } = group;
  if (container === null) {
    const target = group.play.node;
    return { wrappers, name: target === null ? "" : nodeName(names, target) };
  }

  const kind = containerLabel(container, weighted);
  const own = stem === null ? kind : m.audio_node_derived_label({ stem, role: kind });
  const state = stateLabel(group);
  if (state === null) return { wrappers, name: own };
  if (container === group.state?.switch) return { wrappers, name: state };

  return { wrappers, name: m.audio_voices_state_header_label({ state, name: own }) };
}

/**
 * Returns the stem that each header of `rows` draws before its kind.
 *
 * A header draws the stem of its container's derived name unless the nearest header above it, or
 * else its event, has the same stem.
 */
export function headerStems(
  rows: readonly VoiceRow[],
  names: NodeNames,
): Map<string, string | null> {
  const inherited = new Map<string, string | null>();
  const shown = new Map<string, string | null>();
  for (const row of rows) {
    if (row.kind === "event") {
      inherited.set(row.key, row.event.name === null ? null : eventStem(row.event.name));
      continue;
    }
    if (row.kind !== "group") continue;

    const above = row.parent === null ? null : (inherited.get(row.parent) ?? null);
    const container = row.group.container;
    const own = container === null ? null : (names.stems.get(container.id) ?? null);
    shown.set(row.key, own !== null && own.toLowerCase() !== above?.toLowerCase() ? own : null);
    inherited.set(row.key, own ?? above);
  }
  return shown;
}

/** The characters that the play button takes in the name cell of a voice row. */
const PLAY_COLS = 3;

/** The characters that the voice count of a header takes, such as `12 voices`. */
const COUNT_COLS = 10;

/** Returns the width of the name column over the header and voice rows of `rows`. */
export function voiceNameColumns(rows: readonly VoiceRow[], names: NodeNames): number {
  const stems = headerStems(rows, names);
  const widths: number[] = [];
  for (const row of rows) {
    if (row.kind === "group") {
      const text = groupText(row.group, names, stems.get(row.key) ?? null, row.weighted);
      widths.push(rowNameCols(row.depth, text.name, [text.wrappers ?? ""]) + COUNT_COLS);
    }
    if (row.kind !== "voice") continue;

    const { node } = row.line.voice;
    const media = node.kind === "sound" && node.media !== null ? fileName(node.media.path) : "";
    const parts = [nodeName(names, node), objectLabel(node.id), media];
    widths.push(rowNameCols(row.depth, "", parts) + PLAY_COLS);
  }

  return nameColumnCols(widths);
}

interface GroupNameProps {
  readonly group: VoiceGroup;
  readonly text: GroupText;
  /** The guides and the caret before the name. */
  readonly lead: ReactNode;
  /** `true` if the arrows reached the name cell. */
  readonly active: boolean;
}

/**
 * The name cell of a header row: the muted names of the containers it folds, its own name, the
 * voice count, and the delay of the header of a Play action.
 *
 * The tooltip gives the name and the ID of the header's container.
 */
export function GroupName({ group, text, lead, active }: GroupNameProps) {
  const names = useNodeNames();
  const owner = group.container ?? group.play.node;
  const delay = group.actionHeader && group.play.delay > 0 ? group.play.delay : null;
  const title =
    owner === null
      ? null
      : m.audio_node_named_label({
          name: nodeName(names, owner),
          id: String(owner.id),
        });
  const name = <span className="truncate font-medium text-surface-200">{text.name}</span>;

  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5 self-stretch",
        NAME_COLUMN_CLASSES,
      )}
    >
      {lead}
      <span
        className={twMerge(
          "flex min-w-0 items-baseline gap-1.5 px-0.5",
          active && ACTIVE_CELL_CLASSES,
        )}
      >
        {text.wrappers !== null && (
          <span className="shrink-0 text-meta text-surface-400">{`${text.wrappers} /`}</span>
        )}
        {title === null && name}
        {title !== null && <Tooltip content={title}>{name}</Tooltip>}
        <span className="shrink-0 text-meta text-surface-400">
          {m.audio_voices_count_label({ count: group.count })}
        </span>
        {delay !== null && (
          <span className="shrink-0 text-meta text-surface-400">
            {m.audio_voices_delay_label({ ms: String(delay) })}
          </span>
        )}
      </span>
    </span>
  );
}

interface VoiceNameProps {
  readonly line: VoiceLine;
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
 * The name cell of a voice row: the sound's name and ID, and the file name of its media.
 *
 * A voice whose media is missing, or that does not play, is greyed and shows the reason.
 */
export function VoiceName({ line, lead, active, picker, onSwap, column = true }: VoiceNameProps) {
  const { node } = line.voice;

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
          <VoiceLabel node={node} />
        </span>
      )}
    </span>
  );
}

/** The name and ID of a voice's sound, and the file name of the file that holds its media. */
function VoiceLabel({ node }: { node: VoiceLine["voice"]["node"] }) {
  const names = useNodeNames();
  switch (node.kind) {
    case "sound":
      if (node.media === null) {
        return (
          <>
            <NamedId name={nodeName(names, node)} id={node.id} muted />
            <Status tone="warning">{m.audio_event_media_missing_label()}</Status>
          </>
        );
      }
      return (
        <>
          <NamedId name={nodeName(names, node)} id={node.id} />
          <span className="truncate text-meta text-surface-400 select-text">
            {fileName(node.media.path)}
          </span>
        </>
      );
    case "missing":
      return <Status tone="warning">{m.audio_node_missing_label({ id: String(node.id) })}</Status>;
    case "unsupported":
      return (
        <>
          <NamedId name={nodeName(names, node)} id={node.id} muted />
          <span className="shrink-0 text-meta text-surface-400">
            {node.music ? m.audio_node_music_hint() : m.audio_node_unsupported_hint()}
          </span>
        </>
      );
  }
}

interface VoiceCellsProps {
  readonly cells: RowCells;
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
 * The field cells of a voice or header row, each a knob and its value, in the columns of its event.
 *
 * A column that the row has no value for stays empty, so the cells of an event line up.
 */
export function VoiceCells({
  cells: line,
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

/** Returns the label of `candidate` in the picker: its derived or file name and its source ID. */
function candidateLabel(candidate: MediaCandidate): string {
  return m.audio_voices_media_option({
    name: candidate.title ?? candidate.name,
    id: String(candidate.media.source),
  });
}

/**
 * The inline picker of the media that a voice plays: the media of the bank set that its sound can
 * read, filtered by derived name, source ID or file name as the text is typed.
 *
 * A candidate shows its derived name, its source ID and the file name of the file that holds it.
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
  const names = useNodeNames();
  const found = files.flatMap((file) =>
    file.asset !== null && file.state.kind === "found" ? [{ file, asset: file.asset }] : [],
  );
  const reads = useQueries({
    queries: found.map(({ asset }) => audioQueries.media(asset, assetVersion(versions, asset))),
  });
  const [query, setQuery] = useState("");
  const held = found.map(({ file }, at) => ({ file, media: reads[at]?.data ?? [] }));
  const matches = matchingMedia(mediaCandidates(held, stream, names), query, current ?? -1);

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
              <span className="min-w-0 flex-1 truncate">{candidate.title ?? candidate.name}</span>
              <span className="shrink-0 font-mono text-code text-surface-400">
                {objectLabel(candidate.media.source)}
              </span>
              {candidate.title !== null && (
                <span className="shrink-0 text-meta text-surface-400">{candidate.name}</span>
              )}
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>{m.audio_voices_media_empty()}</Combobox.Empty>
      </Combobox.Content>
    </Combobox.Root>
  );
}
