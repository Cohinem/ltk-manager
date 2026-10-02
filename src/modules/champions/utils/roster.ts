import type { Champion } from "@/lib/tauri";

/** A champion value folded for comparison, letters and digits in lowercase, as categorization folds it. */
export function championKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The install's champions, and what a value in a mod's metadata names among them. */
export interface ChampionRoster {
  readonly champions: readonly Champion[];
  /** The champion `value` names by its metadata name, ID or display name, in any case. */
  find(value: string): Champion | undefined;
  /** The key two values naming one champion share, such as `Wukong` and `monkeyking`. */
  keyOf(value: string): string;
  /** The name a reader sees for `value`, its champion's display name where it names one. */
  labelOf(value: string): string;
}

/** The roster over `champions`, where an earlier champion keeps a key two of them share. */
export function championRoster(champions: readonly Champion[]): ChampionRoster {
  const byKey = new Map<string, Champion>();
  for (const champion of champions) {
    for (const name of [champion.metadataName, champion.id, champion.name]) {
      if (name === null) continue;

      const key = championKey(name);
      if (!byKey.has(key)) byKey.set(key, champion);
    }
  }

  const find = (value: string) => byKey.get(championKey(value));

  return {
    champions,
    find,
    keyOf: (value) => {
      const champion = find(value);
      return championKey(champion?.metadataName ?? value);
    },
    labelOf: (value) => {
      const champion = find(value);
      return champion?.name ?? champion?.metadataName ?? value;
    },
  };
}

/** One row of a champion filter. */
export interface ChampionOption {
  /** What the rows of one champion share, per `ChampionRoster.keyOf`. */
  readonly key: string;
  /** What selecting the row stores. */
  readonly value: string;
  readonly label: string;
  /** Absent for a value no champion of the install answers to. */
  readonly champion?: Champion;
  /** The lowercased text a search matches against. */
  readonly search: string;
  /** A row adding a typed name that matches no other row. */
  readonly created?: boolean;
}

/**
 * Every champion of `roster`, and each of `values` that names none of them, one row per
 * champion and sorted by label.
 */
export function championOptions(
  roster: ChampionRoster,
  values: readonly string[],
): ChampionOption[] {
  const options = new Map<string, ChampionOption>();
  for (const champion of roster.champions) {
    const key = championKey(champion.metadataName);
    const label = champion.name ?? champion.metadataName;
    const search = `${label} ${champion.id} ${champion.metadataName}`.toLowerCase();

    if (!options.has(key)) {
      options.set(key, { key, value: champion.metadataName, label, champion, search });
    }
  }

  for (const value of values) {
    const key = roster.keyOf(value);
    if (!options.has(key)) {
      options.set(key, { key, value, label: value, search: value.toLowerCase() });
    }
  }

  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** The rows `values` select among `options`, one per champion, each keeping its value as written. */
export function selectedOptions(
  roster: ChampionRoster,
  options: readonly ChampionOption[],
  values: readonly string[],
): ChampionOption[] {
  const byKey = new Map(options.map((option) => [option.key, option]));
  const seen = new Set<string>();
  const rows: ChampionOption[] = [];

  for (const value of values) {
    const key = roster.keyOf(value);
    if (seen.has(key)) continue;

    seen.add(key);
    const option = byKey.get(key) ?? { key, value, label: value, search: value.toLowerCase() };
    rows.push({ ...option, value });
  }
  return rows;
}

/** A row adding `query` as typed, where it names none of `options`. */
export function createdOption(
  roster: ChampionRoster,
  options: readonly ChampionOption[],
  query: string,
): ChampionOption | null {
  const name = query.trim();
  const key = roster.keyOf(name);
  if (key === "" || options.some((option) => option.key === key)) return null;

  return { key: `created:${key}`, value: name, label: name, search: "", created: true };
}
