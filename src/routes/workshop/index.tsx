import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useHotkeys } from "react-hotkeys-hook";

import { ErrorState, LoadingState } from "@/components";
import { m } from "@/i18n";
import type { WorkshopProject } from "@/lib/tauri";
import { useSettings } from "@/modules/settings";
import {
  MissingProjects,
  NoProjectsState,
  NoSearchResultsState,
  ProjectGrid,
  ProjectTable,
  useFilteredProjects,
  useFolderDrop,
  useHasActiveWorkshopFilters,
  useOpenFolder,
  useWorkshopProjects,
  useWorkshopSearchQuery,
  useWorkshopSelectionStore,
  useWorkshopTestState,
  useWorkshopViewMode,
  WorkshopStartPage,
} from "@/modules/workshop";

export const Route = createFileRoute("/workshop/")({
  component: WorkshopIndex,
});

function WorkshopIndex() {
  const navigate = useNavigate();
  const { data: projects, isLoading, error } = useWorkshopProjects();
  const { data: settings } = useSettings();
  const openFolder = useOpenFolder();
  const searchQuery = useWorkshopSearchQuery();
  const filteredProjects = useFilteredProjects();
  const hasActiveFilters = useHasActiveWorkshopFilters();
  const viewMode = useWorkshopViewMode();

  const selectAll = useWorkshopSelectionStore((s) => s.selectAll);

  /* Gated with the button it doubles for, or the key would rewrite a selection
     a running session was started over. */
  const testState = useWorkshopTestState();
  useFolderDrop((path) => void openFolder.openPath(path), testState.kind === "idle");

  useHotkeys("ctrl+a", () => selectAll(filteredProjects.map((p) => p.path)), {
    preventDefault: true,
    enabled: testState.kind === "idle",
  });

  function handleEditProject(project: WorkshopProject) {
    navigate({ to: "/workshop/$projectId", params: { projectId: project.id } });
  }

  const ready = !isLoading && !error && filteredProjects.length > 0;
  if (ready && viewMode === "table") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ProjectTable projects={filteredProjects} onEdit={handleEditProject} />
        <div className="shrink-0 px-4 pb-4 empty:hidden">
          <MissingProjects />
        </div>
      </div>
    );
  }

  function renderContent() {
    if (isLoading) return <LoadingState className="h-64" />;
    if (error) return <ErrorState error={error} title={m.workshop_projects_error_title()} />;
    if (!settings?.workshopPath && projects?.length === 0) return <WorkshopStartPage />;
    if (filteredProjects.length === 0) {
      if (searchQuery || hasActiveFilters) return <NoSearchResultsState />;
      return (
        <>
          <NoProjectsState />
          <MissingProjects />
        </>
      );
    }
    return (
      <>
        <ProjectGrid projects={filteredProjects} onEdit={handleEditProject} />
        <MissingProjects />
      </>
    );
  }

  return <div className="h-full overflow-auto p-6">{renderContent()}</div>;
}
