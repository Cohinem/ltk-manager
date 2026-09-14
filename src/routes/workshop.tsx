import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Toolbar } from "@/components";
import { useSettings } from "@/modules/settings";
import {
  NotConfiguredState,
  ProjectProvider,
  useNewProjectDialog,
  useRecordListVisit,
  useWorkshopProjects,
  WorkshopActiveFilterChips,
  WorkshopDialogs,
  WorkshopHeader,
} from "@/modules/workshop";
import { twMerge } from "@/utils";

export const Route = createFileRoute("/workshop")({
  component: WorkshopLayout,
});

function WorkshopLayout() {
  const { data: settings } = useSettings();
  const workshopConfigured = !!settings?.workshopPath;

  if (!workshopConfigured) {
    return <NotConfiguredState />;
  }

  return <WorkshopShell />;
}

/* The header sits above the outlet, so the route resolves the project rather
   than the page under it, and provides null where there is none. */
function WorkshopShell() {
  const { projectName } = useParams({ strict: false });
  const { data: projects } = useWorkshopProjects();
  const project = projects?.find((candidate) => candidate.name === projectName) ?? null;

  const openNewProjectDialog = useNewProjectDialog((s) => s.open);
  useHotkeys("ctrl+n", () => openNewProjectDialog(), { preventDefault: true });

  /* The route rather than the resolved project, which arrives a frame late and
     would record a grid the user never stood on. A document records itself. */
  const recordListVisit = useRecordListVisit();
  useEffect(() => {
    if (projectName === undefined) recordListVisit();
  }, [projectName, recordListVisit]);

  return (
    <ProjectProvider project={project}>
      <div
        data-ui="WorkshopShell"
        className={twMerge(
          "flex h-full flex-col",
          projectName !== undefined
            ? "border border-b-0 border-surface-700/50 bg-surface-900"
            : "bg-surface-900 shadow-pressed",
        )}
      >
        <Toolbar
          className={twMerge("bg-surface-900", projectName === undefined && "bg-transparent pt-2")}
        >
          <WorkshopHeader />
          {!project && <WorkshopActiveFilterChips />}
        </Toolbar>

        <div data-ui="WorkshopShell:fold" className={twMerge("min-h-0 flex-1 overflow-hidden")}>
          <Outlet />
        </div>
      </div>

      <WorkshopDialogs />
    </ProjectProvider>
  );
}
