/** The milliseconds without a key after which the next key starts a new text. */
export const TYPE_AHEAD_IDLE_MS = 700;

/** A key that types into a name: a letter, a digit, `_` of an event name, `#` of an unnamed ID. */
const NAME_KEY = /^[A-Za-z0-9_#]$/;

/** The text typed on a list, and the time of its last key. */
export interface TypedText {
  readonly text: string;
  readonly at: number;
  /** `true` if the row that the text selected may still answer, as `TypeAheadSearch` reads it. */
  readonly keep: boolean;
}

/** The modifier and key state of a press that `typedText` reads. */
interface TypedKey {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * Returns the text that `press` at `now` types after `typed`.
 *
 * A key within `TYPE_AHEAD_IDLE_MS` of the last one extends the text, and a later key starts a new
 * one. A run of one letter stays that letter and moves on from the selected row, so it cycles the
 * rows that start with it. Returns null for a key that types no name, or one held with Ctrl, Meta
 * or Alt.
 */
export function typedText(typed: TypedText | null, press: TypedKey, now: number): TypedText | null {
  if (press.ctrlKey || press.metaKey || press.altKey || !NAME_KEY.test(press.key)) return null;

  const letter = press.key.toLowerCase();
  const fresh = typed === null || now - typed.at > TYPE_AHEAD_IDLE_MS;
  if (fresh) return { text: letter, at: now, keep: false };

  if (typed.text === letter) return { text: letter, at: now, keep: false };

  return { text: typed.text + letter, at: now, keep: true };
}

/** What splits a label into the words that a typed text may start. */
const WORD_BREAK = /[^a-z0-9]+/;

/** The options of `typeAheadMatch`. */
export interface TypeAheadSearch {
  /** `true` if the row at `from` may answer, as it does while the reader extends the text. */
  readonly keep?: boolean;
}

/**
 * Returns the index of the row that typed `text` selects among `labels`, searching after `from`.
 *
 * The search wraps at the end. A label that starts with the text wins over one that holds a word
 * that starts with it, such as `death` in `Play_sfx_Rumble_Death3D`. Returns null if no label
 * matches.
 */
export function typeAheadMatch(
  labels: readonly string[],
  text: string,
  from: number,
  { keep = false }: TypeAheadSearch = {},
): number | null {
  const wanted = text.toLowerCase();
  const order = Array.from(
    { length: labels.length },
    (_, step) => (from + step + (keep ? 0 : 1) + labels.length) % labels.length,
  );
  const lower = (at: number) => labels[at]?.toLowerCase() ?? "";

  const starts = order.find((at) => lower(at).startsWith(wanted));
  if (starts !== undefined) return starts;

  const word = order.find((at) =>
    lower(at)
      .split(WORD_BREAK)
      .some((each) => each.startsWith(wanted)),
  );
  return word ?? null;
}
