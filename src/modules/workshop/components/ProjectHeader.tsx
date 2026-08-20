import type { WorkshopProject } from "@/lib/tauri";

import { NavigationArrows } from "../palette/NavigationArrows";
import { ProjectBar } from "../palette/ProjectBar";
import { ContentLayoutPopover } from "./ContentLayoutPopover";
import { ProjectActions } from "./ProjectActions";

interface ProjectHeaderProps {
  project: WorkshopProject;
}

/* The back arrow and the project name title are both gone. The bar took the
   name, the version tag and the route back to the workshop, so the two arrows
   beside it mean one thing. */

export function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <div data-ui="ProjectHeader" className="flex items-center gap-3 px-4 pt-2.5 pb-1.5 select-none">
      <NavigationArrows />

      <ProjectBar />

      {/* Layout is view-level, so it sits here once rather than in every leaf's tab strip. */}
      <ContentLayoutPopover />

      <ProjectActions project={project} />
    </div>
  );
}
