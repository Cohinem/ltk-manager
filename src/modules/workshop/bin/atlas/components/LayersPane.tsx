import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu } from "@/components";
import { useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { TreeSearchBox } from "../../../shared/components/TreeSearchBox";
import { isCollapseAllKey } from "../../../shared/utils/treeGestures";
import { ROW_HEIGHT } from "../../tree/components/BinRow";
import { instantScroll } from "../../tree/hooks/useRowWindow";
import { Notice } from "../../vfx/preview/components/Notice";
import { foldsAbove, type LayerRow, layerMatches, layerRows } from "../engine/model/layers";
import { iconThumb } from "../engine/model/sprites";
import { variantPatched } from "../engine/model/variants";
import { useAtlasView } from "../hooks/useAtlasSources";
import { useHiddenScenes } from "../hooks/useHiddenScenes";
import { useAtlasPreviewActions, useHovered, useViewPreview, viewKey } from "../state/atlasPreview";
import { ElementMenu } from "./ElementMenu";
import { LayerRowView } from "./LayerRow";

const NONE: ReadonlySet<string> = new Set();

export interface LayersPaneProps {
  readonly document: BinDocumentId;
  readonly entry: string;
}

/**
 * The layers pane: the view's scenes and elements as a tree, topmost first.
 *
 * A search box over the tree narrows it to the elements whose name, path or class holds the text,
 * with every scene and group above one unfolded. An eye switches a scene against its resting
 * state in the preview (`hiddenScenesOf`), which the file never hears of, and a dot marks the
 * scenes the file enables itself.
 *
 * The tree is one tab stop: Up and Down walk the rows, Right opens a fold or steps into it, Left
 * closes it or steps out to its parent, Enter or Space selects the row, F frames it, Ctrl+F returns
 * to the box, Ctrl+A selects every element the search finds, and Escape lets go. A click with
 * Ctrl, Shift or Cmd adds a row to the selection, a double click frames it, and a right click
 * selects it and opens its menu. A pick on the canvas unfolds the tree to its row. The rows are
 * virtual, since the item shop holds two thousand elements.
 */
export function LayersPane({ document, entry }: LayersPaneProps) {
  const { tree, error, pending } = useAtlasView(document, entry);
  const key = viewKey(document, entry);
  const { selected, selection } = useViewPreview(key);
  const chosen = useMemo(() => new Set(selection), [selection]);
  const hiddenScenes = useHiddenScenes(tree, key);
  const hovered = useHovered();
  const { toggleScene, select, toggleSelected, setSelection, setHovered, requestFrame } =
    useAtlasPreviewActions();
  const [menuElement, setMenuElement] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const matches = useMemo(() => (tree === null ? null : layerMatches(tree, query)), [tree, query]);
  const roots = useMemo(() => new Set(tree?.sceneChildren.get(null) ?? []), [tree]);
  const [open, setOpen] = useState<ReadonlySet<string>>(roots);
  useEffect(() => setOpen((held) => (held.size === 0 ? roots : held)), [roots]);
  /* The folds the reader shut under the current search, which opens every fold above a match. */
  const [shut, setShut] = useState<ReadonlySet<string>>(NONE);
  const unfolded = useMemo(
    () => (matches === null ? open : withoutAll(matches.above, shut)),
    [matches, open, shut],
  );
  const rows = useMemo(
    () => (tree === null ? [] : layerRows(tree, unfolded, matches?.kept ?? null)),
    [tree, unfolded, matches],
  );
  const patched = useMemo(() => (tree === null ? new Set<string>() : variantPatched(tree)), [tree]);

  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const zoomed = useZoomedPx();
  const rowHeight = zoomed(ROW_HEIGHT);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: useCallback(() => rowHeight, [rowHeight]),
    overscan: 12,
    getItemKey: useCallback((index: number) => rows[index]?.id ?? index, [rows]),
    scrollToFn: instantScroll,
  });

  /* The row the keyboard stands on, by id, so a search or a fold keeps it where it can. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const found = activeId === null ? -1 : rows.findIndex((row) => row.id === activeId);
  const active = found >= 0 ? found : Math.min(0, rows.length - 1);
  const idPrefix = useId();

  /* A pick made on the canvas unfolds the tree to its row, then scrolls it into view once. */
  const revealed = useRef<string | null>(null);
  const scrollTo = useRef<string | null>(null);
  useEffect(() => {
    if (tree === null || selected === null || selected === revealed.current) return;

    revealed.current = selected;
    scrollTo.current = selected;
    setActiveId(`element:${selected}`);
    const above = foldsAbove(tree, selected);
    setOpen((held) =>
      above.every((each) => held.has(each)) ? held : new Set([...held, ...above]),
    );
    setShut((held) => (above.some((each) => held.has(each)) ? withoutAll(held, above) : held));
  }, [tree, selected]);
  useEffect(() => {
    const target = scrollTo.current;
    if (target === null) return;

    const index = rows.findIndex((row) => row.type === "element" && row.key === target);
    if (index < 0) return;
    scrollTo.current = null;
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [rows, selected, virtualizer]);

  const changeQuery = (next: string) => {
    setQuery(next);
    setShut(NONE);
  };

  const toggleOpen = (row: LayerRow) => {
    const flip = (held: ReadonlySet<string>) => {
      const next = new Set(held);
      if (!next.delete(row.key)) next.add(row.key);
      return next;
    };
    if (matches === null) setOpen(flip);
    else setShut(flip);
  };

  const act = (row: LayerRow, additive = false) => {
    setActiveId(row.id);
    if (row.type === "scene") toggleOpen(row);
    else if (additive) toggleSelected(key, row.key);
    else select(key, row.key);
  };

  const moveTo = (index: number) => {
    const at = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[at];
    if (row === undefined) return;

    setActiveId(row.id);
    virtualizer.scrollToIndex(at, { align: "auto" });
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const command = event.ctrlKey || event.metaKey;
    if (isCollapseAllKey(event)) {
      event.preventDefault();
      if (matches === null) setOpen(NONE);
      else setShut(matches.above);
      return;
    }
    if (command && event.key.toLowerCase() === "f") {
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
      return;
    }
    if (command && event.key.toLowerCase() === "a" && tree !== null) {
      event.preventDefault();
      setSelection(key, [...(matches?.matched ?? tree.elements.keys())]);
      return;
    }
    if (event.key === "Escape" && selection.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      select(key, null);
      return;
    }
    if (command || event.altKey) return;

    const row = rows[active];
    if (row === undefined) return;

    const page = virtualizer.getVirtualItems().length;
    const step = navigation(event.key, row, active, rows, page);
    if (step === null) return;

    event.preventDefault();
    /* The first key a fresh tree hears shows where the keyboard stands rather than moving it. */
    if (activeId === null && typeof step === "number") setActiveId(row.id);
    else if (step === "act") act(row);
    else if (step === "toggle") toggleOpen(row);
    else if (step === "frame") requestFrame(key, row.key);
    else moveTo(step);
  }

  if (error !== null) return <Notice text={m.workshop_bin_atlas_view_error()} />;
  if (pending || tree === null) return <Notice text={m.workshop_bin_atlas_view_pending()} />;
  if (tree.elements.size === 0 && tree.scenes.size === 0) {
    return <Notice text={m.workshop_bin_atlas_layers_empty()} />;
  }

  return (
    <div data-ui="LayersPane" className="flex min-h-0 flex-1 flex-col select-none">
      <div className="flex shrink-0 items-center gap-1.5 p-1.5 pb-1">
        <TreeSearchBox
          value={query}
          onChange={changeQuery}
          label={m.workshop_bin_atlas_layers_search_label()}
          clearLabel={m.workshop_bin_atlas_layers_search_clear_action()}
          onCommit={() => scroller.current?.focus()}
          inputRef={search}
        >
          {matches !== null && (
            <span className="shrink-0 text-meta text-surface-400 tabular-nums">
              {matches.matched.size}
            </span>
          )}
        </TreeSearchBox>
      </div>
      {rows.length === 0 && <Notice text={m.workshop_bin_atlas_layers_no_match_empty()} />}
      <ContextMenu.Root>
        <ContextMenu.Trigger
          ref={scroller}
          data-ui="LayersPane:tree"
          role="tree"
          tabIndex={0}
          aria-label={m.workshop_bin_pane_layers_label()}
          aria-activedescendant={active < 0 ? undefined : `${idPrefix}-${active}`}
          /* DS-SCROLLBAR */
          className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 text-row outline-none scrollbar-md"
          onKeyDown={handleKeyDown}
          onPointerLeave={() => setHovered(null)}
          onContextMenuCapture={() => setMenuElement(null)}
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
                  <LayerRowView
                    domId={`${idPrefix}-${virtual.index}`}
                    row={row}
                    query={query}
                    thumb={row.type === "element" ? iconThumb(tree, row.key) : null}
                    hidden={row.type === "scene" && hiddenScenes.has(row.key)}
                    patched={row.type === "element" && patched.has(row.key)}
                    selected={row.type === "element" && chosen.has(row.key)}
                    hovered={row.type === "element" && row.key === hovered}
                    active={virtual.index === active && activeId !== null}
                    onFold={() => toggleOpen(row)}
                    onActivate={(additive) => act(row, additive)}
                    onHover={() => setHovered(row.type === "element" ? row.key : null)}
                    onHide={() => toggleScene(key, row.key)}
                    onFrame={() => {
                      if (row.type === "element") requestFrame(key, row.key);
                    }}
                    onMenu={() => {
                      if (row.type !== "element") return;
                      setMenuElement(row.key);
                      if (!chosen.has(row.key)) select(key, row.key);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </ContextMenu.Trigger>
        <ElementMenu document={document} entry={entry} element={menuElement} />
      </ContextMenu.Root>
    </div>
  );
}

function withoutAll(held: ReadonlySet<string>, gone: Iterable<string>): ReadonlySet<string> {
  const next = new Set(held);
  for (const each of gone) next.delete(each);
  return next;
}

/**
 * What a key asks of the tree from the row at `at`: a row to move to, a fold to switch, the row's
 * own action, framing its element, or nothing. `page` is how many rows a Page key moves.
 */
function navigation(
  key: string,
  row: LayerRow,
  at: number,
  rows: readonly LayerRow[],
  page: number,
): number | "toggle" | "act" | "frame" | null {
  switch (key) {
    case "ArrowDown":
      return at + 1;
    case "ArrowUp":
      return at - 1;
    case "Home":
      return 0;
    case "End":
      return rows.length - 1;
    case "PageDown":
      return at + Math.max(page - 1, 1);
    case "PageUp":
      return at - Math.max(page - 1, 1);
    case "Enter":
    case " ":
      return "act";
    case "f":
    case "F":
      return row.type === "element" ? "frame" : null;
    case "ArrowRight":
      if (!row.folds) return null;
      return row.open ? at + 1 : "toggle";
    case "ArrowLeft":
      if (row.folds && row.open) return "toggle";
      return parentIndex(rows, at);
    default:
      return null;
  }
}

/** The row the row at `at` sits under, null for a root. */
function parentIndex(rows: readonly LayerRow[], at: number): number | null {
  const depth = rows[at]?.depth ?? 0;
  for (let index = at - 1; index >= 0; index -= 1) {
    if ((rows[index]?.depth ?? 0) < depth) return index;
  }
  return null;
}
