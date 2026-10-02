import { type Grouping, groupItems } from "@/components";
import { m } from "@/i18n";
import type { WorkshopProject } from "@/lib/tauri";
import type { ChampionRoster } from "@/modules/champions";
import { getMapLabel, getTagLabel } from "@/modules/library";

import type { ProjectGroupBy } from "../../../state";

/** A group heading in the project table, over the projects filed under it. */
export interface ProjectGroupRow {
  type: "group";
  key: string;
  label: string;
  projects: WorkshopProject[];
  expanded: boolean;
  /** What the group files under, for the mark drawn beside its label. */
  value: string | null;
}

/** One project's row. A project filed under several groups has a row under each. */
export interface ProjectRow {
  type: "project";
  key: string;
  project: WorkshopProject;
}

export type ProjectTableRow = ProjectGroupRow | ProjectRow;

const GROUPINGS: Record<
  Exclude<ProjectGroupBy, "none">,
  Grouping<WorkshopProject, ChampionRoster>
> = {
  location: {
    keys: (project) => [project.location],
    label: (key) =>
      key === "opened"
        ? m.workshop_filter_location_opened_label()
        : m.workshop_folder_workshop_label(),
    order: ["workshop", "opened"],
  },
  champion: {
    keys: (project, roster) => [...new Set(project.champions.map((c) => roster.keyOf(c)))],
    label: (key, roster) => roster.labelOf(key),
    emptyLabel: m.common_table_group_no_champion_label,
  },
  map: {
    keys: (project) => [...new Set(project.maps)],
    label: (key) => getMapLabel(key),
    emptyLabel: m.common_table_group_no_map_label,
  },
  tag: {
    keys: (project) => [...new Set(project.tags)],
    label: (key) => getTagLabel(key),
    emptyLabel: m.common_table_group_no_tag_label,
  },
  author: {
    keys: (project) => [...new Set(project.authors.map((author) => author.name))],
    label: (key) => key,
    emptyLabel: m.common_table_group_no_author_label,
  },
};

interface BuildArgs {
  /** The projects to draw, already searched, filtered and sorted. */
  projects: WorkshopProject[];
  groupBy: ProjectGroupBy;
  collapsedGroups: Set<string>;
  /** Whether a search or a filter stands, which opens every group holding a match. */
  narrowed: boolean;
  roster: ChampionRoster;
}

/** The project table's rows, group headings included, in the order they are drawn. */
export function buildProjectRows({
  projects,
  groupBy,
  collapsedGroups,
  narrowed,
  roster,
}: BuildArgs): ProjectTableRow[] {
  if (groupBy === "none") {
    return projects.map((project) => ({ type: "project", key: project.path, project }));
  }

  const rows: ProjectTableRow[] = [];
  const groups = groupItems(projects, GROUPINGS[groupBy], {
    prefix: groupBy,
    ctx: roster,
    collapsed: collapsedGroups,
    narrowed,
  });

  for (const { items, ...group } of groups) {
    rows.push({ type: "group", ...group, projects: items });
    if (!group.expanded) continue;

    for (const project of items) {
      rows.push({ type: "project", key: `${group.key}|${project.path}`, project });
    }
  }
  return rows;
}

/** Each project once, in the order the table draws it, for ranges and Select all. */
export function orderedProjectPaths(rows: ProjectTableRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.type === "project") seen.add(row.project.path);
  }
  return [...seen];
}
