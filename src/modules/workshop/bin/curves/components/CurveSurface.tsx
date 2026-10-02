import { WaveSineIcon } from "@phosphor-icons/react";
import { use, useEffect, useMemo, useState } from "react";

import { OVERLINE } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { rowKey } from "../../tree/utils/binRows";
import { ownField } from "../../values/components/RowValue";
import { useValueMarks, ValueMarksContext } from "../../values/hooks/useValueMarks";
import { fieldUnit } from "../../values/utils/fieldUnits";
import type { CurveKey, ValueMark } from "../../values/utils/valueRows";
import { useEmitters } from "../../vfx/inspector/state/emitterChoice";
import { emitterChain, emitterRows, fieldChain } from "../../vfx/inspector/utils/emitterCards";
import { useCurvePlayhead } from "../hooks/curvePlayhead";
import { type CurveTab, useCurveDock } from "../state/curveTarget";
import { RandomEditContext, useRandomEditor } from "../state/randomEdit";
import {
  commitCurveKey,
  moveCurveKey,
  movedKeys,
  CURVE_DYNAMICS,
  insertionIndex,
  insertCurveKey,
  removeCurveKeys,
  suggestedCurveKey,
} from "../utils/curveEdits";
import { linkable, randomDraw } from "../utils/randomDraw";
import { addRandomEdits } from "../utils/randomEdits";
import { unrandomizeEdits } from "../utils/randomizer";
import { CurveGraph, type CurveSelectionMode } from "./CurveGraph";
import { CurveKeyEditor } from "./CurveKeyEditor";
import { CurveToolbar } from "./CurveToolbar";
import { KeyTable } from "./KeyTable";

const NO_KEYS: readonly CurveKey[] = [];

/**
 * The curve of whatever last targeted the dock. "The curve panel" in docs/ux/BIN_EDITOR.md.
 *
 * The host sizes it, because the same surface is the dock under a stack and a pane of the
 * shell (ADR-0031). The target is the dock's, which follows its field from emitter to
 * emitter, so the surface holds none of its own.
 */
export function CurveSurface({
  document,
  named = true,
}: {
  document: BinDocumentId;
  /** False where the host already names the surface, as a pane's own strip does. */
  named?: boolean;
}) {
  const { target } = useCurveDock();
  const rows = useMemo(() => (target === null ? [] : [target.row]), [target]);
  const marks = useValueMarks(document, rows, "curves");
  const mark = target === null ? undefined : marks.get(rowKey(target.row));
  const [tab, setTab] = useState<CurveTab>("graph");

  /* An aim that names a reading switches to it, so a row's random chip lands on the graph
     the spread draws on rather than on whichever tab the dock was left on. */
  const asked = target?.tab;
  useEffect(() => {
    if (asked !== undefined) setTab(asked);
  }, [asked, target]);

  /* A followed field the next emitter holds flat has no curve to draw. */
  const drawn = target !== null && (mark === undefined || mark.curve);

  return (
    <section
      data-ui="CurveSurface"
      className="@container flex min-h-0 flex-1 flex-col gap-1 text-row"
    >
      {!drawn && named && <PaneLabel />}
      {!drawn && <Untargeted />}
      {drawn && target !== null && (
        <CurveReading
          key={rowKey(target.row)}
          row={target.row}
          chain={target.chain}
          mark={mark}
          tab={tab}
          onTab={setTab}
          named={named}
        />
      )}
    </section>
  );
}

function PaneLabel() {
  return (
    <span className={twMerge(OVERLINE, "shrink-0 px-1 select-none")}>
      {m.workshop_bin_curve_pane_label()}
    </span>
  );
}

interface CurveReadingProps {
  row: BinRow;
  chain: string;
  mark: ValueMark | undefined;
  tab: CurveTab;
  onTab: (tab: CurveTab) => void;
  named: boolean;
}

/**
 * One target's caption, toolbar and reading, keyed on the row so its muted chips go with it.
 *
 * The caption is the chain with the wire path beside it, leading the one toolbar row that
 * carries every control, per "The dock" in docs/ux/BIN_EDITOR.md.
 */
function CurveReading({ row, chain, mark, tab, onTab, named }: CurveReadingProps) {
  const [muted, setMuted] = useState<ReadonlySet<number>>(() => new Set());
  const [selected, setSelected] = useState<readonly number[]>([]);
  const edit = use(LeafEditContext);
  const playhead = useCurvePlayhead(row);
  const keys = mark?.keys ?? NO_KEYS;
  const family = mark?.family ?? "scalar";
  const draw = useMemo(() => randomDraw(mark), [mark]);
  const [linked, setLinked] = useState(true);
  const field = ownField(row);
  const unit = fieldUnit(field);
  const editable = edit?.editProperty !== undefined && mark !== undefined;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const primary = selected.at(-1) ?? 0;
  const randomEditor = useRandomEditor(editable ? edit : null, row, draw, linked);
  const width = Math.max(
    keys[0]?.values.length ?? 0,
    draw?.channels.length ?? 0,
    family === "scalar" ? 1 : 0,
  );
  /* A curve writing no table list yet, once its read says so. */
  const bare = editable && mark?.curve === true && mark.slots === 0 && width > 0;

  const tabled = keys.length > 0;
  const shown: CurveTab = tabled ? tab : "graph";

  useEffect(() => {
    setSelected((held) => {
      const valid = held.filter((at) => at >= 0 && at < keys.length);
      if (valid.length > 0 || keys.length === 0) return valid;

      return [0];
    });
  }, [keys.length]);

  function toggle(channel: number) {
    setMuted((held) => {
      const next = new Set(held);
      if (!next.delete(channel)) next.add(channel);
      return next;
    });
  }

  function select(at: number, mode: CurveSelectionMode) {
    setSelected((held) => {
      if (mode === "replace") return [at];
      if (mode === "add") return held.includes(at) ? held : [...held, at];
      if (mode === "toggle") {
        return held.includes(at) ? held.filter((each) => each !== at) : [...held, at];
      }

      const anchor = held.at(-1) ?? at;
      const first = Math.min(anchor, at);
      const last = Math.max(anchor, at);

      return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
    });
  }

  function selectMany(at: readonly number[], mode: "add" | "replace") {
    setSelected((held) => {
      if (mode === "replace") return [...at];

      return [...new Set([...held, ...at])];
    });
  }

  async function add(key = suggestedCurveKey(keys, mark?.constant ?? null, family, primary)) {
    if (edit === null) return;

    const at = insertionIndex(keys, key.time);
    if (await insertCurveKey(edit, row, family, at, key)) setSelected([at]);
  }

  async function remove() {
    if (edit === null) return;

    const removing = selected.filter((at) => keys[at] !== undefined);
    if (removing.length === 0) return;

    if (!(await removeCurveKeys(edit, row, removing))) return;

    const remaining = keys.length - removing.length;
    const next = Math.min(Math.min(...removing), remaining - 1);
    setSelected(next >= 0 ? [next] : []);
  }

  async function addRandom() {
    if (edit?.editProperty === undefined) return;

    await edit.editProperty(row, CURVE_DYNAMICS, addRandomEdits(width));
  }

  async function removeRandom() {
    if (edit?.editProperty === undefined || mark === undefined) return;

    const edits = unrandomizeEdits(mark);
    if (edits.length > 0) await edit.editProperty(row, CURVE_DYNAMICS, edits);
  }

  /* A key moved past a neighbour takes its place in the order, and the selection follows it. */
  async function commit(at: number, key: CurveKey): Promise<boolean> {
    if (edit === null) return false;
    if (movedKeys(keys, at, key).to === at) return commitCurveKey(edit, row, family, at, key);

    const to = await moveCurveKey(edit, row, family, keys, at, key);
    if (to === null) return false;

    setSelected([to]);
    return true;
  }

  return (
    <RandomEditContext value={randomEditor}>
      <CurveToolbar
        lead={
          <>
            {named && <PaneLabel />}
            <span className="min-w-0 shrink truncate text-surface-200">{chain}</span>
            <span
              title={row.path}
              className="min-w-0 flex-1 truncate font-mono text-meta text-surface-500 select-text"
            >
              {row.path}
            </span>
          </>
        }
        family={family}
        width={width}
        muted={muted}
        onToggle={toggle}
        draw={draw}
        field={field}
        tab={shown}
        tabled={tabled}
        onTab={onTab}
        keyCount={keys.length}
        selectedCount={selected.length}
        editable={editable}
        onAdd={() => void add()}
        onRemove={() => void remove()}
        onAddRandom={bare ? () => void addRandom() : null}
        onRemoveRandom={
          editable && draw !== null && (mark?.tables.length ?? 0) > 0
            ? () => void removeRandom()
            : null
        }
        linking={
          randomEditor !== null && draw !== null && linkable(draw)
            ? { linked, onToggle: () => setLinked((held) => !held) }
            : null
        }
      />
      <div className="flex min-h-0 flex-1 flex-col border-t border-surface-700/40">
        {shown === "graph" && (
          <div className="flex min-h-24 min-w-0 flex-1 overflow-y-auto bg-surface-950/20 p-2 scrollbar-sm">
            <CurveGraph
              keys={keys}
              family={family}
              draw={draw}
              unit={unit}
              muted={muted}
              playhead={playhead}
              selected={selectedSet}
              editable={editable}
              onSelect={select}
              onSelectMany={selectMany}
              onChange={commit}
              onAdd={(key) => void add(key)}
            />
          </div>
        )}
        {shown === "table" && (
          <KeyTable
            keys={keys}
            family={family}
            selected={primary}
            onSelect={(at) => select(at, "replace")}
          />
        )}
        <CurveKeyEditor
          keys={keys}
          family={family}
          selected={selected}
          unit={unit}
          editable={editable}
          onCommit={(key) => commit(primary, key)}
        />
      </div>
    </RandomEditContext>
  );
}

/**
 * The pane with no curve to draw, which draws a line rather than an empty box.
 *
 * Over it, the fields of the selected emitter that animate, each a chip that aims the pane.
 */
function Untargeted() {
  const { card, target } = useEmitters();
  const marks = use(ValueMarksContext);
  const { aim } = useCurveDock();
  const animated = useMemo(
    () =>
      card === undefined || target === "system"
        ? []
        : emitterRows(card).filter((row) => marks.get(rowKey(row))?.curve === true),
    [card, target, marks],
  );

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full text-surface-700"
      >
        <polyline
          points="0,36 20,34 40,24 60,10 80,6 100,4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {(card === undefined || animated.length === 0) && (
        <span className="relative text-meta text-surface-500">
          {m.workshop_bin_curve_pane_empty()}
        </span>
      )}
      {card !== undefined && animated.length > 0 && (
        <div className="relative flex max-w-full flex-col items-center gap-2 px-2 text-meta">
          <span className="text-surface-300">
            {m.workshop_bin_curve_pane_animates_label({ name: emitterChain(card) })}
          </span>
          <div className="flex flex-wrap justify-center gap-1">
            {animated.map((row) => (
              <button
                key={rowKey(row)}
                type="button"
                /* DS-RADIUS, DS-VEIL */
                className="flex cursor-pointer items-center gap-1 rounded-sm bg-surface-veil px-1.5 py-0.5 font-mono text-code text-surface-200 hover:bg-surface-veil-strong hover:text-surface-100"
                onClick={() => aim({ row, chain: fieldChain(card, row) })}
              >
                <WaveSineIcon weight="bold" aria-hidden="true" className="size-3 shrink-0" />
                {row.name}
              </button>
            ))}
          </div>
          <span className="text-surface-500">{m.workshop_bin_curve_pane_hint()}</span>
        </div>
      )}
    </div>
  );
}
