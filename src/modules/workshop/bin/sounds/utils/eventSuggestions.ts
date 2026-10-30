import type { BinRow, ScopedEvents } from "@/lib/tauri";

import type { SuggestGroup } from "../../shared/components/SuggestInput";

/**
 * The properties that hold an event name: a clip event's, a VFX system's and an emitter audio's.
 * The names of `SOUND_TARGETS` in `crates/ltk-manager-audio/src/bin_audio.rs`.
 */
const SOUND_FIELDS: ReadonlySet<string> = new Set([
  "mSoundName",
  "soundOnCreateDefault",
  "soundPersistentDefault",
  "SoundOnCreate",
  "SoundPersistent",
]);

/** The group of the game's events past the scoped bank units. */
export const GAME_GROUP = "game";

/** The prefix of the group of one scoped bank unit, before the unit's name. */
const UNIT_GROUP = "unit:";

/** One event name that a sound field suggests. */
export interface EventSuggestion {
  readonly name: string;
  /** The field's current value is this name. */
  readonly current: boolean;
}

/** Returns `true` if `row` is a string property that holds an event name. */
export function isSoundField(row: BinRow): boolean {
  return (
    row.node === "property" &&
    !row.unnamed &&
    row.value.type === "string" &&
    SOUND_FIELDS.has(row.name)
  );
}

/** Returns the bank unit name of the group `group`, or null for the game's group. */
export function unitOfGroup(group: string): string | null {
  return group.startsWith(UNIT_GROUP) ? group.slice(UNIT_GROUP.length) : null;
}

/**
 * Returns the suggestion groups of a sound field whose value is `value`: a group per scoped
 * bank unit, then the game's matches of `query` that no unit lists.
 *
 * A query keeps the names that contain each of its whitespace-separated terms, without case. A
 * unit without a kept name is left out, and so is the game's group while there is no query.
 */
export function eventGroups(
  scoped: readonly ScopedEvents[],
  game: readonly string[],
  query: string | null,
  value: string,
): SuggestGroup<EventSuggestion>[] {
  const terms = query === null ? [] : query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (name: string) => {
    const lower = name.toLowerCase();
    return terms.every((term) => lower.includes(term));
  };
  const suggest = (name: string): EventSuggestion => ({ name, current: name === value });

  const listed = new Set<string>();
  const groups: SuggestGroup<EventSuggestion>[] = [];
  for (const unit of scoped) {
    const kept = unit.events.filter((name) => !listed.has(name) && matches(name));
    kept.forEach((name) => listed.add(name));
    if (kept.length > 0)
      groups.push({ value: `${UNIT_GROUP}${unit.unit}`, items: kept.map(suggest) });
  }

  /* The game's names answered an earlier query while the current one searches. */
  const others = game.filter((name) => !listed.has(name) && matches(name));
  if (query !== null && others.length > 0) {
    groups.push({ value: GAME_GROUP, items: others.map(suggest) });
  }
  return groups;
}
