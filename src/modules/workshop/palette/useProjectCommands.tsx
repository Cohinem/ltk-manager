import {
  ArrowsClockwiseIcon,
  FileArchiveIcon,
  FilesIcon,
  FolderOpenIcon,
  GearSixIcon,
  LayoutIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  PlayIcon,
  SidebarSimpleIcon,
  SquareSplitHorizontalIcon,
  SquareSplitVerticalIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { LeagueIcon, PlayerTitleIcon } from "@/components";
import { useLayerPanelOpen, useSetLayerPanelOpen } from "@/stores";

import { useProjectActions } from "../api/useProjectActions";
import { useWorkshopTestState } from "../api/useWorkshopTestState";
import { useProjectContext } from "../components/ProjectContext";
import { detailsDocument, gameDocument, gameWadsDocument } from "../documents";
import { useRefreshGameIndex, useRevealGameSearch } from "../gameBrowser";
import {
  useActiveDocumentId,
  useActiveLeafId,
  useOpenDocument,
  useResetLayout,
  useSplitWithDocument,
} from "../state";
import type { ProjectCommand } from "./types";

const GLYPH = "h-4 w-4";

/**
 * Every action the project bar can run, composed out of the modules' own hooks.
 *
 * A command closes over the real mutation rather than over a copy of it, so
 * nothing registers into a global table at import time and a command that needs
 * project state reads it the way every other panel does.
 */
export function useProjectCommands(): readonly ProjectCommand[] {
  const project = useProjectContext();
  const navigate = useNavigate();

  const actions = useProjectActions(project);
  const testState = useWorkshopTestState(project);
  const refreshGameIndex = useRefreshGameIndex();

  const openDocument = useOpenDocument();
  const resetLayout = useResetLayout();
  const splitWithDocument = useSplitWithDocument();
  const activeDocumentId = useActiveDocumentId();
  const activeLeafId = useActiveLeafId();

  const layerPanelOpen = useLayerPanelOpen();
  const setLayerPanelOpen = useSetLayerPanelOpen();
  const revealGameSearch = useRevealGameSearch();

  const refresh = refreshGameIndex.mutate;
  const layerCount = project.layers.length;

  return useMemo<readonly ProjectCommand[]>(() => {
    const testable = testState.kind === "idle";

    return [
      {
        id: "project.test",
        title: "Test the project",
        group: "Project",
        keywords: ["run", "patch", "launch"],
        icon: <PlayIcon weight="bold" className={GLYPH} />,
        enabled: testable && layerCount > 0,
        disabledReason: layerCount === 0 ? "No layers" : "The patcher is busy",
        run: actions.handleTestProject,
      },
      {
        id: "project.pack",
        title: "Pack the project",
        group: "Project",
        keywords: ["export", "build", "modpkg", "fantome"],
        icon: <PackageIcon weight="bold" className={GLYPH} />,
        enabled: layerCount > 0,
        disabledReason: "No layers",
        run: actions.handleOpenPackDialog,
      },
      {
        id: "project.reveal",
        title: "Open the project folder",
        group: "Project",
        keywords: ["explorer", "reveal", "directory"],
        icon: <FolderOpenIcon className={GLYPH} />,
        run: actions.handleOpenLocation,
      },
      {
        id: "project.delete",
        title: "Delete the project",
        group: "Project",
        keywords: ["remove"],
        icon: <TrashIcon className={GLYPH} />,
        run: actions.handleOpenDeleteDialog,
      },

      {
        id: "go.details",
        title: "Open mod details",
        group: "Go to",
        keywords: ["metadata", "authors", "version", "thumbnail"],
        icon: <PlayerTitleIcon className={GLYPH} />,
        run: () => openDocument(detailsDocument()),
      },
      {
        id: "go.game",
        title: "Open the game index",
        group: "Go to",
        keywords: ["browse", "install", "assets"],
        icon: <LeagueIcon className={GLYPH} />,
        run: () => openDocument(gameDocument()),
      },
      {
        id: "go.gameWads",
        title: "Open the game WADs",
        group: "Go to",
        keywords: ["archives", "browse"],
        icon: <FileArchiveIcon className={GLYPH} />,
        run: () => openDocument(gameWadsDocument()),
      },

      {
        id: "view.splitRight",
        title: "Split right",
        group: "View",
        keywords: ["group", "pane", "side"],
        icon: <SquareSplitHorizontalIcon className={GLYPH} />,
        enabled: activeDocumentId !== null,
        disabledReason: "Nothing open",
        run: () => {
          if (activeDocumentId) splitWithDocument(activeDocumentId, activeLeafId, "right");
        },
      },
      {
        id: "view.splitDown",
        title: "Split down",
        group: "View",
        keywords: ["group", "pane", "below", "bottom"],
        icon: <SquareSplitVerticalIcon className={GLYPH} />,
        enabled: activeDocumentId !== null,
        disabledReason: "Nothing open",
        run: () => {
          if (activeDocumentId) splitWithDocument(activeDocumentId, activeLeafId, "bottom");
        },
      },
      {
        id: "view.resetLayout",
        title: "Reset the layout",
        group: "View",
        keywords: ["merge", "groups", "panes"],
        icon: <LayoutIcon className={GLYPH} />,
        run: resetLayout,
      },
      {
        id: "view.toggleSidebar",
        title: layerPanelOpen ? "Hide the layers explorer" : "Show the layers explorer",
        group: "View",
        keywords: ["sidebar", "panel"],
        icon: <SidebarSimpleIcon weight="bold" className={GLYPH} />,
        run: () => setLayerPanelOpen(!layerPanelOpen),
      },

      {
        id: "game.find",
        title: "Search the game files",
        group: "Game",
        shortcut: "Ctrl+Shift+F",
        keywords: ["find", "grep", "regex", "wad"],
        icon: <MagnifyingGlassIcon weight="bold" className={GLYPH} />,
        run: revealGameSearch,
      },
      {
        id: "game.rebuildIndex",
        title: "Rebuild the game index",
        group: "Game",
        keywords: ["rescan", "refresh", "wad"],
        icon: <ArrowsClockwiseIcon className={GLYPH} />,
        run: () => refresh(),
      },

      {
        id: "settings.open",
        title: "Open settings",
        group: "Settings",
        shortcut: "Ctrl+,",
        keywords: ["preferences", "options"],
        icon: <GearSixIcon className={GLYPH} />,
        run: () => void navigate({ to: "/settings" }),
      },
      {
        id: "settings.projects",
        title: "Open the workshop",
        group: "Settings",
        shortcut: "Ctrl+2",
        keywords: ["projects", "list", "back"],
        icon: <FilesIcon className={GLYPH} />,
        run: () => void navigate({ to: "/workshop" }),
      },
    ];
  }, [
    actions,
    activeDocumentId,
    activeLeafId,
    layerCount,
    layerPanelOpen,
    navigate,
    openDocument,
    refresh,
    resetLayout,
    revealGameSearch,
    setLayerPanelOpen,
    splitWithDocument,
    testState.kind,
  ]);
}
