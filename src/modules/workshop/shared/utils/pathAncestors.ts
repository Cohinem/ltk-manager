/**
 * The directories above `path`, outermost first and the file itself left out.
 *
 * Every prefix, because the trees fold a run of single-child directories into
 * one row carrying the deepest path of the run. Whichever way a listing
 * folded, the row's own path is one of these.
 */
export function pathAncestors(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const out: string[] = [];
  for (let at = 1; at < segments.length; at += 1) {
    out.push(segments.slice(0, at).join("/"));
  }
  return out;
}
