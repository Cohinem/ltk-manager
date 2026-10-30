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
