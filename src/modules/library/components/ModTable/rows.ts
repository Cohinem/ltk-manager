import { type Grouping, groupItems } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod, LibraryFolder, ModHealthVerdict } from "@/lib/tauri";
import type { ChampionRoster } from "@/modules/champions";
import {
  type EffectiveCategories,
  getMapLabel,
  getTagLabel,
  healthRank,
} from "@/modules/library/utils";

import type { TableGroupBy } from "../../state";

/** A group heading in the table, over the mods filed under it. */
export interface GroupRow {
  type: "group";
  key: string;
  label: string;
  mods: InstalledMod[];
  expanded: boolean;
  /** The folder this group is, which owns a switch a derived group does not. */
  folder?: LibraryFolder;
  /** What the group files under, for the mark drawn beside its label. */
  value: string | null;
}

/** One mod's row. A mod filed under several groups has a row under each. */
export interface ModRow {
  type: "mod";
  key: string;
  mod: InstalledMod;
}

export type TableRow = GroupRow | ModRow;

/** What the derived groupings read beyond the mod itself. */
export interface GroupingContext {
  roster: ChampionRoster;
  effective: Map<string, EffectiveCategories>;
  verdicts: Record<string, ModHealthVerdict> | undefined;
  now: Date;
}

type DerivedGrouping = Grouping<InstalledMod, GroupingContext>;

const DAY_MS = 86_400_000;

function installedBucket(mod: InstalledMod, now: Date): string {
  const days = (now.getTime() - new Date(mod.installedAt).getTime()) / DAY_MS;
  if (days < 7) return "week";
  if (days < 31) return "month";
  if (days < 183) return "half-year";
  return "older";
}

const HEALTH_KEYS = ["broken", "repairable", "flagged", "healthy", "unchecked"] as const;

function healthKey(verdict: ModHealthVerdict | undefined): string {
  return ["unchecked", "healthy", "flagged", "repairable", "broken"][healthRank(verdict)];
}

const HEALTH_LABELS: Record<string, () => string> = {
  broken: m.library_table_health_broken_label,
  repairable: m.library_table_health_repairable_label,
  flagged: m.library_table_health_flagged_label,
  healthy: m.library_table_health_healthy_label,
  unchecked: m.library_table_health_unchecked_label,
};

const INSTALLED_LABELS: Record<string, () => string> = {
  week: m.library_table_installed_week_label,
  month: m.library_table_installed_month_label,
  "half-year": m.library_table_installed_half_year_label,
  older: m.library_table_installed_older_label,
};

const effectiveOf = (mod: InstalledMod, ctx: GroupingContext) => ctx.effective.get(mod.id);

const DERIVED: Record<Exclude<TableGroupBy, "none" | "folder">, DerivedGrouping> = {
  champion: {
    keys: (mod, ctx) => {
      const champions = effectiveOf(mod, ctx)?.champions ?? mod.champions;
      return [...new Set(champions.map((c) => ctx.roster.keyOf(c)))];
    },
    label: (key, ctx) => ctx.roster.labelOf(key),
    emptyLabel: m.common_table_group_no_champion_label,
  },
  map: {
    keys: (mod, ctx) => [...new Set(effectiveOf(mod, ctx)?.maps ?? mod.maps)],
    label: (key) => getMapLabel(key),
    emptyLabel: m.common_table_group_no_map_label,
  },
  tag: {
    keys: (mod, ctx) => [...new Set(effectiveOf(mod, ctx)?.tags ?? mod.tags)],
    label: (key) => getTagLabel(key),
    emptyLabel: m.common_table_group_no_tag_label,
  },
  author: {
    keys: (mod) => [...new Set(mod.authors)],
    label: (key) => key,
    emptyLabel: m.common_table_group_no_author_label,
  },
  health: {
    keys: (mod, ctx) => [healthKey(ctx.verdicts?.[mod.id])],
    label: (key) => HEALTH_LABELS[key](),
    order: [...HEALTH_KEYS],
  },
  enabled: {
    keys: (mod) => [mod.enabled ? "on" : "off"],
    label: (key) =>
      key === "on" ? m.library_table_group_on_label() : m.library_table_group_off_label(),
    order: ["on", "off"],
  },
  installed: {
    keys: (mod, ctx) => [installedBucket(mod, ctx.now)],
    label: (key) => INSTALLED_LABELS[key](),
    order: ["week", "month", "half-year", "older"],
  },
  format: {
    keys: (mod) => [mod.format],
    label: (key) =>
      key === "fantome"
        ? m.library_table_format_fantome_label()
        : m.library_table_format_modpkg_label(),
  },
  storage: {
    keys: (mod) => [mod.storage],
    label: (key) =>
      key === "project"
        ? m.library_mod_storage_project_label()
        : m.library_mod_storage_archive_label(),
  },
  license: {
    keys: (mod) => (mod.license ? [mod.license.name] : []),
    label: (key) => key,
    emptyLabel: m.library_table_group_no_license_label,
  },
};

interface BuildArgs {
  /** The mods to draw, already searched, filtered and sorted. */
  mods: InstalledMod[];
  groupBy: TableGroupBy;
  /** User folders in their stored order. */
  folders: LibraryFolder[];
  expandedFolders: Set<string>;
  collapsedGroups: Set<string>;
  /** Whether a search or a filter stands, which opens every group holding a match. */
  narrowed: boolean;
  context: GroupingContext;
}

/**
 * The table's rows, group headings included, in the order they are drawn.
 *
 * Per "Grouping" in docs/ux/LIBRARY.md.
 */
export function buildTableRows({
  mods,
  groupBy,
  folders,
  expandedFolders,
  collapsedGroups,
  narrowed,
  context,
}: BuildArgs): TableRow[] {
  if (groupBy === "none") {
    return mods.map((mod) => ({ type: "mod", key: mod.id, mod }));
  }

  const rows: TableRow[] = [];
  const pushGroup = (group: Omit<GroupRow, "type">) => {
    rows.push({ type: "group", ...group });
    if (!group.expanded) return;

    for (const mod of group.mods) {
      rows.push({ type: "mod", key: `${group.key}|${mod.id}`, mod });
    }
  };

  if (groupBy === "folder") {
    for (const folder of folders) {
      const inFolder = mods.filter((mod) => mod.folderId === folder.id);
      if (inFolder.length === 0) continue;

      pushGroup({
        key: `folder:${folder.id}`,
        label: folder.name,
        mods: inFolder,
        expanded: narrowed || expandedFolders.has(folder.id),
        folder,
        value: folder.id,
      });
    }

    const folderIds = new Set(folders.map((folder) => folder.id));
    for (const mod of mods) {
      if (mod.folderId && folderIds.has(mod.folderId)) continue;
      rows.push({ type: "mod", key: mod.id, mod });
    }
    return rows;
  }

  const groups = groupItems(mods, DERIVED[groupBy], {
    prefix: groupBy,
    ctx: context,
    collapsed: collapsedGroups,
    narrowed,
  });
  for (const { items, ...group } of groups) {
    pushGroup({ ...group, mods: items });
  }
  return rows;
}

/** Each mod once, in the order the table draws it, for ranges and Select all. */
export function orderedModIds(rows: TableRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.type === "mod") seen.add(row.mod.id);
  }
  return [...seen];
}
