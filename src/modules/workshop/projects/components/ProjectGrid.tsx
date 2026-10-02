import { useCallback, useMemo } from "react";

import type { WorkshopProject } from "@/lib/tauri";

import { useProjectGridNav } from "../../hooks";
import { ProjectCard } from "./ProjectCard";

interface ProjectGridProps {
  projects: WorkshopProject[];
  onEdit: (project: WorkshopProject) => void;
}

export function ProjectGrid({ projects, onEdit }: ProjectGridProps) {
  const keys = useMemo(() => projects.map((project) => project.path), [projects]);
  const openAt = useCallback(
    (index: number) => {
      const project = projects[index];
      if (project) onEdit(project);
    },
    [projects, onEdit],
  );

  const { containerRef, focusedIndex, handleKeyDown, handleFocus } = useProjectGridNav({
    keys,
    onOpen: openAt,
  });

  return (
    <div
      ref={containerRef}
      data-ui="ProjectGrid"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-min-w,240px),var(--card-max-w,320px)))] justify-center gap-4"
    >
      {projects.map((project, index) => (
        <ProjectCard
          key={project.path}
          project={project}
          onEdit={onEdit}
          tabIndex={index === focusedIndex ? 0 : -1}
        />
      ))}
    </div>
  );
}
