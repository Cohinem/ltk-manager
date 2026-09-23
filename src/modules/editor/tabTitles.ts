/**
 * The titles more than one open document carries.
 *
 * A tab whose title is in this set names its layer after the title, per "Tab
 * titles across layers" in `docs/ux/PROJECT_EDITOR.md`. The comparison spans
 * every group rather than one strip. A split holds two a user reads at once.
 */
export function sharedTitles(titles: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();

  for (const title of titles) {
    if (seen.has(title)) shared.add(title);
    else seen.add(title);
  }

  return shared;
}

/** No title is shared, which is what a strip of one document holds. */
export const NO_SHARED_TITLES: ReadonlySet<string> = new Set<string>();
