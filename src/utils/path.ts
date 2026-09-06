/** The last segment of a path, whichever slash it uses, or the path when it has none. */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
