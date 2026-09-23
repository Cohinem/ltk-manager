import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu } from "@/components";
import { NO_OVERSCROLL } from "@/hooks";
import type { AssetRef, BinDocumentId, BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import type { OpenIntent } from "../../../palette/utils/types";
import { stirImages } from "../../../preview/hooks/useImageSlot";
import { rowTag } from "../../values/utils/kindTag";
import type { TreeFocus } from "../hooks/useBinEdit";
import { type TreeReveal, useReveal } from "../hooks/useReveal";
import { useRowWindow } from "../hooks/useRowWindow";
import { useNextPages, useTreeRows } from "../hooks/useTreeRows";
import { createGuideStore, GuideStoreContext } from "../state/treeGuides";
import {
  addLineKey,
  childCount,
  type InsertAt,
  lineParent,
  nameColumns,
  rowKey,
  type VisibleRow,
} from "../utils/binRows";
import { AddItemLine } from "./AddItemLine";
import { AddPropertyLine } from "./AddPropertyLine";
import { BinContextMenu } from "./BinContextMenu";
import { BinRowLine, MoreRow } from "./BinRow";
import { TreeContexts } from "./TreeContexts";

export type { TreeReveal } from "../hooks/useReveal";

interface BinTreeProps {
  /** The open's id, which every children call carries. */
  document: BinDocumentId;
  /** What the document was read from, which the layer side of a `file` link looks in. */
  asset: AssetRef;
  /** The rows at depth zero: the objects of a file, or the properties of one object. */
  roots: readonly BinRow[];
  /** The class the roots are properties of. Null where the roots are objects. */
  rootOwner: string | null;
  /** The tree's accessible name. */
  label: string;
  /** The keys open at mount. */
  initialExpanded?: readonly string[];
  /**
   * The most rows the scroller shows before it scrolls.
   *
   * Unset, the tree fills its parent, which is what a whole pane of rows wants. A
   * class view's section sets one, so a section of three rows is three rows tall.
   */
  maxRows?: number;
  reveal?: TreeReveal | null;
  /** The name of the object an entry hash addresses, for the path a row copies. */
  objectName: (entry: string) => string;
  /** The backend holds no document with this id. The caller reopens it. */
  onNotOpen: () => void;
  /** Open the object a row declares, per the intent a click or a `Ctrl+click` carries. */
  onOpenObject?: (row: BinRow, intent: OpenIntent) => void;
  /** The leaves take edits. A class view's section and a read-only document leave it off. */
  editable?: boolean;
  /** The object the roots are properties of, whose add line follows them. */
  rootEntry?: string | null;
}

const NO_KEYS: readonly string[] = [];

/** The room a bounded tree leaves around its rows, which is the scroller's own padding. */
const SCROLLER_PADDING = 8;

/**
 * The rows of one bin document as a tree, a window at a time.
 *
 * The tree stays in the backend (ADR-0026). `useTreeRows` holds the expansion state and
 * the lines it produces, and `useRowWindow` draws the ones on screen. The file tab and
 * the object tab draw this over their own roots.
 */
export function BinTree({
  document,
  asset,
  roots,
  rootOwner,
  label,
  initialExpanded = NO_KEYS,
  maxRows,
  reveal = null,
  objectName,
  onNotOpen,
  onOpenObject,
  editable = false,
  rootEntry = null,
}: BinTreeProps) {
  /* The one insert line open inside a list or a map. */
  const [insertAt, setInsertAt] = useState<InsertAt | null>(null);
  const {
    visible,
    loaded,
    groups,
    toggle: toggleRow,
    expand,
    requestMore,
    reach,
    remap,
  } = useTreeRows({
    document,
    roots,
    rootOwner,
    initialExpanded,
    onNotOpen,
    editable,
    rootEntry,
    insertAt,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const { items, lines, totalSize, rowHeight, measureElement, scrollToKey } = useRowWindow(
    scrollRef,
    visible,
  );
  useNextPages(lines, requestMore);

  const { focused, clearFocus } = useReveal(reveal, {
    roots,
    loaded,
    expand,
    requestMore,
    scrollToKey,
  });
  const toggle = useCallback(
    (key: string) => {
      clearFocus();
      toggleRow(key);
    },
    [clearFocus, toggleRow],
  );

  /* The row value or the add line an edit sends focus to, once it draws. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focus = useMemo<TreeFocus>(
    () => ({
      key: focusKey,
      settle: () => setFocusKey(null),
      addTo: (row: BinRow) => {
        const key = rowKey(row);
        expand([key]);
        reach(key, childCount(row));
        setFocusKey(addLineKey(key));
      },
      to: (key: string, opening: string | null) => {
        if (opening !== null) expand([opening]);
        setFocusKey(key);
      },
      insertAt: (holder: string, index: number) => {
        setInsertAt({ holder, index });
        setFocusKey(addLineKey(holder, index));
      },
      closeInsert: () => setInsertAt(null),
      reach,
      remap,
    }),
    [expand, focusKey, reach, remap],
  );
  useEffect(() => {
    if (focusKey !== null && visible.some((line) => line.key === focusKey)) scrollToKey(focusKey);
  }, [focusKey, scrollToKey, visible]);

  const inView = useMemo(
    () => lines.flatMap((line) => (line.kind === "row" ? [line.row] : [])),
    [lines],
  );

  /* One width for the whole list, so the values stay in a column while no name elides
     that could have fitted. */
  const nameCols = useMemo(() => nameColumns(visible, rowTag), [visible]);

  /* One menu for the whole list, pointed at the line the event came from. */
  const [menuLine, setMenuLine] = useState<VisibleRow | null>(null);
  function lineAt(target: EventTarget): VisibleRow | null {
    const wrapper = (target as HTMLElement).closest<HTMLElement>("[data-index]");
    const index = Number(wrapper?.dataset.index);
    return Number.isInteger(index) ? (visible[index] ?? null) : null;
  }
  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    setMenuLine(lineAt(event.target));
  }

  /* Outside React state, so a pointer crossing the rows redraws the guides and nothing else. */
  const [guides] = useState(createGuideStore);
  function standOn(target: EventTarget) {
    const line = lineAt(target);
    if (line !== null) guides.set({ active: lineParent(line) });
  }
  useEffect(() => {
    const line = visible.find((candidate) => candidate.key === focused);
    if (line !== undefined) guides.set({ active: lineParent(line) });
  }, [focused, guides, visible]);

  return (
    <TreeContexts
      document={document}
      asset={asset}
      groups={groups}
      inView={inView}
      objectName={objectName}
      editable={editable}
      focus={focus}
    >
      <GuideStoreContext value={guides}>
        <ContextMenu.Root>
          <ContextMenu.Trigger
            ref={scrollRef}
            role="tree"
            aria-label={label}
            className={twMerge(
              "overflow-auto px-1 py-1 font-mono outline-none scrollbar-md select-none",
              maxRows === undefined && "min-h-0 flex-1",
            )}
            style={
              {
                "--bin-name-cols": nameCols,
                maxHeight:
                  maxRows === undefined ? undefined : rowHeight * maxRows + SCROLLER_PADDING,
              } as CSSProperties
            }
            onContextMenu={handleContextMenu}
            onPointerDown={(event) => standOn(event.target)}
            onFocus={(event) => standOn(event.target)}
            onMouseOver={(event) => {
              const line = lineAt(event.target);
              guides.set({ hover: line === null ? null : lineParent(line) });
            }}
            onMouseLeave={() => guides.set({ hover: null })}
            onScroll={stirImages}
            {...NO_OVERSCROLL}
          >
            <div className="relative w-full" style={{ height: totalSize }}>
              {items.map((item) => {
                const line = visible[item.index];
                if (!line) return null;
                return (
                  <div
                    key={item.key}
                    ref={measureElement}
                    data-index={item.index}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    {line.kind === "row" && (
                      <BinRowLine
                        line={line}
                        focused={line.key === focused}
                        error={loaded.get(line.key)?.error}
                        onToggle={toggle}
                        onOpenObject={onOpenObject}
                      />
                    )}
                    {line.kind === "more" && <MoreRow line={line} />}
                    {line.kind === "add" && line.target.kind === "property" && (
                      <AddPropertyLine line={line} autoFocus={line.key === focusKey} />
                    )}
                    {line.kind === "add" && line.target.kind !== "property" && (
                      <AddItemLine line={line} autoFocus={line.key === focusKey} />
                    )}
                  </div>
                );
              })}
            </div>
          </ContextMenu.Trigger>

          <BinContextMenu line={menuLine} objectName={objectName} onOpenObject={onOpenObject} />
        </ContextMenu.Root>
      </GuideStoreContext>
    </TreeContexts>
  );
}
