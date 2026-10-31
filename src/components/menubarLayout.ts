/**
 * Returns how many leading titles of a menu bar fit in `available` pixels.
 *
 * `titles` holds the width of each title in bar order, and `overflow` the width of the overflow
 * menu that holds the titles left out.
 */
export function fittingMenuCount(
  available: number,
  titles: readonly number[],
  overflow: number,
): number {
  const total = titles.reduce((sum, width) => sum + width, 0);
  if (total <= available) return titles.length;

  let used = overflow;
  let count = 0;
  for (const width of titles) {
    if (used + width > available) break;

    used += width;
    count += 1;
  }

  return count;
}
