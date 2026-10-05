import { FileArchiveIcon } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, ContextMenu, EmptyState, LoadingState, SearchField } from "@/components";
import { useRemeasure, useZoomedPx } from "@/hooks";
import { NO_OVERSCROLL } from "@/hooks/useOverscrollSpring";
import type { GameWadSummary } from "@/lib/tauri";
import { DocumentToolbar, type EditorDocumentProps, useFindBox } from "@/modules/editor";
import { twMerge } from "@/utils";
import { formatBytes } from "@/utils";

import {
  type ContentDocumentOf,
  documentSource,
  gameWadDocument,
} from "../../documents/utils/contentDocument";
import { DocumentFrame } from "../../shared/components/DocumentFrame";
import {
  keepScrollTop,
  keptScrollTop,
  useActiveDocumentId,
  useOpenDocument,
  useSetWadFilter,
  useWadFilter,
} from "../../state";
import { useGameWads } from "../api/useGameWads";
import { ExtractMenuItems } from "../extraction/components/ExtractMenuItems";
import { useExtractActions } from "../extraction/hooks/useExtractActions";
import { archiveTarget } from "../extraction/utils/extractTargets";
import { useWadSource, WadSourceProvider } from "../state/wadSource";
import { sourceCopy } from "../utils/sourceCopy";
import { wadBasename, wadDirname } from "../utils/sourceIndex";
import { GameWadsErrorState } from "./GameBrowserStates";

/* The file trees' row height, so a list of archives scans like the trees it
   opens into. */
const ROW_HEIGHT = 24;

/**
 * Every archive one source of the install holds, as the list the folded tree cannot be.
 *
 * The root browser merges the archives away on purpose, so a modder after one
 * archive by name needs this instead.
 */
export function GameWadsDocument(props: EditorDocumentProps<ContentDocumentOf<"game-wads">>) {
  return (
    <WadSourceProvider source={documentSource(props.document)}>
      <ArchivesDocument {...props} />
    </WadSourceProvider>
  );
}

function ArchivesDocument({
  document,
  active,
}: EditorDocumentProps<ContentDocumentOf<"game-wads">>) {
  const wads = useGameWads();
  const filter = useWadFilter();
  const setFilter = useSetWadFilter();
  const boxRef = useFindBox(document.id);

  const matches = useMemo(() => {
    const all = wads.data ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return all;
    /* The whole relative name, so `champions/aa` narrows as well as `aatrox`. */
    return all.filter((wad) => wad.name.toLowerCase().includes(needle));
  }, [wads.data, filter]);

  return (
    <DocumentFrame data-ui="GameWadsDocument">
      <DocumentToolbar active={active}>
        <FilterField
          value={filter}
          onChange={setFilter}
          total={wads.data?.length ?? 0}
          boxRef={boxRef}
        />
      </DocumentToolbar>

      <ArchiveList
        wads={matches}
        filtered={filter.trim().length > 0}
        onClearFilter={() => setFilter("")}
      />
    </DocumentFrame>
  );
}

interface FilterFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** How many the install holds, which the placeholder reports. */
  total: number;
  /** The box a find reaches. */
  boxRef: RefObject<HTMLInputElement | null>;
}

function FilterField({ value, onChange, total, boxRef }: FilterFieldProps) {
  /* The count rides the placeholder rather than a label of its own, so the row
     is the one control it looks like. Nothing is lost while filtering: what a
     filter left is the list itself. */
  const placeholder = total > 0 ? `Search ${total} WADs` : "Search WADs";

  return (
    <SearchField
      value={value}
      onChange={onChange}
      label="Search WADs"
      placeholder={placeholder}
      clearLabel="Clear filter"
      inputRef={boxRef}
    />
  );
}

interface ArchiveListProps {
  /** What the filter left, which the parent owns because it owns the box. */
  wads: readonly GameWadSummary[];
  filtered: boolean;
  onClearFilter: () => void;
}

function ArchiveList({ wads, filtered, onClearFilter }: ArchiveListProps) {
  const source = useWadSource();
  /* One list per source, so one key. What the filter left rides the same scroll, the
     way it does while the box is typed into. */
  const scrollKey = `${source}-wads`;
  const query = useGameWads();
  const scrollRef = useRef<HTMLDivElement>(null);
  const openDocument = useOpenDocument();
  const activeId = useActiveDocumentId();
  const { run } = useExtractActions();

  /* One menu for the whole list, pointed at the row the event came from, the
     same scheme the source trees use. */
  const [menuWad, setMenuWad] = useState<GameWadSummary | null>(null);

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-wad]");
    const name = row?.dataset.wad;
    setMenuWad(wads.find((wad) => wad.name === name) ?? null);
  }

  const [initialOffset] = useState(() => keptScrollTop(scrollKey));

  /* The live element rather than one captured at mount, which is null on the
     renders that answer with a state instead of the list. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => keepScrollTop(scrollKey, scrollRef.current?.scrollTop ?? 0);
  }, []);

  const zoomed = useZoomedPx();
  const rowHeight = zoomed(ROW_HEIGHT);
  const virtualizer = useVirtualizer({
    count: wads.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (index) => wads[index]!.name,
    initialOffset,
  });
  useRemeasure(virtualizer, rowHeight);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <GameWadsErrorState error={query.error} />;

  if (wads.length === 0 && filtered) {
    return (
      <EmptyState
        size="sm"
        title="No match"
        description="No archive of the install carries that name."
        action={
          <Button variant="outline" size="sm" onClick={onClearFilter}>
            Clear filter
          </Button>
        }
      />
    );
  }

  if (wads.length === 0) {
    return (
      <EmptyState size="sm" title="No archives" description={sourceCopy(source).emptyDescription} />
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto py-1 scrollbar-md select-none"
        onContextMenu={handleContextMenu}
        {...NO_OVERSCROLL}
      >
        <div
          role="presentation"
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const wad = wads[row.index]!;
            const document = gameWadDocument(wad.name, source);
            const directory = wadDirname(wad.name);

            return (
              <button
                key={row.key}
                type="button"
                data-wad={wad.name}
                onClick={() => openDocument(document)}
                style={{ height: `${rowHeight}px`, transform: `translateY(${row.start}px)` }}
                className={twMerge(
                  "absolute inset-x-0 flex min-w-0 cursor-pointer items-center gap-2 px-3 text-left font-mono text-xs transition-colors outline-none",
                  "focus-visible:ring-1 focus-visible:ring-accent-500/70 focus-visible:ring-inset",
                  document.id === activeId && "bg-accent-500/15 text-accent-100",
                  document.id !== activeId &&
                    "text-surface-200/90 hover:bg-surface-700/70 hover:text-surface-100",
                )}
              >
                <FileArchiveIcon
                  className={twMerge(
                    "size-3.5 shrink-0",
                    document.id === activeId ? "text-accent-400" : "text-surface-400",
                  )}
                />
                {/* One span, so the whole thing reads and truncates as the path
                  it is rather than as a name with a note after it. */}
                <span className="min-w-0 truncate">
                  {directory && <span className="text-surface-400">{directory}/</span>}
                  {wadBasename(wad.name)}
                </span>
                <span className="ml-auto shrink-0 text-fine text-surface-400 tabular-nums">
                  {formatBytes(Number(wad.sizeBytes))}
                </span>
              </button>
            );
          })}
        </div>
      </ContextMenu.Trigger>

      {menuWad && (
        <ContextMenu.Content className="w-60">
          <ExtractMenuItems
            onRun={(how) => run(how, [archiveTarget(menuWad.name)], wadBasename(menuWad.name))}
          />
        </ContextMenu.Content>
      )}
    </ContextMenu.Root>
  );
}
