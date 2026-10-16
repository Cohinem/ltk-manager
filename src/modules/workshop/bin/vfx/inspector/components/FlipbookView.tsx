import { type PointerEvent as ReactPointerEvent, use, useState } from "react";

import { m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { CHECKERBOARD } from "../../../../preview/components/ImagePreview";
import { useImageSlot } from "../../../../preview/hooks/useImageSlot";
import { assetArchive, usePreviewUrl } from "../../../../preview/utils/assetRef";
import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import type { EmitterModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import { sampleCurve } from "../../engine/utils/sampleCurve";
import { VfxRunContext } from "../../playback/state/run";
import { useRunReadout } from "../../playback/state/runReadout";
import { useEmitters } from "../state/emitterChoice";
import { useEmitterModel } from "../state/emitterModel";
import {
  cellAt,
  cellAtPoint,
  type FlipbookGrid,
  flipbookGrid,
  framesThrough,
  playOrder,
  runsPerLifetime,
} from "../utils/flipbook";

/** The `w` the sheet asks for: the mipmap that covers the inspector's width at 2x. */
const SHEET_WIDTH = 512;

/** Past this many columns a cell is too narrow for its number. */
const NUMBERED_COLUMNS = 8;

const START_FRAME = nameHash("startFrame");
const NUM_FRAMES = nameHash("numFrames");

function readElapsed(driver: Driver): number {
  return driver.elapsed;
}

/**
 * The sprite sheet at the top of the Texture group: the open emitter's texture under its
 * `texDiv` grid, each cell of the run numbered in play order, and the cell a particle born at the
 * emitter's start draws at the playhead outlined, unless each particle opens on a random cell. A
 * click on a cell sets `startFrame`, and a shift-click sets `numFrames` so the run ends on it.
 *
 * Drawn for a grid of more than one cell. "The sprite sheet" in docs/ux/BIN_EDITOR.md.
 */
export function FlipbookView() {
  const emitter = useEmitterModel();
  const run = use(VfxRunContext);
  const elapsed = useRunReadout(run, readElapsed);
  const { card } = useEmitters();
  const edit = use(LeafEditContext);
  if (emitter === undefined) return null;

  const grid = flipbookGrid(emitter.uv.book);
  if (grid.cells <= 1) return null;

  const rate = playRate(emitter);
  const lifetime = sampleCurve(emitter.particleLifetime, 0)[0] ?? 0;
  const age = elapsed === null ? null : particleAge(emitter, elapsed, lifetime);
  const current = age === null || emitter.uv.book.randomStart ? null : cellAt(grid, rate, age);
  const runs = runsPerLifetime(grid, rate, lifetime);

  const editProperty = edit?.editProperty;
  const pick =
    editProperty === undefined || card === undefined
      ? null
      : (cell: number, end: boolean) => {
          const field = end ? NUM_FRAMES : START_FRAME;
          const value = end ? framesThrough(grid, cell) : cell;
          void editProperty(card.row, field, [
            { type: "setLeaf", path: "", value: { type: "integer", text: String(value) } },
          ]);
        };

  return (
    <div data-ui="FlipbookView" className="flex flex-col gap-1 py-1 pr-1 pl-1.5">
      <Sheet asset={emitter.texture?.asset ?? null} grid={grid} current={current} onPick={pick} />
      <p className="font-sans text-meta text-surface-400 tabular-nums select-none">
        {readingText(grid, rate, runs)}
      </p>
    </div>
  );
}

/** The cells a second the open emitter's run plays, its birth rate at its constant. */
function playRate(emitter: EmitterModel): number {
  const book = emitter.uv.book;
  if (emitter.simple) return book.rate;
  return book.rate * (sampleCurve(book.birthRate, 0)[0] ?? 1);
}

/** The age at `elapsed` of a particle born at the emitter's start, every `lifetime`. */
function particleAge(emitter: EmitterModel, elapsed: number, lifetime: number): number | null {
  const since = elapsed - emitter.timeBeforeFirstEmission;
  if (since < 0 || lifetime <= 0) return null;
  return since % lifetime;
}

function plain(value: number): string {
  return String(Number(value.toFixed(2)));
}

function readingText(grid: FlipbookGrid, rate: number, runs: number | null): string {
  if (runs === null) return m.workshop_bin_flipbook_held_label({ frames: grid.frames });
  return m.workshop_bin_flipbook_reading_label({
    frames: grid.frames,
    rate: plain(rate),
    runs: plain(runs),
  });
}

interface SheetProps {
  asset: AssetRef | null;
  grid: FlipbookGrid;
  current: number | null;
  onPick: ((cell: number, end: boolean) => void) | null;
}

/** The texture under its grid, which takes a click per cell where the emitter takes edits. */
function Sheet({ asset, grid, current, onPick }: SheetProps) {
  const order = playOrder(grid);
  const numbered = grid.columns <= NUMBERED_COLUMNS;

  function handlePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (onPick === null || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const cell = cellAtPoint(
      grid,
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height,
    );
    onPick(cell, event.shiftKey);
  }

  return (
    <div
      role="img"
      aria-label={m.workshop_bin_flipbook_label()}
      /* DS-VEIL, DS-RADIUS */
      className={twMerge(
        "relative w-full max-w-72 overflow-hidden rounded-sm border border-surface-veil-strong [background-size:8px_8px]",
        CHECKERBOARD,
        onPick !== null && "cursor-pointer",
      )}
      onPointerDown={handlePointer}
    >
      {asset !== null && <SheetImage asset={asset} />}
      {asset === null && <div className="aspect-square" />}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }}
      >
        {order.map((position, cell) => (
          <span
            key={cell}
            className={twMerge(
              "flex items-start justify-start border-r border-b border-surface-950/50 p-0.5 font-mono text-fine leading-none text-surface-50 tabular-nums select-none",
              position === null && "bg-surface-950/60",
              cell === current && "outline-2 -outline-offset-2 outline-accent-400",
            )}
          >
            {numbered && position !== null && position + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The texture's pixels at the sheet's width. */
function SheetImage({ asset }: { asset: AssetRef }) {
  const url = usePreviewUrl(asset, SHEET_WIDTH);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const slot = useImageSlot(url, { lane: "tile", archive: assetArchive(asset) });
  if (failedUrl === url || slot.src === undefined) return <div className="aspect-square" />;

  return (
    <img
      src={slot.src}
      alt=""
      draggable={false}
      onLoad={slot.onSettled}
      onError={() => {
        slot.onSettled();
        setFailedUrl(url);
      }}
      className="block w-full"
    />
  );
}
