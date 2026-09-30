import { ExportIcon, ImageSquareIcon } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, useCallback, useId, useMemo, useRef, useState } from "react";

import { IconButton, Tooltip } from "@/components";
import { useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import type { BinDocumentId, SheetSpec } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { MatchedText } from "../../../shared/components/MatchedText";
import { TreeSearchBox } from "../../../shared/components/TreeSearchBox";
import { instantScroll } from "../../tree/hooks/useRowWindow";
import { Notice } from "../../vfx/preview/components/Notice";
import { sheetSpriteAt } from "../engine/edit/spriteEdits";
import {
  type SpriteRow,
  spriteRows,
  type SpriteTexture,
  type SpriteUse,
  spriteTextures,
} from "../engine/model/sprites";
import { useAtlasView } from "../hooks/useAtlasSources";
import { useSpriteExport } from "../hooks/useSpriteExport";
import { pageOf, type SpriteImport, useSpriteImport } from "../hooks/useSpriteImport";
import { useAtlasPreviewActions, useViewPreview, viewKey } from "../state/atlasPreview";
import { KeyHint } from "./KeyHint";
import { SpriteThumb } from "./SpriteThumb";

/** A row's thumbnail, in CSS pixels. */
const THUMB_SIZE = 28;

/** A sprite row's height: the thumbnail and a padding of 4 above and below. */
const SPRITE_ROW = THUMB_SIZE + 8;
const HEADING_ROW = 24;

const REPLACE_KEY = "R";
const EXPORT_KEY = "E";

export interface SpritesPaneProps {
  readonly document: BinDocumentId;
  readonly entry: string;
}

/**
 * The sprites pane: every sprite the view draws, by the texture it sits on, per section 5 of
 * docs/plans/atlas-ui-editor.md.
 *
 * A search box narrows the list by a sprite's name or its texture's path. The list is one tab
 * stop: Up and Down walk the sprites, Enter or Space selects the elements drawing one, F frames
 * the first of them, R replaces its image, and Ctrl+F returns to the box. A click selects and a
 * double click frames.
 * Replacing a sprite's image puts the picked PNG on the sheet the project owns for the view and
 * points every element drawing the sprite at it, and a game page is never written. The rows are
 * virtual, since a large view draws hundreds of sprites.
 */
export function SpritesPane({ document, entry }: SpritesPaneProps) {
  const { tree, error, pending } = useAtlasView(document, entry);
  const key = viewKey(document, entry);
  const { selected } = useViewPreview(key);
  const { setSelection, requestFrame } = useAtlasPreviewActions();
  const sprites = useSpriteImport(tree?.view ?? null);
  const exports = useSpriteExport();
  const textures = useMemo(() => (tree === null ? [] : spriteTextures(tree.view)), [tree]);
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => (tree === null ? [] : spriteRows(tree, textures, query)),
    [tree, textures, query],
  );
  const shown = rows.filter((row) => row.type === "sprite").length;

  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const zoomed = useZoomedPx();
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: useCallback(
      (index: number) => zoomed(rows[index]?.type === "texture" ? HEADING_ROW : SPRITE_ROW),
      [rows, zoomed],
    ),
    overscan: 8,
    getItemKey: useCallback((index: number) => rows[index]?.id ?? index, [rows]),
    scrollToFn: instantScroll,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const found = activeId === null ? -1 : rows.findIndex((row) => row.id === activeId);
  const active = found >= 0 ? found : rows.findIndex((row) => row.type === "sprite");
  const idPrefix = useId();

  const choose = (sprite: SpriteUse) => setSelection(key, sprite.elements);
  const frame = (sprite: SpriteUse) => {
    const first = sprite.elements[0];
    if (first !== undefined) requestFrame(key, first);
  };

  const moveBy = (step: number) => {
    let at = active;
    do {
      at += step;
    } while (rows[at]?.type === "texture");
    const row = rows[at];
    if (row === undefined) return;

    setActiveId(row.id);
    virtualizer.scrollToIndex(at, { align: "auto" });
  };

  function exportRow(row: Extract<SpriteRow, { type: "sprite" }>) {
    const asset = row.texture.asset;
    if (asset === null) return;
    void exports.run({ asset, uv: row.sprite.uv, label: row.label });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const row = rows[active];
    if (row?.type !== "sprite") return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (activeId === null) setActiveId(row.id);
      else moveBy(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveId(row.id);
      choose(row.sprite);
      return;
    }
    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      frame(row.sprite);
      return;
    }
    if (event.key.toUpperCase() === EXPORT_KEY && !exports.exporting) {
      event.preventDefault();
      exportRow(row);
      return;
    }
    if (event.key.toUpperCase() === REPLACE_KEY && sprites.available && !sprites.importing) {
      event.preventDefault();
      void sprites.run(
        row.sprite.elements,
        ownKey(row.texture, row.sprite, sprites.sheet),
        pageOf(row.texture.path, row.sprite.uv, sprites.sheet),
      );
    }
  }

  if (error !== null) return <Notice text={m.workshop_bin_atlas_view_error()} />;
  if (pending || tree === null) return <Notice text={m.workshop_bin_atlas_view_pending()} />;
  if (textures.length === 0) return <Notice text={m.workshop_bin_atlas_sprites_empty()} />;

  return (
    <div data-ui="SpritesPane" className="flex min-h-0 flex-1 flex-col select-none">
      <div className="flex shrink-0 flex-col gap-1.5 p-1.5 pb-1">
        <div className="flex items-center gap-1.5">
          <TreeSearchBox
            value={query}
            onChange={setQuery}
            label={m.workshop_bin_atlas_sprites_search_label()}
            clearLabel={m.workshop_bin_atlas_layers_search_clear_action()}
            onCommit={() => scroller.current?.focus()}
            inputRef={search}
          >
            {query.trim() !== "" && (
              <span className="shrink-0 text-meta text-surface-400 tabular-nums">{shown}</span>
            )}
          </TreeSearchBox>
        </div>
        {sprites.sheet !== null && <SheetSummary sheet={sprites.sheet} />}
      </div>
      {rows.length === 0 && <Notice text={m.workshop_bin_atlas_sprites_no_match_empty()} />}
      <div
        ref={scroller}
        role="listbox"
        tabIndex={0}
        aria-label={m.workshop_bin_pane_sprites_label()}
        aria-activedescendant={active < 0 ? undefined : `${idPrefix}-${active}`}
        /* DS-SCROLLBAR */
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 text-row outline-none scrollbar-md"
        onKeyDown={handleKeyDown}
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtual) => {
            const row = rows[virtual.index];
            if (row === undefined) return null;

            return (
              <div
                key={virtual.key}
                className="absolute left-0 w-full"
                style={{ top: virtual.start, height: virtual.size }}
              >
                {row.type === "texture" && <TextureHeading row={row} />}
                {row.type === "sprite" && (
                  <SpriteRowView
                    domId={`${idPrefix}-${virtual.index}`}
                    row={row}
                    query={query}
                    chosen={selected !== null && row.sprite.elements.includes(selected)}
                    active={virtual.index === active && activeId !== null}
                    sprites={sprites}
                    exporting={exports.exporting}
                    onExport={() => exportRow(row)}
                    onSelect={() => {
                      setActiveId(row.id);
                      choose(row.sprite);
                    }}
                    onFrame={() => frame(row.sprite)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SheetSummary({ sheet }: { sheet: SheetSpec }) {
  const name = sheet.path.split("/").at(-1) ?? sheet.path;

  return (
    /* DS-GROUND, DS-RADIUS */
    <div className="flex items-center gap-2 rounded-md border border-surface-700/50 bg-surface-900 px-2 py-1.5 text-meta text-surface-300">
      <span className="min-w-0 flex-1 truncate font-mono select-text" title={sheet.path}>
        {name}
      </span>
      <span className="shrink-0 tabular-nums">
        {m.workshop_bin_atlas_sprites_sheet_value({
          width: sheet.width,
          height: sheet.height,
          count: sheet.sprites.length,
        })}
      </span>
    </div>
  );
}

function TextureHeading({ row }: { row: Extract<SpriteRow, { type: "texture" }> }) {
  const { texture } = row;
  const name = texture.path.split("/").at(-1) ?? texture.path;

  return (
    <div
      role="presentation"
      className="flex h-full items-end gap-2 px-1 pb-1 text-meta text-surface-400"
    >
      <span className="min-w-0 truncate font-mono" title={texture.path}>
        {name}
      </span>
      <span className="ml-auto shrink-0">{textureKind(texture)}</span>
    </div>
  );
}

/** What a texture is: the project's own sheet, an auto-atlas page, or a sheet of the game. */
function textureKind(texture: SpriteTexture): string {
  if (texture.owned) return m.workshop_bin_atlas_sprites_owned_value();
  if (texture.page) return m.workshop_bin_atlas_sprites_page_value();
  return m.workshop_bin_atlas_sprites_sheet_kind_value();
}

interface SpriteRowViewProps {
  readonly domId: string;
  readonly row: Extract<SpriteRow, { type: "sprite" }>;
  readonly query: string;
  /** Whether the primary selection draws the sprite. */
  readonly chosen: boolean;
  /** The row the keyboard stands on. */
  readonly active: boolean;
  readonly sprites: SpriteImport;
  readonly exporting: boolean;
  readonly onSelect: () => void;
  readonly onExport: () => void;
  readonly onFrame: () => void;
}

function SpriteRowView({
  domId,
  row,
  query,
  chosen,
  active,
  sprites,
  exporting,
  onSelect,
  onExport,
  onFrame,
}: SpriteRowViewProps) {
  const { texture, sprite } = row;
  const replaceKey = ownKey(texture, sprite, sprites.sheet);
  const idle = !chosen && !active;

  return (
    <div
      id={domId}
      role="option"
      aria-selected={chosen}
      className={twMerge(
        /* DS-VEIL, DS-RADIUS */
        "group/row flex h-full cursor-pointer items-center gap-2 rounded-sm px-1 hover:bg-surface-veil-soft",
        chosen && "bg-accent-500/15 hover:bg-accent-500/15",
        active && "ring-1 ring-accent-500/60 ring-inset",
      )}
      onClick={onSelect}
      onDoubleClick={onFrame}
    >
      {texture.asset !== null && (
        <SpriteThumb
          asset={texture.asset}
          uv={sprite.uv}
          size={THUMB_SIZE}
          className="rounded-sm bg-surface-950/40"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          <MatchedText text={row.label} query={query} />
        </span>
        <span className="truncate text-meta text-surface-400">
          {m.workshop_bin_atlas_sprites_elements_value({ count: sprite.elements.length })}
        </span>
      </span>
      {texture.asset !== null && (
        <Tooltip
          content={
            <KeyHint label={m.workshop_bin_atlas_sprites_export_action()} shortcut={EXPORT_KEY} />
          }
        >
          <IconButton
            variant="ghost"
            size="xs"
            compact
            tabIndex={-1}
            aria-label={m.workshop_bin_atlas_sprites_export_action()}
            disabled={exporting}
            className={twMerge(idle && "opacity-0 group-hover/row:opacity-100")}
            icon={<ExportIcon weight="bold" className="h-3.5 w-3.5" />}
            onClick={(event) => {
              event.stopPropagation();
              onExport();
            }}
          />
        </Tooltip>
      )}
      {sprites.available && (
        <Tooltip
          content={
            <KeyHint label={m.workshop_bin_atlas_sprites_replace_action()} shortcut={REPLACE_KEY} />
          }
        >
          <IconButton
            variant="ghost"
            size="xs"
            compact
            tabIndex={-1}
            aria-label={m.workshop_bin_atlas_sprites_replace_action()}
            disabled={sprites.importing}
            className={twMerge(idle && "opacity-0 group-hover/row:opacity-100")}
            icon={<ImageSquareIcon weight="bold" className="h-3.5 w-3.5" />}
            onClick={(event) => {
              event.stopPropagation();
              void sprites.run(
                sprite.elements,
                replaceKey,
                pageOf(texture.path, sprite.uv, sprites.sheet),
              );
            }}
          />
        </Tooltip>
      )}
    </div>
  );
}

/** The sheet sprite a row is, where it sits on the project's own sheet for the view. */
function ownKey(texture: SpriteTexture, sprite: SpriteUse, sheet: SheetSpec | null): string | null {
  if (sheet === null || !texture.owned) return null;
  if (texture.path.toLowerCase() !== sheet.path.toLowerCase()) return null;
  return sheetSpriteAt(sheet, sprite.uv)?.key ?? null;
}
