import { ArrowsClockwiseIcon, FilesIcon } from "@phosphor-icons/react";
import { useCallback, useMemo } from "react";

import {
  type BreadcrumbItem,
  Count,
  EmptyState,
  IconButton,
  LoadingState,
  Spinner,
} from "@/components";
import { m } from "@/i18n";
import type { SearchHits, GameFindHit } from "@/lib/tauri";
import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";
import { useExplorerThumbnails, useExplorerTileSize, useExplorerView } from "@/stores";

import {
  type ContentDocumentOf,
  documentSource,
  gameWadsDocument,
} from "../../documents/utils/contentDocument";
import {
  ExplorerSortScope,
  useExplorerSort,
  CrumbSiblings,
  crumbsOf,
  ExplorerBar,
  ExplorerDetails,
  type ExplorerFileItem,
  ExplorerGrid,
  type ExplorerItem,
  type ExplorerScope,
  ExplorerSearchBox,
  filterItems,
  filterTree,
  itemsOf,
  selectedOfItem,
  selectedOfNode,
  selectionSubject,
  selectionTargets,
  sortItems,
  sortTree,
  useExplorerNav,
  useExplorerSelectionApi,
} from "../../explorer";
import { CollapseAllButton } from "../../shared/components/CollapseAllButton";
import { DocumentFrame } from "../../shared/components/DocumentFrame";
import {
  useExpandedGameDirs,
  useExplorerFilter,
  useExplorerScope,
  useGameReveal,
  useGameSearchPattern,
  useGameSearchRegex,
  useOpenDocument,
  useSetExplorerFilter,
  useSetExplorerScope,
  useSetGameSearchPattern,
  useSetGameSearchRegex,
  useSettleGameReveal,
  useCollapseAllGameDirs,
  useCollapseGameDirTree,
  useToggleGameDir,
} from "../../state";
import { useGameFind } from "../api/useGameFind";
import { useGameDir, useGameDirs, useGameIndex, useRefreshGameIndex } from "../api/useGameIndex";
import { type ExtractHow, useExtractActions } from "../extraction/hooks/useExtractActions";
import { indexDirTarget } from "../extraction/utils/extractTargets";
import { useExplorerShell } from "../hooks/useExplorerShell";
import { useGameSearchRevealTarget } from "../hooks/useGameSearchReveal";
import { useSourcePreview, useSourceRowPreview } from "../hooks/useSourcePreview";
import { explorerIdOf, useWadSource, WadSourceProvider } from "../state/wadSource";
import { fileNodeOf, isPresent, itemAsset, menuNodeOf } from "../utils/explorerItems";
import { sourceCopy } from "../utils/sourceCopy";
import {
  buildIndexTree,
  flattenSourceTree,
  holdsOnlyUnknown,
  type SourceDirNode,
} from "../utils/sourceIndex";
import { GameWadsErrorState, UnknownHashHint } from "./GameBrowserStates";
import { CollapseFindAction, GameFindResults } from "./GameFindResults";
import { SourceTree } from "./SourceTree";
import { SourceTreeContextMenu } from "./SourceTreeContextMenu";

/** What the whole game's explorer keeps its location and selection under. */
export const EXPLORER_ID = explorerIdOf("game");

/** The explorer id of the browser the caller sits in. */
function useExplorerId(): string {
  return explorerIdOf(useWadSource());
}

/** What the box reads, which is the whole index until the reader narrows it. */
function useIndexScope(): ExplorerScope {
  return useExplorerScope(useExplorerId(), "whole");
}

/**
 * The root browser of one source: every archive of the installed game, or of
 * the installed League client, folded into one explorer.
 *
 * A tree reads the shape of the install and a grid reads the art in it, and
 * both draw the same location and the same selection. The bar's box reads the
 * open directory or the whole index, which its scope control says.
 */
export function GameDocument(props: EditorDocumentProps<ContentDocumentOf<"game">>) {
  return (
    <WadSourceProvider source={documentSource(props.document)}>
      <SourceDocument {...props} />
    </WadSourceProvider>
  );
}

function SourceDocument({ document, active }: EditorDocumentProps<ContentDocumentOf<"game">>) {
  const { nav, typing, setTyping, boxRef, handleKeyDown } = useExplorerShell(
    useExplorerId(),
    document.id,
  );

  return (
    <ExplorerSortScope documentId={document.id}>
      <DocumentFrame data-ui="GameDocument" onKeyDown={handleKeyDown}>
        <DocumentToolbar active={active}>
          <GameExplorerBar nav={nav} typing={typing} onTypingChange={setTyping} boxRef={boxRef} />
        </DocumentToolbar>
        <GameBody location={nav.location} onNavigate={nav.goTo} onUp={nav.goUp} />
      </DocumentFrame>
    </ExplorerSortScope>
  );
}

interface GameExplorerBarProps {
  nav: ReturnType<typeof useExplorerNav>;
  typing: boolean;
  onTypingChange: (typing: boolean) => void;
  boxRef: React.RefObject<HTMLInputElement | null>;
}

function GameExplorerBar({ nav, typing, onTypingChange, boxRef }: GameExplorerBarProps) {
  const explorerId = useExplorerId();
  const copy = sourceCopy(useWadSource());
  const view = useExplorerView();
  const filter = useExplorerFilter(explorerId);
  const setFilter = useSetExplorerFilter();
  const selection = useExplorerSelectionApi(explorerId, NO_ORDER);

  const renderSiblings = useCallback(
    (crumb: BreadcrumbItem) => (
      <CrumbSiblings path={crumb.id} onNavigate={nav.goTo} useChildDirs={useIndexChildDirs} />
    ),
    [nav.goTo],
  );

  return (
    <ExplorerBar
      crumbs={crumbsOf(copy.root, nav.location)}
      onNavigate={nav.goTo}
      onUp={nav.goUp}
      atRoot={nav.atRoot}
      renderSiblings={renderSiblings}
      useCompletions={useIndexCompletions}
      typing={typing}
      onTypingChange={onTypingChange}
      location={nav.location}
      view={view}
      filter={filter}
      onFilterChange={(next) => setFilter(explorerId, next)}
      box={<SearchField boxRef={boxRef} />}
      selection={selection.summary}
      onClearSelection={selection.clear}
      actions={
        <>
          <GameStats />
          <CollapseIndexAction />
          <ArchivesAction />
          <RebuildAction />
        </>
      }
    />
  );
}

/* The bar reads the selection's totals and never its order, so it asks for none.
   The views hold the order, because it is what they draw. */
const NO_ORDER: never[] = [];

interface GameBodyProps {
  location: string;
  onNavigate: (path: string) => void;
  onUp: () => void;
}

function GameBody({ location, onNavigate, onUp }: GameBodyProps) {
  const view = useExplorerView();
  const scope = useIndexScope();
  const pattern = useGameSearchPattern();

  if (scope === "whole" && pattern.length > 0) return <GameFindResults />;
  if (view !== "tree")
    return <GameIndexItems view={view} location={location} onDescend={onNavigate} onUp={onUp} />;
  return <GameIndexTree />;
}

/** Collapse all for whichever tree the body draws: the search results, or the index tree. */
function CollapseIndexAction() {
  const view = useExplorerView();
  const scope = useIndexScope();
  const pattern = useGameSearchPattern();
  const collapseAllGameDirs = useCollapseAllGameDirs();

  if (scope === "whole" && pattern.length > 0) return <CollapseFindAction />;
  if (view !== "tree") return null;

  return <CollapseAllButton onCollapse={collapseAllGameDirs} />;
}

function GameStats() {
  const { data } = useGameIndex();
  if (!data) return null;

  return (
    <span className="shrink-0 text-xs text-surface-400 select-none">
      {m.workshop_game_files_label({
        count: data.files,
        formatted: data.files.toLocaleString(),
      })}
      {" · "}
      {m.workshop_game_archives_label({
        count: data.archives,
        formatted: data.archives.toLocaleString(),
      })}
    </span>
  );
}

/* The tree folds the archives away, so the one route left to a single archive
   is the list this opens. */
function ArchivesAction() {
  const source = useWadSource();
  const copy = sourceCopy(source);
  const openDocument = useOpenDocument();

  return (
    <IconButton
      icon={<FilesIcon />}
      onClick={() => openDocument(gameWadsDocument(source))}
      aria-label={copy.wadsAction}
      tooltip={copy.wadsLabel}
    />
  );
}

/* The index is a snapshot of the install taken once a session, so a patch
   needs a way to say so. */
function RebuildAction() {
  const copy = sourceCopy(useWadSource());
  const rebuild = useRefreshGameIndex();

  return (
    <IconButton
      icon={<ArrowsClockwiseIcon className={rebuild.isPending ? "animate-spin" : undefined} />}
      onClick={() => rebuild.mutate()}
      disabled={rebuild.isPending}
      aria-label={copy.rebuildAction}
      tooltip={m.workshop_game_rebuild_label()}
    />
  );
}

/** The child directories of one path, for a crumb's caret. */
function useIndexChildDirs(path: string) {
  const { data } = useGameDir(path);
  return data?.dirs ?? null;
}

/** The directories under one path, for the typed path's completion. */
function useIndexCompletions(directory: string): readonly string[] {
  const { data } = useGameDir(directory);
  return useMemo(() => data?.dirs.map((dir) => dir.path) ?? [], [data]);
}

interface SearchFieldProps {
  boxRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * The one box, reading whatever the scope says.
 *
 * Whole game runs the index's own find, which ranks across every archive. This
 * folder narrows the rows already on screen, which costs no read at all.
 */
function SearchField({ boxRef }: SearchFieldProps) {
  const explorerId = useExplorerId();
  const copy = sourceCopy(useWadSource());
  const scope = useIndexScope();
  const setScope = useSetExplorerScope();
  const filter = useExplorerFilter(explorerId);
  const setFilter = useSetExplorerFilter();
  const pattern = useGameSearchPattern();
  const regex = useGameSearchRegex();
  const onPatternChange = useSetGameSearchPattern();
  const onRegexChange = useSetGameSearchRegex();

  const { data, error, isFetching } = useGameFind(pattern, regex);
  const counted = scope === "whole" && pattern.length > 0 && data && data.total > 0 && !error;

  useGameSearchRevealTarget(boxRef);

  const value = scope === "whole" ? pattern : filter.text;
  const onChange = (next: string) => {
    if (scope === "whole") onPatternChange(next);
    else setFilter(explorerId, { ...filter, text: next });
  };

  /* The text follows the scope, so a switch asks the same question wider or narrower. */
  const onScopeChange = (next: ExplorerScope) => {
    if (next === scope) return;

    setScope(explorerId, next);
    onPatternChange(next === "whole" ? value : "");
    setFilter(explorerId, { ...filter, text: next === "whole" ? "" : value });
  };

  return (
    <ExplorerSearchBox
      value={value}
      onChange={onChange}
      scope={scope}
      onScopeChange={onScopeChange}
      wholeLabel={copy.whole}
      /* The index is what a regex is worth writing against. A filter over the
         rows on screen matches a substring and nothing more. */
      regex={scope === "whole" ? { on: regex, onChange: onRegexChange } : undefined}
      inputRef={boxRef}
    >
      {counted && (
        <Count>
          <MatchCount result={data} />
        </Count>
      )}
      {scope === "whole" && isFetching && <Spinner size={12} className="shrink-0" />}
    </ExplorerSearchBox>
  );
}

/** What the find turned up, and how much of it the answer carries. */
export function MatchCount({ result }: { result: SearchHits<GameFindHit> }) {
  const formatted = result.total.toLocaleString();

  if (result.hits.length < result.total) {
    return m.workshop_game_matches_partial_label({
      count: result.total,
      formatted,
      shown: result.hits.length.toLocaleString(),
    });
  }

  return m.workshop_game_matches_label({ count: result.total, formatted });
}
/** The install's directories, read one level at a time as they open. */
export function GameIndexTree() {
  const source = useWadSource();
  const copy = sourceCopy(source);
  const explorerId = explorerIdOf(source);
  const filter = useExplorerFilter(explorerId);
  /* Opt-in, where the scoped browser opts out: a whole-game tree is too large
     to hold at once, so a directory is read when it is first opened. */
  const expanded = useExpandedGameDirs();
  const toggleDir = useToggleGameDir();
  const collapseDirTree = useCollapseGameDirTree();
  const collapseAllDirs = useCollapseAllGameDirs();
  const openFile = useSourcePreview();
  const previewFile = useSourceRowPreview();
  const sort = useExplorerSort();
  const reveal = useGameReveal();
  const settleReveal = useSettleGameReveal();

  const root = useGameDir("");
  const expandedPaths = useMemo(() => [...expanded].sort(), [expanded]);
  const listings = useGameDirs(expandedPaths);

  const tree = useMemo(() => {
    if (!root.data) return [];
    const all = new Map(listings);
    all.set("", root.data);
    const built = buildIndexTree(all, (path) => expanded.has(path));
    /* What is read, and no more. A directory nobody opened holds no rows here,
       so this narrows the tree on screen rather than answering for the install
       - which is what the whole-game scope is for. */
    return sortTree(filterTree(built, filter.text), sort);
  }, [root.data, listings, expanded, filter.text, sort]);

  const isExpanded = useCallback((node: SourceDirNode) => expanded.has(node.id), [expanded]);
  const rows = useMemo(() => flattenSourceTree(tree, isExpanded), [tree, isExpanded]);
  const order = useMemo(
    () => rows.map((row) => selectedOfNode(row.node)).filter(isPresent),
    [rows],
  );
  const selection = useExplorerSelectionApi(explorerId, order);

  const handleToggle = useCallback((node: SourceDirNode) => toggleDir(node.id), [toggleDir]);
  /* Each expanded directory here is a fetch, so an Alt+click expands one level
     and only the collapse reaches the whole subtree. */
  const handleToggleSubtree = useCallback(
    (node: SourceDirNode) => {
      if (expanded.has(node.id)) {
        collapseDirTree(node.id);
      } else {
        toggleDir(node.id);
      }
    },
    [expanded, collapseDirTree, toggleDir],
  );
  const targets = useCallback(
    () => selectionTargets(selection.selection, indexDirTargets),
    [selection.selection],
  );

  if (root.isPending) return <LoadingState />;
  if (root.isError) return <GameWadsErrorState error={root.error} />;
  if (root.data.dirs.length === 0 && root.data.files.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={m.workshop_game_empty_title()}
        description={copy.emptyDescription}
      />
    );
  }

  return (
    <>
      {holdsOnlyUnknown(root.data) && <UnknownHashHint />}
      <SourceTree
        rows={rows}
        ariaLabel={copy.filesTree}
        isExpanded={isExpanded}
        onToggle={handleToggle}
        onToggleSubtree={handleToggleSubtree}
        onCollapseAll={collapseAllDirs}
        onOpen={openFile}
        onPreview={previewFile}
        /* A shut row here holds no children yet, so the backend expands it
           through the index rather than the tree walking what it has. */
        dirTargets={(node) => [indexDirTarget(node.path)]}
        selection={selection}
        selectionTargets={targets}
        scrollKey={`${source}-index`}
        reveal={reveal}
        onRevealed={settleReveal}
      />
    </>
  );
}

interface GameIndexItemsProps {
  /** Which of the two item views draws, both of which read one directory. */
  view: "grid" | "details";
  location: string;
  onDescend: (path: string) => void;
  onUp: () => void;
}

/* The grid and the details list differ in how a row draws and in nothing that
   reaches the source, so one component reads the directory for both. */
function GameIndexItems({ view, location, onDescend, onUp }: GameIndexItemsProps) {
  const source = useWadSource();
  const explorerId = explorerIdOf(source);
  const here = useGameDir(location);
  const openFile = useSourcePreview();
  const previewFile = useSourceRowPreview();
  const filter = useExplorerFilter(explorerId);
  const sort = useExplorerSort();
  const tileSize = useExplorerTileSize();
  const thumbnails = useExplorerThumbnails();

  const items = useMemo(() => {
    if (!here.data) return [];
    return sortItems(filterItems(itemsOf(here.data), filter), sort);
  }, [here.data, filter, sort]);

  const order = useMemo(() => items.map(selectedOfItem), [items]);
  const selection = useExplorerSelectionApi(explorerId, order);

  const handleOpen = useCallback(
    (item: ExplorerFileItem) => openFile(fileNodeOf(item)),
    [openFile],
  );
  const handlePreview = useCallback(
    (item: ExplorerFileItem) => previewFile(fileNodeOf(item)),
    [previewFile],
  );

  const { run } = useExtractActions();
  const runSelection = useCallback(
    (how: ExtractHow) =>
      run(how, selectionTargets(selection.selection, indexDirTargets), selectionSubject(selection)),
    [run, selection],
  );

  const renderMenu = useCallback(
    (item: ExplorerItem | null) => (
      <SourceTreeContextMenu
        node={menuNodeOf(item)}
        onOpen={openFile}
        onRun={(_node, how) => runSelection(how)}
      />
    ),
    [openFile, runSelection],
  );

  if (here.isPending) return <LoadingState />;
  if (here.isError) return <GameWadsErrorState error={here.error} />;
  if (items.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={m.workshop_explorer_empty_title()}
        description={m.workshop_explorer_empty_description()}
      />
    );
  }

  const shared = {
    items,
    thumbnails,
    selection,
    ariaLabel: sourceCopy(source).filesTree,
    onDescend,
    onOpen: handleOpen,
    onPreview: handlePreview,
    onUp,
    assetOf: (item: ExplorerItem) => itemAsset(source, item),
    renderMenu,
    onRun: runSelection,
  };

  if (view === "details") return <ExplorerDetails {...shared} />;
  return <ExplorerGrid {...shared} size={tileSize} showFacts={tileSize >= 128} />;
}

const indexDirTargets = (path: string) => [indexDirTarget(path)];
