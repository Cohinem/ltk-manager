import type { CharacterSpell } from "@/lib/tauri";

/** The character segment of a named character object. */
export function characterOf(path: string): string | null {
  const [root, character] = path.split("/");
  if (root.toLowerCase() !== "characters" || !character) return null;
  return character;
}

export interface SpellGroup {
  readonly name: string | null;
  readonly spells: readonly CharacterSpell[];
}

/** Path groups of the matching spells, preserving the catalog's natural order. */
export function spellGroups(spells: readonly CharacterSpell[], filter: string): SpellGroup[] {
  const wanted = filter.trim().toLowerCase();
  const groups = new Map<string | null, { name: string | null; spells: CharacterSpell[] }>();
  for (const spell of spells) {
    if (!spell.name.toLowerCase().includes(wanted)) continue;
    const key = spell.group?.toLowerCase() ?? null;
    let group = groups.get(key);
    if (group === undefined) {
      group = { name: spell.group, spells: [] };
      groups.set(key, group);
    }
    group.spells.push(spell);
  }
  return [...groups.values()];
}
