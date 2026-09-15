/**
 * The name comparator every workshop file listing sorts by.
 *
 * Some listings sort here and some arrive sorted from the backend, so this
 * mirrors `compare_names` in `crates/ltk-manager-core/src/utils/natural_order.rs`.
 * Change one and the other's `naturalOrder.fixture.json` test fails.
 */

/** Whether a UTF-16 code unit is an ASCII digit. */
function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/** Fold an ASCII upper-case code unit, leaving everything else alone. */
function foldCase(code: number): number {
  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
}

function trimLeadingZeros(digits: string): string {
  let first = 0;
  while (first < digits.length && digits.charCodeAt(first) === 0x30) first += 1;
  return digits.slice(first);
}

/**
 * Order two file names the way a file explorer does.
 *
 * A run of digits compares as a number, so `skin9` precedes `skin50`. Letters
 * compare without regard to case. Names that differ only in the padding of a
 * number, or only in case, fall back to code unit order, which keeps this a
 * total order.
 *
 * `Intl.Collator` cannot stand in for this. It resolves to the host locale, so
 * two machines would disagree, and `sensitivity: "base"` calls names that differ
 * only in case equal, which leaves their order to however the sort found them.
 */
export function compareNames(a: string, b: string): number {
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (isDigit(a.charCodeAt(i)) && isDigit(b.charCodeAt(j))) {
      const aStart = i;
      const bStart = j;
      while (i < a.length && isDigit(a.charCodeAt(i))) i += 1;
      while (j < b.length && isDigit(b.charCodeAt(j))) j += 1;

      const aDigits = trimLeadingZeros(a.slice(aStart, i));
      const bDigits = trimLeadingZeros(b.slice(bStart, j));
      /* Longer is larger once the padding is off, so this reads the two runs as
      numbers without parsing one that would overflow. */
      if (aDigits.length !== bDigits.length) return aDigits.length - bDigits.length;
      if (aDigits !== bDigits) return aDigits < bDigits ? -1 : 1;
      continue;
    }

    const aFolded = foldCase(a.charCodeAt(i));
    const bFolded = foldCase(b.charCodeAt(j));
    if (aFolded !== bFolded) return aFolded - bFolded;
    i += 1;
    j += 1;
  }

  const remaining = a.length - i - (b.length - j);
  if (remaining !== 0) return remaining;
  return a < b ? -1 : a > b ? 1 : 0;
}
