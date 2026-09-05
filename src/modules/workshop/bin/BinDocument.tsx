import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu, Popover, Spinner } from "@/components";
import { NO_OVERSCROLL, useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentHandle, BinHeader } from "@/lib/tauri";
import { DocumentToolbar } from "@/modules/editor";

/* The leaf rather than the preview barrel, which pulls the document that routes here. */
import { BinPreview } from "../preview/BinPreview";
import { useObjectRevealRequest, useSettleObjectReveal } from "../state";
import { BinContextMenu } from "./BinContextMenu";
import { BinRowLine, MoreRow, ROW_HEIGHT } from "./BinRow";
import {
  flattenRows,
  isUnder,
  objectKey,
  pagesWanted,
  rowKey,
  toggled,
  type VisibleRow,
} from "./binRows";
import { type ChildrenRequest, useBinChildren, useBinDocument } from "./useBinDocument";

interface BinDocumentProps {
  /** The editor's id for the tab, which a reveal request names. */
  documentId: string;
  asset: AssetRef;
  /** The file name, which the document resolved. A reference may hold a hash. */
  name: string;
  active: boolean;
  /** The preview tab's own actions, drawn after the header facts. */
  actions: ReactNode;
}

/**
 * A property bin as blocks over its parsed tree.
 *
 * The tree stays in the backend (ADR-0026). This holds the expansion state, a window of
 * rows, and asks for the rows under one node at a time. A file that does not parse
 * lands in the handoff pane, with the error and the VS Code action.
 */
export function BinDocument({ documentId, asset, name, active, actions }: BinDocumentProps) {
  const { state, reopen } = useBinDocument(asset);

  if (state.status === "failed") {
    return (
      <>
        <DocumentToolbar active={active}>{actions}</DocumentToolbar>
        <BinPreview asset={asset} name={name} error={state.error} />
      </>
    );
  }

  if (state.status === "opening") {
    return (
      <>
        <DocumentToolbar active={active}>{actions}</DocumentToolbar>
        <div
          data-ui="BinDocument"
          className="flex min-h-0 flex-1 items-center justify-center bg-surface-950"
        >
          <Spinner />
        </div>
      </>
    );
  }

  return (
    <OpenBin
      documentId={documentId}
      name={name}
      handle={state.handle}
      active={active}
      actions={actions}
      reopen={reopen}
    />
  );
}

interface OpenBinProps {
  documentId: string;
  name: string;
  handle: BinDocumentHandle;
  active: boolean;
  actions: ReactNode;
  reopen: () => void;
}

function OpenBin({ documentId, name, handle, active, actions, reopen }: OpenBinProps) {
  const roots = handle.rows;
  const rootByKey = useMemo(() => new Map(roots.map((row) => [rowKey(row), row])), [roots]);

  /* A bin holding one object opens it expanded. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const [only] = roots;
    return new Set(only && roots.length === 1 ? [rowKey(only)] : []);
  });
  const [pages, setPages] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [focused, setFocused] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<{ key: string; token: number } | null>(null);

  const requests = useMemo<ChildrenRequest[]>(
    () => [...expanded].map((key) => ({ key, pages: pages.get(key) ?? 1 })),
    [expanded, pages],
  );
  const { loaded, notOpen } = useBinChildren(handle.document, requests);

  useEffect(() => {
    if (notOpen) reopen();
  }, [notOpen, reopen]);

  const visible = useMemo(
    () => flattenRows(roots, expanded, (key) => loaded.get(key)),
    [roots, expanded, loaded],
  );

  const toggle = useCallback((key: string) => {
    setFocused(null);
    setExpanded((current) => {
      if (!current.has(key)) return toggled(current, key);
      /* Collapsing forgets what was open underneath. Nothing hidden is fetched. */
      return new Set([...current].filter((open) => !isUnder(key, open)));
    });
  }, []);

  const requestMore = useCallback((parent: string, loadedCount: number) => {
    setPages((current) => {
      const wanted = pagesWanted(loadedCount);
      if ((current.get(parent) ?? 1) >= wanted) return current;
      return new Map(current).set(parent, wanted);
    });
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomed = useZoomedPx();
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => zoomed(ROW_HEIGHT),
    overscan: 16,
    getItemKey: (index) => visible[index]?.key ?? index,
  });

  /* Sizes cached at the old zoom outlive a change to it: `estimateSize` is not
     one of the inputs the measurement memo watches. */
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, zoomed]);

  const virtualItems = virtualizer.getVirtualItems();

  /* A node's next page is asked for while the line under its rows is on screen. */
  useEffect(() => {
    for (const item of virtualItems) {
      const line = visible[item.index];
      if (line?.kind === "more" && !line.pending) requestMore(line.parent, line.loaded);
    }
  }, [virtualItems, visible, requestMore]);

  /* An answered request is settled. A later open of the same file starts clean. */
  const reveal = useObjectRevealRequest(documentId);
  const settle = useSettleObjectReveal();
  useEffect(() => {
    if (reveal === null) return;
    settle(reveal.token);

    const key = objectKey(reveal.objectHash);
    if (!rootByKey.has(key)) return;
    setExpanded((current) => (current.has(key) ? current : toggled(current, key)));
    setFocused(key);
    setScrollTo({ key, token: reveal.token });
  }, [reveal, rootByKey, settle]);

  /* Keyed on the request's token. A second request for the same object scrolls again. */
  const scrolledToken = useRef<number | null>(null);
  useEffect(() => {
    if (scrollTo === null || scrolledToken.current === scrollTo.token) return;
    const index = visible.findIndex((line) => line.key === scrollTo.key);
    if (index < 0) return;
    scrolledToken.current = scrollTo.token;
    virtualizer.scrollToIndex(index, { align: "start" });
  }, [scrollTo, visible, virtualizer]);

  /* One menu for the whole list, pointed at the line the event came from. */
  const [menuLine, setMenuLine] = useState<VisibleRow | null>(null);
  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const wrapper = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    const index = Number(wrapper?.dataset.index);
    setMenuLine(Number.isInteger(index) ? (visible[index] ?? null) : null);
  }

  return (
    <div data-ui="BinDocument" className="flex min-h-0 flex-1 flex-col bg-surface-950">
      <DocumentToolbar active={active}>
        <BinFacts header={handle.header} />
        {actions}
      </DocumentToolbar>

      <ContextMenu.Root>
        <ContextMenu.Trigger
          ref={scrollRef}
          role="tree"
          aria-label={name}
          className="min-h-0 flex-1 overflow-auto px-1 py-1 outline-none scrollbar-md select-none"
          onContextMenu={handleContextMenu}
          {...NO_OVERSCROLL}
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualItems.map((item) => {
              const line = visible[item.index];
              if (!line) return null;
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
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
                    />
                  )}
                  {line.kind === "more" && <MoreRow line={line} />}
                </div>
              );
            })}
          </div>
        </ContextMenu.Trigger>

        <BinContextMenu
          line={menuLine}
          objectName={(entry) => rootByKey.get(objectKey(entry))?.name ?? entry}
        />
      </ContextMenu.Root>
    </div>
  );
}

/** What the file is, in the row its tab owns: the count, the version, the dependencies. */
function BinFacts({ header }: { header: BinHeader }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-meta text-surface-400 select-none">
      <span>{m.workshop_bin_objects_label({ count: header.objects })}</span>
      {header.kind === "prop" && header.version !== null && (
        <>
          <Dot />
          <span>{m.workshop_bin_version_label({ version: header.version })}</span>
        </>
      )}
      {header.kind === "prop" && (
        <>
          <Dot />
          <Dependencies paths={header.dependencies} />
        </>
      )}
      {header.kind === "patch" && (
        <>
          <Dot />
          <span>{m.workshop_bin_patch_label()}</span>
          <Dot />
          <span>{m.workshop_bin_patch_records_label({ count: header.patches })}</span>
          {header.deleted > 0 && (
            <>
              <Dot />
              <span>{m.workshop_bin_patch_deleted_label({ count: header.deleted })}</span>
            </>
          )}
        </>
      )}
    </span>
  );
}

/** The dependency count, opening to the list of paths. */
function Dependencies({ paths }: { paths: readonly string[] }) {
  const label = m.workshop_bin_dependencies_label({ count: paths.length });
  if (paths.length === 0) return <span>{label}</span>;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-surface-200"
          />
        }
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8}>
          <Popover.Popup aria-label={label} className="max-w-md p-2">
            <ul className="flex flex-col gap-0.5 font-mono text-code text-surface-200 select-text">
              {paths.map((path) => (
                <li key={path} className="truncate">
                  {path}
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Dot() {
  return <span aria-hidden>·</span>;
}
