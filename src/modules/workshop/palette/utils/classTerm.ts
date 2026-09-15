/** The key the objects source reads a class term under. */
const CLASS_KEY = "class:";

/** The `class:` term of a query, cut away from the rest of it. */
export interface ClassTerm {
  /** What follows the colon: a name prefix, a hash, or nothing. */
  readonly value: string;
  /** Whether the term was the last one typed. */
  readonly last: boolean;
  /** The other terms, joined by one space. */
  readonly rest: string;
}

/**
 * The class term of `term`, or null when it holds none.
 *
 * The first whitespace-separated token opening with the key, in any case.
 * The rule the backend's `ClassTerm::split` reads the install's query by.
 */
export function splitClassTerm(term: string): ClassTerm | null {
  const tokens = term.split(/\s+/).filter((token) => token.length > 0);
  const at = tokens.findIndex((token) => token.toLowerCase().startsWith(CLASS_KEY));
  if (at < 0) return null;

  return {
    value: tokens[at]!.slice(CLASS_KEY.length),
    last: at + 1 === tokens.length,
    rest: tokens.filter((_, index) => index !== at).join(" "),
  };
}

/**
 * `query` with its last `class:` term replaced by `className`, ready for a path term.
 *
 * Everything else in the query stays as typed. A query holding no class term
 * gains one at its end.
 */
export function completeClassTerm(query: string, className: string): string {
  const completed = `${CLASS_KEY}${className} `;

  const term = lastClassTerm(query);
  if (term === null) {
    if (query.length === 0 || /\s$/.test(query)) return `${query}${completed}`;
    return `${query} ${completed}`;
  }

  const [start, end] = term;
  return `${query.slice(0, start)}${completed}${query.slice(end).trimStart()}`;
}

/** Where the last `class:` token of `query` sits, as `[start, end)`, or null for none. */
function lastClassTerm(query: string): [number, number] | null {
  let found: [number, number] | null = null;
  for (const token of query.matchAll(/\S+/g)) {
    if (token[0].toLowerCase().startsWith(CLASS_KEY)) {
      found = [token.index, token.index + token[0].length];
    }
  }
  return found;
}
