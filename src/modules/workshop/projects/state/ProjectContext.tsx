import type { ReactNode } from "react";
import { createContext, use } from "react";

import type { WorkshopProject } from "@/lib/tauri";

const ProjectContext = createContext<WorkshopProject | null>(null);

/* The shell provides null on the workshop's own surface, so the header above the
   outlet is one tree across the two routes rather than a provider that appears. */

export function ProjectProvider({
  project,
  children,
}: {
  project: WorkshopProject | null;
  children: ReactNode;
}) {
  return <ProjectContext value={project}>{children}</ProjectContext>;
}

/**
 * The open project, for everything that cannot draw without one.
 *
 * Throws with no project open, because that is a caller placed wrong rather than
 * a state to handle. Anything the shell draws on both surfaces takes
 * `useOptionalProjectContext` instead.
 */
export function useProjectContext(): WorkshopProject {
  const project = use(ProjectContext);
  if (!project) {
    throw new Error("useProjectContext needs an open project, and the shell has none");
  }
  return project;
}

/** The open project, or null on the workshop's own surface. */
export function useOptionalProjectContext(): WorkshopProject | null {
  return use(ProjectContext);
}
