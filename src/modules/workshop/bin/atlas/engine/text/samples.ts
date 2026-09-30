import { labelOf } from "../model/layers";

/** The words an element's name holds, lowercase: `ItemCost_Text2` is `item`, `cost`, `text`. */
function wordsOf(name: string): string[] {
  const spaced = (_: string, before: string, after: string) => `${before} ${after}`;
  return name
    .replace(/([a-z0-9])([A-Z])/g, spaced)
    .replace(/([A-Z]+)([A-Z][a-z])/g, spaced)
    .split(/[^A-Za-z]+/)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

/**
 * What a text of each kind reads in a match, by the words its name holds. The first rule with a
 * word the name holds wins, so the narrower kinds come first.
 */
const SAMPLES: readonly (readonly [readonly string[], string])[] = [
  [["kda"], "5 / 2 / 7"],
  [["timer", "time", "cooldown", "cd", "duration", "respawn", "clock", "countdown"], "1:24"],
  [["percent", "percentage", "pct", "ratio"], "75%"],
  [["gold", "cost", "price", "currency", "rp", "be"], "1,250"],
  [["health", "hp", "mana", "mp", "energy", "shield", "resource", "xp", "exp"], "1,450 / 2,000"],
  [["level", "lvl", "rank"], "18"],
  [["kills", "deaths", "assists", "score", "cs", "minions"], "12"],
  [["stack", "stacks", "count", "charges", "ammo", "amount", "quantity", "num"], "3"],
  [["hotkey", "keybind", "key", "bind"], "Q"],
  [["champion", "champ"], "Ahri"],
  [["player", "summoner", "username", "user"], "Player"],
];

/** Words a name ends with that say it is a text, which a sample leaves off. */
const TEXT_SUFFIXES = new Set(["text", "txt", "label", "lbl", "string", "str", "value", "val"]);

/**
 * What a text the controller fills at run time reads in the preview: a sample of the kind its
 * name suggests, else its name in words.
 *
 * `label` is the element's `name` field, which a scene bin often writes as the whole object path,
 * and `path` its object path.
 */
export function sampleText(label: string, path: string | null, key: string): string {
  if (label === "" && path === null) return key;

  const words = wordsOf(labelOf(label, path, key));
  for (const [kinds, sample] of SAMPLES) {
    if (words.some((word) => kinds.includes(word))) return sample;
  }

  const named = words.filter((word, at) => at === 0 || !TEXT_SUFFIXES.has(word));
  if (named.length === 0) return key;
  const [first, ...rest] = named;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}
