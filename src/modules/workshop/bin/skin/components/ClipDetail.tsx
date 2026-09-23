import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, use, useMemo } from "react";

import { Code } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentId, BinRow, GraphClip, KeyRef } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { AlsoCheck, FieldRows, None } from "../../classes/components/ClassCells";
import { useBinDocument } from "../../documents/hooks/useBinDocument";
import { useBinRead } from "../../documents/hooks/useBinRead";
import { nameHash } from "../../shared/utils/binHash";
import { nameColumn } from "../../shared/utils/textCut";
import { RowDocumentContext } from "../../tree/state/rowFold";
import { useHeldRows } from "../../tree/state/rowRegistry";
import {
  childCount,
  entryKeyHash,
  fieldHash,
  objectKey,
  PAGE_SIZE,
  rowKey,
} from "../../tree/utils/binRows";
import { Notice } from "../../vfx/preview/components/Notice";
import { skinQueries } from "../api/skinQueries";
import type { GraphSource } from "../hooks/useGraphSource";
import { SkinChoiceContext } from "../state/skinChoice";
import { playlistOf } from "../utils/skinScene";

/** `AnimationGraphData.mClipDataMap`, the map a clip's rows sit under. */
const CLIP_DATA_MAP = nameHash("mClipDataMap");

/** The share of a row past which the name column cuts its names. */
const NAME_CAP = "40%";

/** What the column holds beside a name, in pixels: the caret's gutter and the row's padding. */
const NAME_EXTRA = 16;

const NO_ROWS: readonly BinRow[] = [];

const NO_CLIPS: readonly GraphClip[] = [];

interface ClipDetailProps {
  /** Where the graph was read from. */
  readonly source: GraphSource;
  readonly clip: GraphClip;
}

/**
 * One clip's fields under its unfolded row, as the generic field rows draw any struct,
 * under the clips it plays.
 *
 * "The clips pane" in docs/ux/BIN_EDITOR.md. The rows are read out of the document that
 * declares the graph: the one the graph was asked through, or the linked file the read
 * found it in.
 */
export function ClipDetail({ source, clip }: ClipDetailProps) {
  const graph = useQuery(skinQueries.graph(source.document, source.graph));
  const linked = graph.data?.source ?? null;
  const clips = graph.data?.clips ?? NO_CLIPS;

  if (source.graph === null || source.document === null) return <None />;
  if (linked !== null) {
    return <LinkedClipFields asset={linked} graph={source.graph} clip={clip} clips={clips} />;
  }
  return <ClipFields document={source.document} graph={source.graph} clip={clip} clips={clips} />;
}

interface LinkedClipFieldsProps {
  readonly asset: AssetRef;
  readonly graph: string;
  readonly clip: GraphClip;
  readonly clips: readonly GraphClip[];
}

/** The clip's rows out of the linked file declaring the graph, held open beside the skin's own. */
function LinkedClipFields({ asset, graph, clip, clips }: LinkedClipFieldsProps) {
  const { state } = useBinDocument(asset, graph);
  if (state.status !== "open") {
    return <Notice text={m.workshop_bin_clip_graph_loading_label()} />;
  }
  return <ClipFields document={state.handle.document} graph={graph} clip={clip} clips={clips} />;
}

interface ClipFieldsProps {
  readonly document: BinDocumentId;
  readonly graph: string;
  readonly clip: GraphClip;
  /** Every clip of the graph, which a child chip unfolds its row out of. */
  readonly clips: readonly GraphClip[];
}

/**
 * The clip's own rows, found under the graph's `mClipDataMap` by the key the clip is
 * addressed by.
 *
 * Three reads: the graph's roots, the map's entries, the entry's fields. Each is one
 * page, and the map's entries cost what the map row says they do.
 */
function ClipFields({ document, graph, clip, clips }: ClipFieldsProps) {
  const root = objectKey(graph);
  const roots = useBinRead(
    document,
    useMemo(() => [{ key: root, rows: PAGE_SIZE }], [root]),
  );
  const map = roots.get(root)?.rows.find((row) => fieldHash(row.path) === CLIP_DATA_MAP);
  const mapKey = map === undefined ? null : rowKey(map);
  const entries = useBinRead(
    document,
    useMemo(() => (map === undefined ? [] : [{ key: rowKey(map), rows: childCount(map) }]), [map]),
  );
  const entry = (mapKey === null ? NO_ROWS : (entries.get(mapKey)?.rows ?? NO_ROWS)).find(
    (row) => entryKeyHash(row) === clip.hash,
  );
  const entryKey = entry === undefined ? null : rowKey(entry);
  const fields = useBinRead(
    document,
    useMemo(
      () => (entry === undefined ? [] : [{ key: rowKey(entry), rows: childCount(entry) }]),
      [entry],
    ),
  );
  const rows = entryKey === null ? NO_ROWS : (fields.get(entryKey)?.rows ?? NO_ROWS);
  useHeldRows(rows);
  const group = useMemo(() => ({ key: entryKey ?? "", rows }), [entryKey, rows]);
  const owner = entry?.value.type === "struct" ? entry.value.classHash : null;
  const column = useMemo(
    () =>
      ({
        "--name-width": nameColumn(
          rows.map((row) => row.name),
          NAME_EXTRA,
          NAME_CAP,
        ),
      }) as CSSProperties,
    [rows],
  );

  return (
    <RowDocumentContext value={document}>
      <AlsoCheck document={document} group={group}>
        <div
          data-ui="ClipDetail"
          className="flex flex-col gap-2 py-1.5 pl-5 font-mono text-mono-row"
          style={column}
        >
          {clip.children.length > 0 && <Plays clip={clip} clips={clips} />}
          {rows.length === 0 && mapKey !== null && entryKey !== null && <None />}
          {rows.length > 0 && <FieldRows rows={rows} owner={owner} />}
        </div>
      </AlsoCheck>
    </RowDocumentContext>
  );
}

/**
 * The clips this one plays, each a chip that unfolds that row and poses the preview with it.
 *
 * Decision 4 of docs/plans/animation-graph-table.md. A child the map does not hold is
 * drawn dim and jumps nowhere.
 */
function Plays({ clip, clips }: { clip: GraphClip; clips: readonly GraphClip[] }) {
  const choice = use(SkinChoiceContext);
  const pick = (hash: string) => {
    const child = clips.find((each) => each.hash === hash);
    if (child === undefined || choice === null) return;
    choice.expand("clips", child.hash);
    if (playlistOf(child, clips).length > 0) choice.setPicked(child.hash);
    choice.jumpTo("clips", child.hash);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-sans text-meta text-surface-400 select-none">
        {m.workshop_bin_clip_plays_label()}
      </span>
      {clip.children.map((child, at) => (
        <ChildChip
          key={`${at}:${child.hash}`}
          child={child}
          parameter={clip.parameters[at] ?? null}
          onPick={pick}
        />
      ))}
    </div>
  );
}

interface ChildChipProps {
  readonly child: KeyRef;
  /** The value a parametric clip plays the child at, and null under any other kind. */
  readonly parameter: number | null;
  readonly onPick: (hash: string) => void;
}

function ChildChip({ child, parameter, onPick }: ChildChipProps) {
  const label = (
    <>
      {child.name}
      {parameter !== null && <span className="ml-1 text-surface-500">{parameter}</span>}
    </>
  );
  if (!child.declared) {
    return <Code className="text-surface-500">{label}</Code>;
  }
  return (
    <button
      type="button"
      className="cursor-pointer rounded-sm text-left"
      onClick={(event) => {
        event.stopPropagation();
        onPick(child.hash);
      }}
    >
      {/* DS-CODE-CHIP */}
      <Code className={twMerge("hover:bg-surface-veil hover:text-surface-100")}>{label}</Code>
    </button>
  );
}
