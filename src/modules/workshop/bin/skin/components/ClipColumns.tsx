import { WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, use } from "react";

import { Code, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { GraphClip, KeyRef } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { skinQueries } from "../api/skinQueries";
import { type ClipTab, SkinChoiceContext } from "../state/skinChoice";

/** The suffix every kind of `ClipBaseData` carries, which the kind chip drops. */
const KIND_SUFFIX = "ClipData";

/** One column of the clip table: what its header says, how wide, and what its cell draws. */
export interface Column {
  readonly key: string;
  readonly label: () => string;
  readonly width: string;
  readonly draw: (clip: GraphClip) => ReactNode;
  readonly value: (clip: GraphClip) => string | number | undefined;
  /** The column is drawn only while some clip holds a value for it. */
  readonly holds?: (clip: GraphClip) => boolean;
}

/** The clip table's columns in order, decision 3 of docs/plans/animation-graph-table.md. */
export const COLUMNS: readonly Column[] = [
  {
    key: "name",
    label: m.workshop_bin_clip_column_name_label,
    width: "w-64 grow",
    value: (clip) => clip.name,
    draw: (clip) => <NameCell clip={clip} />,
  },
  {
    key: "rate",
    label: m.workshop_bin_clip_column_rate_label,
    width: "w-16",
    value: (clip) =>
      clip.tickDuration !== null && clip.tickDuration > 0 ? 1 / clip.tickDuration : undefined,
    draw: (clip) => <RateCell clip={clip} />,
  },
  {
    key: "track",
    label: m.workshop_bin_clip_column_track_label,
    width: "w-32",
    value: (clip) => clip.track?.name,
    draw: (clip) => <KeyChip tab="tracks" keyRef={clip.track} />,
  },
  {
    key: "mask",
    label: m.workshop_bin_clip_column_mask_label,
    width: "w-32",
    value: (clip) => clip.mask?.name,
    draw: (clip) => <KeyChip tab="masks" keyRef={clip.mask} />,
    holds: (clip) => clip.mask !== null,
  },
  {
    key: "syncGroup",
    label: m.workshop_bin_clip_column_sync_group_label,
    width: "w-32",
    value: (clip) => clip.syncGroup?.name,
    draw: (clip) => <KeyChip tab="syncGroups" keyRef={clip.syncGroup} />,
    holds: (clip) => clip.syncGroup !== null,
  },
  {
    key: "events",
    label: m.workshop_bin_clip_column_events_label,
    width: "w-16",
    value: (clip) => clip.events.length,
    draw: (clip) => (
      <span className={twMerge("tabular-nums", clip.events.length === 0 && "text-surface-500")}>
        {clip.events.length}
      </span>
    ),
  },
];

/**
 * The columns the table draws over `clips`: every one, less those no clip holds a value for.
 *
 * Most graphs name a mask or a sync group on a handful of clips or on none, and a column
 * of nothing costs the width the names want.
 */
export function shownColumns(clips: readonly GraphClip[]): readonly Column[] {
  return COLUMNS.filter((column) => column.holds === undefined || clips.some(column.holds));
}

/** The kind a clip's class reads as: the class name without its suffix, or the bare hash. */
export function clipKind(clip: Pick<GraphClip, "class">): string {
  if (clip.class.endsWith(KIND_SUFFIX)) return clip.class.slice(0, -KIND_SUFFIX.length);
  return clip.class;
}

/** The clip's name, and the kind of clip it is as a chip after it. */
function NameCell({ clip }: { clip: GraphClip }) {
  return (
    <>
      <span
        className={twMerge(
          "min-w-0 truncate select-text",
          clip.name === clip.hash ? "text-surface-400" : "text-surface-200",
        )}
      >
        {clip.name}
      </span>
      {/* DS-CODE-CHIP */}
      <Code className="shrink-0 text-surface-400">{clipKind(clip)}</Code>
    </>
  );
}

/**
 * A key into one of the graph's maps, as a chip that jumps to the entry's row on its tab.
 *
 * Decision 18 of docs/plans/animation-graph-table.md: a key the map does not declare is
 * drawn as missing, and no rule is raised for it.
 */
function KeyChip({ tab, keyRef }: { tab: ClipTab; keyRef: KeyRef | null }) {
  const choice = use(SkinChoiceContext);
  if (keyRef === null) return null;

  const chip = (
    <button
      type="button"
      className="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm text-left"
      onClick={(event) => {
        event.stopPropagation();
        choice?.jumpTo(tab, keyRef.hash);
      }}
    >
      {/* DS-CODE-CHIP */}
      <Code
        className={twMerge(
          "min-w-0 truncate hover:bg-surface-veil hover:text-surface-100",
          !keyRef.declared && "text-surface-400",
        )}
      >
        {keyRef.name}
      </Code>
      {!keyRef.declared && (
        <WarningCircleIcon weight="bold" className="h-3.5 w-3.5 shrink-0 text-warning-text" />
      )}
    </button>
  );
  if (keyRef.declared) return chip;
  return <Tooltip content={m.workshop_bin_clip_undeclared_key_description()}>{chip}</Tooltip>;
}

/**
 * The clip's rate as `file / tick`: the `.anm`'s frames per second, and the ticks a second
 * `mTickDuration` makes.
 *
 * Decision 15 of docs/plans/animation-graph-table.md: the header is read for the rows on
 * screen alone, which the window bounds. A clip nothing holds draws a dash.
 */
function RateCell({ clip }: { clip: GraphClip }) {
  const asset = clip.animation?.asset ?? null;
  const header = useQuery(skinQueries.clipHeader(asset));
  if (clip.animation === null) return null;

  const tick = clip.tickDuration === null || clip.tickDuration <= 0 ? null : 1 / clip.tickDuration;
  const right = tick === null ? "" : `/${Math.round(tick)}`;
  const fps = header.data?.fps ?? null;
  if (asset === null || header.error !== null || (header.data !== undefined && fps === null)) {
    return <span className="text-surface-500">-{right}</span>;
  }
  if (fps === null) return <span className="text-surface-500">{right}</span>;
  return (
    <span className="text-surface-300 tabular-nums">
      {Math.round(fps)}
      {right}
    </span>
  );
}
