import type { BankUnitGroup } from "@/lib/tauri";

/** What a file of a bank unit contains, from its name. */
export type UnitFileKind = "eventBank" | "mediaBank" | "package";

/** Returns what the bank unit file at `path` contains: `.wpk`, `_events.bnk` or another `.bnk`. */
export function unitFileKind(path: string): UnitFileKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wpk")) return "package";
  if (lower.endsWith("_events.bnk")) return "eventBank";
  return "mediaBank";
}

/** Returns the part of `path` after its last `/` or `\`. */
export function fileName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

/** What the bank unit button of the toolbar names: the first unit name and the count of others. */
export interface UnitsTrigger {
  readonly name: string;
  /** The number of other distinct unit names. */
  readonly more: number;
}

/** Returns the label of the bank unit button for `units`, or null if no unit names the file. */
export function unitsTrigger(units: readonly BankUnitGroup[]): UnitsTrigger | null {
  const names = new Set(units.map((unit) => unit.name));
  const [name] = names;
  if (name === undefined) return null;

  return { name, more: names.size - 1 };
}
