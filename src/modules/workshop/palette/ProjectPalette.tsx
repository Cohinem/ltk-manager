import { useCallback, useMemo } from "react";

import { m } from "@/i18n";

import { useProjectContext } from "../components/ProjectContext";
import { type ContentDocument, previewDocument } from "../documents/contentDocument";
import {
  useOpenDocument,
  useOpenDocumentBeside,
  useOpenDocumentTab,
  useRecentDocumentIds,
  useRevealInTree,
  useRevealObject,
  useSelectedLayerName,
} from "../state";
import { barPlaceholder } from "./barMode";
import { useOpenProject } from "./projectRows";
import { type PaletteBranchProps, ResultsPalette } from "./ResultsPalette";
import { parseQuery, PROJECT_SOURCES } from "./sources";
import type { OpenIntent, PaletteRowData, PaletteTarget } from "./types";
import { useGameRows } from "./useGameRows";
import { useObjectRows } from "./useObjectRows";
import { usePaletteSearch } from "./usePaletteSearch";
import { useProjectCandidates } from "./useProjectCandidates";

/** The bar's palette under a project: its tabs, its files, its strings, the game and its objects. */
export function ProjectPalette(props: PaletteBranchProps) {
  const { query, scope, onClose } = props;

  const parsed = useMemo(() => parseQuery(query, scope), [query, scope]);
  const candidates = useProjectCandidates();
  const selectedLayer = useSelectedLayerName();
  const recent = useRecentDocumentIds();

  /* The two sources that cross IPC, so each is asked for on its own and folded
     in wherever its group sits. */
  const wantsGame = !parsed.help && (parsed.scope === null || parsed.scope === "game");
  const game = useGameRows(parsed.term, wantsGame);
  const wantsObjects = !parsed.help && (parsed.scope === null || parsed.scope === "objects");
  const objects = useObjectRows(parsed.term, query, wantsObjects);
  const ranked = useMemo(() => ({ game, objects }), [game, objects]);

  const project = useProjectContext();
  const labels = useMemo(
    () => ({ projectObjects: m.workshop_objects_project_label({ project: project.displayName }) }),
    [project.displayName],
  );

  const groups = usePaletteSearch({
    parsed,
    sources: PROJECT_SOURCES,
    candidates,
    ranked,
    labels,
    selectedLayer,
    recent,
  });

  const run = useRunTarget(onClose);

  return (
    <ResultsPalette
      {...props}
      parsed={parsed}
      groups={groups}
      placeholder={barPlaceholder("palette", true, scope)}
      run={run}
    />
  );
}

/** A target that opens a tab, which is every one but a command and a prefix. */
type OpeningTarget = Extract<
  PaletteTarget,
  { kind: "document" | "layerFile" | "gameChunk" | "object" | "layerObject" }
>;

/**
 * The tab a row opens, built at the moment it is chosen.
 *
 * A file of a layer and a chunk of the game each name their asset rather than
 * carrying a built document, because a project of a few thousand files and an
 * install of eight hundred thousand build one row apiece. An object opens the
 * file that declares it, the same tab a file row of the same side opens.
 */
function documentFor(target: OpeningTarget, projectPath: string): ContentDocument {
  if (target.kind === "document") return target.document;
  if (target.kind === "gameChunk" || target.kind === "object") {
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
  const openProject = useOpenProject();
  const reveal = useRevealInTree();
  const revealObject = useRevealObject();

  return useCallback(
    ({ target }: PaletteRowData, intent: OpenIntent) => {
      /* Both keep the palette open, and the results palette runs them itself. */
      if (target.kind === "prefix" || target.kind === "query") return;

      close();

      if (target.kind === "command") {
        target.command.run();
        return;
      }

      /* The one row that leaves this editor rather than opening into it, which
         is what the crumb's own source is for. */
      if (target.kind === "project") {
        openProject(target.name);
        return;
      }

      const document = documentFor(target, project.path);
      if (intent === "beside") openBeside(document);
      else if (intent === "permanent") openDocument(document);
      else openTab(document);

      /* Only a file of the project has a tree standing open beside the editor
         to scroll. The game browser opens on its own. */
      if (target.kind === "layerFile" || target.kind === "layerObject") {
        reveal(target.layerName, target.path);
      }

      /* The tab is keyed on the file. A second hit in an open file re-targets that tab. */
      if (target.kind === "object" || target.kind === "layerObject") {
        revealObject(document.id, target.objectHash);
      }
    },
    [close, openBeside, openDocument, openProject, openTab, project.path, reveal, revealObject],
  );
}
