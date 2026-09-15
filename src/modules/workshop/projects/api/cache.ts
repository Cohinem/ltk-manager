import { type QueryClient } from "@tanstack/react-query";

import { type WorkshopProject } from "@/lib/tauri";

import { workshopKeys } from "../../shared/api/keys";

/** Put a freshly made project at the front of the list. */
export function addProject(client: QueryClient, created: WorkshopProject): void {
  client.setQueryData<WorkshopProject[]>(workshopKeys.projects(), (old) =>
    old ? [created, ...old] : [created],
  );
}

/** Write one project back into both the list and its own entry. */
export function replaceProject(client: QueryClient, updated: WorkshopProject): void {
  client.setQueryData<WorkshopProject[]>(workshopKeys.projects(), (old) =>
    old?.map((project) => (project.path === updated.path ? updated : project)),
  );
  client.setQueryData(workshopKeys.project(updated.path), updated);
}
