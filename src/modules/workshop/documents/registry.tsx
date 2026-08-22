import { FileArchiveIcon, FilesIcon, TranslateIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { LeagueIcon, PlayerTitleIcon } from "@/components";
import type { EditorRegistry } from "@/modules/editor";

import { LayerGlyph } from "../components/LayerGlyph";
import { useProjectContext } from "../components/ProjectContext";
import {
  archiveTarget,
  chunkTarget,
  ExtractMenuItems,
  fileKindFromPath,
  GameDocument,
  GameWadDocument,
  GameWadsDocument,
  useExtractActions,
  wadBasename,
} from "../gameBrowser";
import { assetPath, PreviewDocument } from "../preview";
import { describeFileKind } from "../utils/fileKindIcon";
import { type ContentDocument, type ContentDocumentOf, layerTitle } from "./contentDocument";
import { DetailsDocument } from "./DetailsDocument";
import { FilesDocument } from "./FilesDocument";
import { StringsDocument } from "./StringsDocument";

/** The editors the content surface can open, tab labels included. */
export function useContentEditors(): EditorRegistry<ContentDocument> {
  const project = useProjectContext();

  return useMemo(
    () => ({
      details: {
        icon: () => <PlayerTitleIcon className="h-4 w-4 shrink-0 text-doc-details-text" />,
        label: () => ({ title: "Mod details", path: project.path }),
        component: DetailsDocument,
      },
      files: {
        icon: (document) => <LayerGlyph layerName={document.layerName} className="h-4 w-4" />,
        label: (document) => ({
          title: layerTitle(project, document.layerName),
          path: `${project.path}/content/${document.layerName}`,
        }),
        component: FilesDocument,
      },
      strings: {
        icon: () => <TranslateIcon className="h-4 w-4 shrink-0 text-doc-strings-text" />,
        label: (document) => ({
          title: document.locale,
          context: layerTitle(project, document.layerName),
        }),
        component: StringsDocument,
      },
      game: {
        icon: () => <LeagueIcon className="h-4 w-4 shrink-0 text-doc-game-text" />,
        label: () => ({ title: "Game index" }),
        component: GameDocument,
      },
      "game-wads": {
        icon: () => <FilesIcon className="h-4 w-4 shrink-0 text-doc-game-text" />,
        label: () => ({ title: "Game WADs" }),
        component: GameWadsDocument,
      },
      "game-wad": {
        icon: () => <FileArchiveIcon className="h-4 w-4 shrink-0 text-doc-game-text" />,
        label: (document) => ({
          title: wadBasename(document.wadName),
          path: document.wadName,
        }),
        component: GameWadDocument,
        tabMenu: (document) => <GameWadTabMenu wadName={document.wadName} />,
      },
      preview: {
        icon: (document) => <PreviewGlyph title={document.title} />,
        label: (document) => ({
          title: document.title,
          context: document.context,
          /* A tab restored from a file written before the field existed derives
             one, which costs the resolved chunk path and nothing else. */
          path: document.path ?? assetPath(document.asset),
        }),
        component: PreviewDocument,
        tabMenu: (document) => {
          /* A layer file and a loose file are on disk already, so only a game
             chunk has anywhere to go. */
          if (document.asset.kind !== "gameChunk") return null;
          return <PreviewTabMenu document={document} />;
        },
      },
    }),
    [project],
  );
}

/* A right click on the tab is the route to the whole archive that the tab's
   own tree cannot carry: the archive level is the tab, so no row stands for it. */
function GameWadTabMenu({ wadName }: { wadName: string }) {
  const { run } = useExtractActions();

  return (
    <ExtractMenuItems onRun={(how) => run(how, [archiveTarget(wadName)], wadBasename(wadName))} />
  );
}

/* The same three the tree offers, on the tab of the chunk already open. */
function PreviewTabMenu({ document }: { document: ContentDocumentOf<"preview"> }) {
  const { run } = useExtractActions();
  const target = chunkTarget(document.asset, document.path);
  if (!target) return null;

  return <ExtractMenuItems onRun={(how) => run(how, [target], document.title)} />;
}

/** The tree row's own glyph, so a preview tab reads like the row that opened it. */
function PreviewGlyph({ title }: { title: string }) {
  const descriptor = describeFileKind(fileKindFromPath(title));
  const Icon = descriptor.icon;

  return (
    <span className="shrink-0" style={{ color: `var(${descriptor.tintToken})` }}>
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}
