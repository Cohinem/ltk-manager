import { useMemo } from "react";

import type { WorkshopProject } from "@/lib/tauri";

export interface WorkshopFilterOptions {
  tags: string[];
  champions: string[];
  maps: string[];
}

export function useWorkshopFilterOptions(projects: WorkshopProject[]): WorkshopFilterOptions {
  return useMemo(() => {
    const tags = new Set<string>();
    const champions = new Set<string>();
    const maps = new Set<string>();

    for (const project of projects) {
      for (const t of project.tags) tags.add(t);
      for (const c of project.champions) champions.add(c);
      for (const m of project.maps) maps.add(m);
    }

    return {
      tags: [...tags].sort(),
      champions: [...champions].sort(),
      maps: [...maps].sort(),
    };
  }, [projects]);
}
