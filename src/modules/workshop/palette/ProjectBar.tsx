import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  CommandPalette,
  Kbd,
  type PaletteGroupModel,
  type PaletteSelectModifiers,
} from "@/components";
import { useClickOutside } from "@/hooks";

import { useProjectContext } from "../components/ProjectContext";
import { type ContentDocument, previewDocument } from "../documents/contentDocument";
import { useRevealGameSearch } from "../gameBrowser";
import {
  useOpenDocument,
  useOpenDocumentBeside,
  useOpenDocumentTab,
  useRecentDocumentIds,
  useRevealInTree,
  useSelectedLayerName,
} from "../state";
import { paletteSource, prefixScope } from "./sources";
import type { OpenIntent, PaletteRowData, PaletteSourceId, PaletteTarget } from "./types";
import { useProjectSearch } from "./useProjectSearch";

/** A window twice as wide does not want a search box twice as wide. */
const MAX_WIDTH = 720;

const PLACEHOLDER = "Search this project, its strings, the commands and the game";

/**
 * The header's middle: the project's identity, and the route to everything in it.
 *
 * Idle it names the project and holds the crumb back to the workshop. `Ctrl+P`
 * or a click turns it into the search box, and the results drop below it at the
 * bar's own width.
 */
export function ProjectBar() {
  const project = useProjectContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<PaletteSourceId | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedLayer = useSelectedLayerName();
  const recent = useRecentDocumentIds();
  const { parsed, groups } = useProjectSearch({
    enabled: open,
    query,
    scope,
    selectedLayer,
    recent,
  });

  /* The idle bar is unmounted while the palette is up, so its trigger has no
     element to focus until the close has rendered. */
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    triggerRef.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    restoreFocus.current = true;
    setOpen(false);
    setQuery("");
    setScope(null);
  }, []);

  const openWith = useCallback((next: PaletteSourceId | null) => {
    setQuery("");
    setScope(next);
    setOpen(true);
  }, []);

  useClickOutside(boxRef, close, open);
  useHotkeys("ctrl+p, ctrl+k", () => openWith(null), {
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys("ctrl+shift+p", () => openWith("commands"), {
    preventDefault: true,
    enableOnFormTags: true,
  });

  /* The bar owns the routes into a search, and the full search is one of them.
     The game document keeps the box, so the key only has to reveal it. */
  const revealGameSearch = useRevealGameSearch();
  useHotkeys("ctrl+shift+f", revealGameSearch, {
    preventDefault: true,
    enableOnFormTags: true,
  });

  const runTarget = useRunTarget(close);

  const byId = useMemo(() => {
    const map = new Map<string, PaletteRowData>();
    for (const group of groups) {
      for (const row of group.rows) map.set(row.row.id, row.row);
    }
    return map;
  }, [groups]);

  const rowGroups = useMemo<PaletteGroupModel[]>(
    () =>
      groups.map((group) => ({
        id: group.source,
        label: group.label,
        total: group.total,
        pending: group.pending,
        rows: group.rows.map((row) => ({
          id: row.row.id,
          name: row.row.name,
          nameRanges: row.nameRanges,
          path: row.row.path.length > 0 ? row.row.path : undefined,
          pathRanges: row.pathRanges,
          trailing: row.row.trailing,
          icon: row.row.icon,
          disabled: row.row.disabled,
        })),
      })),
    [groups],
  );

  function handleQueryChange(next: string) {
    const prefixed = scope === null ? prefixScope(next) : null;
    if (prefixed) {
      setScope(prefixed);
      setQuery(next.slice(1));
      return;
    }
    setQuery(next);
  }

  function handleSelect(rowId: string, modifiers: PaletteSelectModifiers) {
    const candidate = byId.get(rowId);
    if (!candidate) return;

    if (candidate.target.kind === "prefix") {
      openWith(candidate.source);
      return;
    }

    runTarget(candidate, intentOf(modifiers));
  }

  function handleScopeTo(rowId: string) {
    const candidate = byId.get(rowId);
    if (!candidate) return;

    setScope(candidate.source);
    /* The prefixes are the query while `?` lists them, so a scope taken from
       one of those rows leaves nothing behind to match on. */
    if (parsed.help) setQuery("");
  }

  return (
    <>
      {/* Positioned against `main`, the one positioned ancestor above this, so
          the scrim covers the editor and leaves the title bar alone. */}
      {open && (
        <div role="presentation" className="absolute inset-0 z-40 bg-scrim" onMouseDown={close} />
      )}

      <div className="flex min-w-0 flex-1 justify-center">
        <div
          ref={boxRef}
          data-ui="ProjectBar"
          className="relative h-8 w-full"
          style={{ maxWidth: MAX_WIDTH }}
        >
          {!open && (
            <IdleBar
              ref={triggerRef}
              displayName={project.displayName}
              version={project.version}
              onOpen={() => openWith(null)}
            />
          )}

          {open && (
            <div className="absolute inset-x-0 top-0 z-50">
              <CommandPalette
                query={query}
                onQueryChange={handleQueryChange}
                placeholder={PLACEHOLDER}
                scope={scope === null ? undefined : paletteSource(scope).label}
                onScopeRemove={() => setScope(null)}
                onScopeTo={handleScopeTo}
                groups={rowGroups}
                onSelect={handleSelect}
                onClose={close}
                emptyMessage={`No match for “${parsed.term}”`}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface IdleBarProps {
  displayName: string;
  version: string;
  onOpen: () => void;
  ref: React.Ref<HTMLButtonElement>;
}

/* The crumb sits beside the trigger rather than inside it, because a control
   that opens the palette cannot also hold a link to somewhere else. */
function IdleBar({ displayName, version, onOpen, ref }: IdleBarProps) {
  return (
    <div className="flex h-full w-full items-center gap-1.5 rounded-md border border-surface-600 bg-surface-900 pl-2.5 transition-colors hover:border-accent-hover">
      <MagnifyingGlassIcon weight="bold" className="h-4 w-4 shrink-0 text-surface-400" />

      <Link
        to="/workshop"
        className="shrink-0 rounded-sm px-0.5 text-xs text-surface-400 transition-colors hover:text-surface-100"
      >
        Workshop
      </Link>
      <span className="shrink-0 text-xs text-surface-500">/</span>

      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={`Search ${displayName}`}
        aria-keyshortcuts="Control+P"
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-r-md pr-2 pl-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-accent-500"
      >
        <span className="truncate text-sm font-medium text-surface-100">{displayName}</span>
        <span className="shrink-0 rounded-full bg-surface-700 px-2 py-0.5 text-[0.6875rem] text-surface-400">
          v{version}
        </span>
        <Kbd shortcut="Ctrl+P" className="ml-auto shrink-0 opacity-60" />
      </button>
    </div>
  );
}

function intentOf(modifiers: PaletteSelectModifiers): OpenIntent {
  if (modifiers.ctrlKey) return "beside";
  if (modifiers.altKey) return "permanent";
  return "default";
}

/** A target that opens a tab, which is every one but a command and a prefix. */
type OpeningTarget = Extract<PaletteTarget, { kind: "document" | "layerFile" | "gameChunk" }>;

/**
 * The tab a row opens, built at the moment it is chosen.
 *
 * A file of a layer and a chunk of the game each name their asset rather than
 * carrying a built document, because a project of a few thousand files and an
 * install of eight hundred thousand build one row apiece.
 */
function documentFor(target: OpeningTarget, projectPath: string): ContentDocument {
  if (target.kind === "document") return target.document;
  if (target.kind === "gameChunk") {
    return previewDocument(
      { kind: "gameChunk", wad: target.wad, pathHash: target.pathHash },
      target.path.length > 0 ? target.path : undefined,
    );
  }
  return previewDocument({
    kind: "layer",
    project: projectPath,
    layer: target.layerName,
    path: target.path,
  });
}

/** Turns the chosen row into the open, or the mutation, that it stands for. */
function useRunTarget(close: () => void) {
  const project = useProjectContext();
  const openTab = useOpenDocumentTab();
  const openDocument = useOpenDocument();
  const openBeside = useOpenDocumentBeside();
  const reveal = useRevealInTree();

  return useCallback(
    ({ target }: PaletteRowData, intent: OpenIntent) => {
      /* A prefix row narrows the box rather than leaving it, so it is the one
         target that must not close first. */
      if (target.kind === "prefix") return;

      close();

      if (target.kind === "command") {
        target.command.run();
        return;
      }

      if (intent === "beside") openBeside(documentFor(target, project.path));
      else if (intent === "permanent") openDocument(documentFor(target, project.path));
      else openTab(documentFor(target, project.path));

      /* Only a file of the project has a tree standing open beside the editor
         to scroll. The game browser opens on its own. */
      if (target.kind === "layerFile") reveal(target.layerName, target.path);
    },
    [close, openBeside, openDocument, openTab, project.path, reveal],
  );
}
